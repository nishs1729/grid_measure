/**
 * imageLoader.js — File picker, thumbnail generation, image list management
 */

import state, { createImageState, addImage, removeImage, selectImage, getSelectedImage } from './state.js';
import { timestamp, showNotice } from './util.js';

const THUMB_SIZE = 80;

/**
 * Initialize the image loader: Add Images button, drag-and-drop, and paste.
 *
 * @param {Function} onUpdate — callback to re-render the full UI
 */
export function initImageLoader(onUpdate) {
  const addBtn = document.getElementById('add-images-btn');
  const fileInput = document.getElementById('file-input');

  addBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    // Reset input so re-selecting the same files triggers change
    fileInput.value = '';
    await addFiles(files, onUpdate);
  });

  initDropTargets(onUpdate);
  initPaste(onUpdate);
}

/**
 * Load image files into the app. Non-image files are ignored; files that fail to
 * decode (e.g. TIFF outside Safari) are reported in an on-screen notice.
 * The first newly added image becomes the selected image.
 *
 * @param {Iterable<File>} files
 * @param {Function} onUpdate
 */
export async function addFiles(files, onUpdate) {
  const all = Array.from(files);
  const images = all.filter(isImageFile);
  const ignored = all.filter((f) => !isImageFile(f));
  const failed = [];
  let firstNewId = null;

  for (const file of images) {
    try {
      const { imageElement, thumbnailDataUrl } = await loadImageFile(file);
      const imgState = createImageState(file, imageElement, thumbnailDataUrl);
      addImage(imgState);
      firstNewId ??= imgState.id;
    } catch (err) {
      console.error(`Failed to load ${file.name}:`, err);
      failed.push(file.name);
    }
  }

  const problems = [];
  if (failed.length > 0) {
    problems.push(`Could not decode ${listNames(failed)} — this browser may not support the format (TIFF usually only works in Safari).`);
  }
  if (ignored.length > 0) {
    problems.push(`Ignored non-image file${ignored.length !== 1 ? 's' : ''}: ${listNames(ignored.map((f) => f.name))}.`);
  }
  if (problems.length > 0) showNotice(problems.join(' '), 'error', 10000);

  if (firstNewId) selectImage(firstNewId);
  onUpdate();
}

/**
 * Image by MIME type, or by extension when the OS reports no type.
 */
function isImageFile(file) {
  return file.type.startsWith('image/') || (!file.type && /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name));
}

/**
 * Comma-separated list of names, truncated after `max` entries.
 */
function listNames(names, max = 5) {
  const shown = names.slice(0, max).join(', ');
  return names.length > max ? `${shown} and ${names.length - max} more` : shown;
}

/**
 * Accept dropped image files on the canvas area and the left sidebar.
 */
function initDropTargets(onUpdate) {
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

  for (const id of ['canvas-wrapper', 'left-sidebar']) {
    const el = document.getElementById(id);
    if (!el) continue;

    el.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      el.classList.add('drop-active');
    });
    el.addEventListener('dragleave', (e) => {
      // Ignore leave events fired when moving between child elements
      if (!el.contains(e.relatedTarget)) el.classList.remove('drop-active');
    });
    el.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      el.classList.remove('drop-active');
      addFiles(e.dataTransfer.files, onUpdate);
    });
  }

  // A drop that misses the targets must not make the browser navigate to the file
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());
}

/**
 * Accept images pasted from the clipboard. Clipboard images are all named
 * "image.png", so they are renamed pasted_<timestamp>_<n>.<ext> to stay unique in the CSV.
 */
function initPaste(onUpdate) {
  document.addEventListener('paste', (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const blobs = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (blobs.length === 0) return;

    e.preventDefault();
    const ts = timestamp();
    const files = blobs.map((blob, i) => {
      const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      return new File([blob], `pasted_${ts}_${i + 1}.${ext}`, { type: blob.type });
    });
    addFiles(files, onUpdate);
  });
}

/**
 * Load an image file and generate a thumbnail.
 *
 * @param {File} file
 * @returns {Promise<{imageElement: HTMLImageElement, thumbnailDataUrl: string}>}
 */
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const thumbnailDataUrl = generateThumbnail(img);
      resolve({ imageElement: img, thumbnailDataUrl });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load image: ${file.name}`));
    };
    img.src = url;
  });
}

/**
 * Generate a small thumbnail data URL from a loaded Image element.
 */
function generateThumbnail(img) {
  const canvas = document.createElement('canvas');
  const aspect = img.naturalWidth / img.naturalHeight;
  if (aspect >= 1) {
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE / aspect;
  } else {
    canvas.height = THUMB_SIZE;
    canvas.width = THUMB_SIZE * aspect;
  }
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

/**
 * Render the image list in the left sidebar.
 *
 * @param {Function} onUpdate — callback to re-render the full UI
 */
export function renderImageList(onUpdate) {
  const container = document.getElementById('image-list');
  container.innerHTML = '';

  renderProgress();

  for (const img of state.images) {
    const isSelected = img.id === state.selectedImageId;
    const pointCount = img.points.length;
    const calibrated = img.calibration.homography != null;

    // Determine border color from calibration status
    let borderClass = '';
    if (pointCount >= 4 && !calibrated) borderClass = 'border-red';
    else if (pointCount >= 5) borderClass = 'border-green';
    else if (pointCount >= 1) borderClass = 'border-yellow';

    const item = document.createElement('div');
    item.className = `thumb-item ${isSelected ? 'selected' : ''} ${borderClass}`;
    item.dataset.imageId = img.id;

    // Built with DOM APIs (not innerHTML) so file names are never parsed as HTML
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'thumb-img-wrapper';

    const thumbImg = document.createElement('img');
    thumbImg.setAttribute('src', img.thumbnailDataUrl);
    thumbImg.setAttribute('alt', img.name);

    const delBtn = document.createElement('button');
    delBtn.className = 'thumb-delete';
    delBtn.setAttribute('title', 'Remove image');
    delBtn.textContent = '×';

    imgWrapper.append(thumbImg, delBtn);

    const info = document.createElement('div');
    info.className = 'thumb-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'thumb-name';
    nameEl.setAttribute('title', img.name);
    nameEl.textContent = truncateName(img.name, 18);

    const countEl = document.createElement('span');
    countEl.className = 'thumb-count';
    countEl.textContent = `${pointCount} pt${pointCount !== 1 ? 's' : ''}`;

    info.append(nameEl, countEl);
    item.append(imgWrapper, info);

    // Select image on click
    item.addEventListener('click', (e) => {
      if (e.target.closest('.thumb-delete')) return;
      selectImage(img.id);
      onUpdate();
    });

    // Delete image
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Remove "${img.name}" and its point data?`)) {
        removeImage(img.id);
        onUpdate();
      }
    });

    container.appendChild(item);
  }
}

/**
 * "<calibrated>/<total> calibrated" summary under the Add Images button.
 */
function renderProgress() {
  const el = document.getElementById('image-progress');
  if (!el) return;
  const total = state.images.length;
  const calibrated = state.images.filter((img) => img.calibration.homography != null).length;
  el.hidden = total === 0;
  el.textContent = `${calibrated}/${total} calibrated`;
  el.classList.toggle('complete', total > 0 && calibrated === total);
}

function truncateName(name, maxLen) {
  if (name.length <= maxLen) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0 && name.length - ext <= 5) {
    const base = name.substring(0, ext);
    const extension = name.substring(ext);
    const available = maxLen - extension.length - 1;
    if (available > 3) {
      return base.substring(0, available) + '…' + extension;
    }
  }
  return name.substring(0, maxLen - 1) + '…';
}

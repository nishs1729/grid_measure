/**
 * imageLoader.js — File picker, thumbnail generation, image list management
 */

import state, { createImageState, addImage, removeImage, selectImage, getSelectedImage } from './state.js';

const THUMB_SIZE = 80;

/**
 * Initialize the image loader: bind the Add Images button and file input.
 *
 * @param {Function} onUpdate — callback to re-render the full UI
 */
export function initImageLoader(onUpdate) {
  const addBtn = document.getElementById('add-images-btn');
  const fileInput = document.getElementById('file-input');

  addBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const { imageElement, thumbnailDataUrl } = await loadImageFile(file);
        const imgState = createImageState(file, imageElement, thumbnailDataUrl);
        addImage(imgState);
      } catch (err) {
        console.error(`Failed to load ${file.name}:`, err);
      }
    }

    // Reset input so re-selecting the same files triggers change
    fileInput.value = '';
    onUpdate();
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

  for (const img of state.images) {
    const isSelected = img.id === state.selectedImageId;
    const pointCount = img.points.length;

    // Determine border color based on point count
    let borderClass = '';
    if (pointCount >= 5) borderClass = 'border-green';
    else if (pointCount >= 1) borderClass = 'border-yellow';

    const item = document.createElement('div');
    item.className = `thumb-item ${isSelected ? 'selected' : ''} ${borderClass}`;
    item.dataset.imageId = img.id;

    item.innerHTML = `
      <div class="thumb-img-wrapper">
        <img src="${img.thumbnailDataUrl}" alt="${img.name}" />
        <button class="thumb-delete" title="Remove image">&times;</button>
      </div>
      <div class="thumb-info">
        <span class="thumb-name" title="${img.name}">${truncateName(img.name, 18)}</span>
        <span class="thumb-count">${pointCount} pt${pointCount !== 1 ? 's' : ''}</span>
      </div>
    `;

    // Select image on click
    item.addEventListener('click', (e) => {
      if (e.target.closest('.thumb-delete')) return;
      selectImage(img.id);
      onUpdate();
    });

    // Delete image
    const delBtn = item.querySelector('.thumb-delete');
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

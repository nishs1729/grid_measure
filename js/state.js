/**
 * state.js — Central application state store
 *
 * Each image maintains its own independent set of points and calibration data.
 * Switching images never loses unsaved point data.
 */

let _nextId = 1;

const state = {
  /** @type {Array<ImageState>} */
  images: [],

  /** @type {string|null} */
  selectedImageId: null,

  /** Drag state for point repositioning */
  drag: {
    active: false,
    pointIndex: -1,
    imageId: null,
  },

  /** Index of point hovered in sidebar or on canvas (-1 = none) */
  hoveredPointIndex: -1,

  /** Grid unit size in physical units (e.g., mm). null = not set */
  gridUnitSize: null,

  /** Physical unit label */
  gridUnitLabel: 'mm',
};

/**
 * @typedef {Object} PointData
 * @property {string} label
 * @property {number} pixelX
 * @property {number} pixelY
 * @property {number|null} gridX
 * @property {number|null} gridY
 */

/**
 * @typedef {Object} ImageState
 * @property {string} id
 * @property {File} file
 * @property {string} name
 * @property {HTMLImageElement} imageElement
 * @property {number} width
 * @property {number} height
 * @property {string} thumbnailDataUrl
 * @property {Array<PointData>} points
 * @property {{ homography: Float64Array|null }} calibration
 */

/**
 * Create a new image state entry.
 */
export function createImageState(file, imageElement, thumbnailDataUrl) {
  return {
    id: `img_${_nextId++}`,
    file,
    name: file.name,
    imageElement,
    width: imageElement.naturalWidth,
    height: imageElement.naturalHeight,
    thumbnailDataUrl,
    points: [],
    calibration: { homography: null },
  };
}

export function addImage(imageState) {
  state.images.push(imageState);
  if (!state.selectedImageId) {
    state.selectedImageId = imageState.id;
  }
}

export function removeImage(id) {
  state.images = state.images.filter((img) => img.id !== id);
  if (state.selectedImageId === id) {
    state.selectedImageId = state.images.length > 0 ? state.images[0].id : null;
  }
}

export function selectImage(id) {
  state.selectedImageId = id;
  state.hoveredPointIndex = -1;
  state.drag.active = false;
}

export function getSelectedImage() {
  return state.images.find((img) => img.id === state.selectedImageId) || null;
}

export function getImageById(id) {
  return state.images.find((img) => img.id === id) || null;
}

export default state;

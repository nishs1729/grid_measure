import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import state, { createImageState, addImage, removeImage, selectImage, selectNextImage, selectPrevImage, getSelectedImage } from '../../js/state.js';
import { addPoint, movePoint, deleteLastPoint, resetPoints, recalibrate, findPointNear, getStatusMessage } from '../../js/points.js';
import { FIXTURES, gridToPixel, assertClose, assertPointClose } from '../helpers/geometry.js';

const UNIT = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

function newImage(name = 'straight.png') {
  const { width, height } = FIXTURES[name] ?? { width: 800, height: 600 };
  return createImageState({ name }, { naturalWidth: width, naturalHeight: height }, '');
}

/** Place P1–P4 at the true pixels of the unit square in a fixture */
function calibrate(fixture = 'straight.png') {
  for (const g of state.calibDst) {
    const p = gridToPixel(fixture, g.x, g.y);
    addPoint(p.x, p.y);
  }
}

beforeEach(() => {
  state.images = [];
  state.selectedImageId = null;
  state.selectedPointIndex = -1;
  state.calibDst = UNIT.map((p) => ({ ...p }));
  addImage(newImage());
});

test('P1–P3 have fixed grid coords and no calibration yet', () => {
  const img = getSelectedImage();
  addPoint(100, 500);
  addPoint(150, 500);
  addPoint(150, 450);
  assert.equal(img.calibration.homography, null);
  assert.deepEqual(img.points.map((p) => [p.label, p.gridX, p.gridY]), [['P1', 0, 0], ['P2', 1, 0], ['P3', 1, 1]]);
  assert.match(getStatusMessage(), /P4/);
});

test('P4 computes calibration; P5 gets true grid coordinates', () => {
  calibrate();
  const img = getSelectedImage();
  assert.ok(img.calibration.homography);
  const p = gridToPixel('straight.png', 3.5, -1.25);
  const p5 = addPoint(p.x, p.y);
  assertPointClose({ x: p5.gridX, y: p5.gridY }, { x: 3.5, y: -1.25 }, 1e-9);
  assert.match(getStatusMessage(), /Calibration complete/);
});

test('moving a calibration point updates every measurement point', () => {
  calibrate();
  const img = getSelectedImage();
  addPoint(300, 300);
  const before = { x: img.points[4].gridX, y: img.points[4].gridY };
  // Stretch the calibration square to 2 cells wide: P2 and P3 move 50 px right
  movePoint(1, 200, 500);
  movePoint(2, 200, 450);
  assert.notDeepEqual({ x: img.points[4].gridX, y: img.points[4].gridY }, before);
  assertClose(img.points[4].gridX, 2, 1e-9); // (300 − 100) / 100 px per unit
  assertClose(img.points[4].gridY, 4, 1e-9); // y scale unchanged: (500 − 300) / 50
});

test('moving a measurement point updates only its own coordinates', () => {
  calibrate();
  const img = getSelectedImage();
  addPoint(200, 400);
  const H = img.calibration.homography;
  movePoint(4, 250, 400);
  assert.equal(img.calibration.homography, H);
  assertPointClose({ x: img.points[4].gridX, y: img.points[4].gridY }, { x: 3, y: 2 }, 1e-9);
});

test('collinear calibration points → no calibration and a warning', () => {
  const img = getSelectedImage();
  for (const x of [100, 200, 300]) addPoint(x, 100);
  addPoint(100, 300);
  assert.equal(img.calibration.homography, null);
  assert.match(getStatusMessage(), /Calibration failed/);
});

test('deleting below 4 points clears calibration; selection cleared when its point goes', () => {
  calibrate();
  const img = getSelectedImage();
  addPoint(300, 300);
  state.selectedPointIndex = 4;
  deleteLastPoint();
  assert.equal(state.selectedPointIndex, -1);
  assert.ok(img.calibration.homography);
  deleteLastPoint();
  assert.equal(img.calibration.homography, null);
  assert.equal(img.points.length, 3);
});

test('selection survives deleting a later point', () => {
  calibrate();
  addPoint(300, 300);
  state.selectedPointIndex = 1;
  deleteLastPoint();
  assert.equal(state.selectedPointIndex, 1);
});

test('reset clears points, calibration and selection', () => {
  calibrate();
  state.selectedPointIndex = 2;
  resetPoints();
  const img = getSelectedImage();
  assert.equal(img.points.length, 0);
  assert.equal(img.calibration.homography, null);
  assert.equal(state.selectedPointIndex, -1);
  assert.match(getStatusMessage(), /P1/);
});

test('status line shows the selected point and nudge keys', () => {
  calibrate();
  state.selectedPointIndex = 2;
  assert.match(getStatusMessage(), /^P3 selected .*arrows nudge/);
});

test('custom calibration destinations are used and recalibrate works', () => {
  state.calibDst = UNIT.map((p) => ({ x: p.x * 10, y: p.y * 10 }));
  for (const g of state.calibDst) {
    const p = gridToPixel('straight.png', g.x, g.y);
    addPoint(p.x, p.y);
  }
  const img = getSelectedImage();
  const p = gridToPixel('straight.png', 4, 6);
  const p5 = addPoint(p.x, p.y);
  assertPointClose({ x: p5.gridX, y: p5.gridY }, { x: 4, y: 6 }, 1e-9);
  recalibrate(img);
  assertPointClose({ x: img.points[4].gridX, y: img.points[4].gridY }, { x: 4, y: 6 }, 1e-9);
});

test('findPointNear picks the nearest point within the threshold', () => {
  addPoint(100, 100);
  addPoint(110, 100);
  assert.equal(findPointNear(104, 100, 12), 0);
  assert.equal(findPointNear(107, 100, 12), 1);
  assert.equal(findPointNear(200, 200, 12), -1);
});

test('image navigation stops at the ends; selecting resets per-image UI state', () => {
  addImage(newImage('tilted.png'));
  addImage(newImage('small.png'));
  const [a, b, c] = state.images;
  assert.equal(state.selectedImageId, a.id);
  assert.equal(selectPrevImage(), false);
  state.selectedPointIndex = 3;
  state.hoveredPointIndex = 2;
  assert.equal(selectNextImage(), true);
  assert.equal(state.selectedImageId, b.id);
  assert.equal(state.selectedPointIndex, -1);
  assert.equal(state.hoveredPointIndex, -1);
  selectNextImage();
  assert.equal(selectNextImage(), false);
  assert.equal(state.selectedImageId, c.id);
  selectImage(a.id);
  assert.equal(state.selectedImageId, a.id);
});

test('removing the selected image selects the first remaining one', () => {
  addImage(newImage('tilted.png'));
  const [a, b] = state.images;
  selectImage(b.id);
  removeImage(b.id);
  assert.equal(state.selectedImageId, a.id);
  removeImage(a.id);
  assert.equal(state.selectedImageId, null);
});

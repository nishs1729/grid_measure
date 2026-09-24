import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeader,
  buildRow,
  csvEscape,
  rowsToCsv,
  parseCsv,
  isGridMeasureHeader,
  mergeCsv,
  appendedFileName,
  getMaxMeasurementPoints,
  measurementPointsInHeader,
} from '../../js/csvFormat.js';
import { timestamp } from '../../js/util.js';

const UNIT = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const SETTINGS = { gridUnitSize: 10, gridUnitLabel: 'mm', calibDst: UNIT };

function image(name, nPoints) {
  const points = Array.from({ length: nPoints }, (_, i) => ({
    pixelX: 10 * i + 0.125,
    pixelY: 20 * i + 0.5,
    gridX: i < 4 ? UNIT[i].x : i + 0.123456,
    gridY: i < 4 ? UNIT[i].y : -i - 0.5,
  }));
  return { name, width: 800, height: 600, points };
}

test('header: fixed columns, then P1–P4 pixel, P1–P4 grid, then P5+ grid', () => {
  const h = buildHeader(2);
  assert.deepEqual(h.slice(0, 5), ['image', 'image_width', 'image_height', 'grid_unit_size', 'grid_unit']);
  assert.deepEqual(h.slice(5, 13), ['P1_pixel_x', 'P1_pixel_y', 'P2_pixel_x', 'P2_pixel_y', 'P3_pixel_x', 'P3_pixel_y', 'P4_pixel_x', 'P4_pixel_y']);
  assert.equal(h[13], 'P1_grid_x');
  assert.deepEqual(h.slice(-4), ['P5_grid_x', 'P5_grid_y', 'P6_grid_x', 'P6_grid_y']);
  assert.equal(buildHeader(0).length, 21);
});

test('row: values placed by column name with the documented precision', () => {
  const img = image('a.png', 6);
  const header = buildHeader(2);
  const row = Object.fromEntries(buildRow(img, header, SETTINGS).map((v, i) => [header[i], v]));
  assert.equal(row.image, 'a.png');
  assert.equal(row.grid_unit_size, 10);
  assert.equal(row.grid_unit, 'mm');
  assert.equal(row.P2_pixel_x, '10.13'); // 2 decimals
  assert.equal(row.P2_pixel_y, '20.50');
  assert.equal(row.P3_grid_x, 1);
  assert.equal(row.P5_grid_x, '4.1235'); // 4 decimals
  assert.equal(row.P6_grid_y, '-5.5000');
});

test('row: blank unit size when not set; missing points leave blanks', () => {
  const header = buildHeader(3);
  const row = buildRow(image('b.png', 5), header, { ...SETTINGS, gridUnitSize: null });
  assert.equal(row[header.indexOf('grid_unit_size')], '');
  assert.equal(row[header.indexOf('P7_grid_x')], '');
});

test('row: column order does not matter', () => {
  const img = image('c.png', 5);
  const header = ['P5_grid_x', 'image', 'unknown_col'];
  assert.deepEqual(buildRow(img, header, SETTINGS), ['4.1235', 'c.png', '']);
});

test('csvEscape quotes commas, quotes and newlines only', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape('line\nbreak'), '"line\nbreak"');
  assert.equal(csvEscape(1.5), '1.5');
});

test('write → parse round trip, including awkward file names', () => {
  const header = ['image', 'note'];
  const rows = [['<b>x</b>&"t".png', 'a,b'], ['plain.png', '']];
  const parsed = parseCsv(rowsToCsv(header, rows));
  assert.deepEqual(parsed.header, header);
  assert.deepEqual(parsed.rows, rows);
});

test('parseCsv handles CRLF and blank lines', () => {
  const parsed = parseCsv('a,b\r\n1,2\r\n\r\n3,4\r\n');
  assert.deepEqual(parsed, { header: ['a', 'b'], rows: [['1', '2'], ['3', '4']] });
  assert.deepEqual(parseCsv(''), { header: [], rows: [] });
});

test('isGridMeasureHeader accepts empty or GridMeasure headers only', () => {
  assert.ok(isGridMeasureHeader([]));
  assert.ok(isGridMeasureHeader(buildHeader(0)));
  assert.ok(!isGridMeasureHeader(['foo', 'bar']));
  assert.ok(!isGridMeasureHeader(['image', 'width']));
});

test('measurement point counts', () => {
  assert.equal(getMaxMeasurementPoints([image('a', 3), image('b', 7), image('c', 5)]), 3);
  assert.equal(measurementPointsInHeader(buildHeader(4)), 4);
  assert.equal(measurementPointsInHeader(['P1_grid_x', 'P4_grid_x']), 0);
});

test('merge with an old-format file: no unit columns, more P columns, an extra column', () => {
  const oldHeader = [
    'image', 'image_width', 'image_height',
    'P1_pixel_x', 'P1_pixel_y', 'P2_pixel_x', 'P2_pixel_y', 'P3_pixel_x', 'P3_pixel_y', 'P4_pixel_x', 'P4_pixel_y',
    'P1_grid_x', 'P1_grid_y', 'P2_grid_x', 'P2_grid_y', 'P3_grid_x', 'P3_grid_y', 'P4_grid_x', 'P4_grid_y',
    'P5_grid_x', 'P5_grid_y', 'P6_grid_x', 'P6_grid_y', 'P7_grid_x', 'P7_grid_y', 'note',
  ];
  const oldRow = ['old.jpg', '10', '20', '1', '2', '3', '4', '5', '6', '7', '8', '0', '0', '1', '0', '1', '1', '0', '1', '0.5', '0.5', '0.6', '0.6', '0.7', '0.7', 'hello'];
  const merged = mergeCsv({ header: oldHeader, rows: [oldRow] }, [image('new.png', 6)], SETTINGS);

  assert.deepEqual(merged.header, [...buildHeader(3), 'note']);
  const get = (row, col) => row[merged.header.indexOf(col)];
  const [old, added] = merged.rows;
  assert.equal(get(old, 'image'), 'old.jpg');
  assert.equal(get(old, 'grid_unit_size'), '');
  assert.equal(get(old, 'P7_grid_y'), '0.7');
  assert.equal(get(old, 'note'), 'hello');
  assert.equal(get(added, 'image'), 'new.png');
  assert.equal(get(added, 'grid_unit'), 'mm');
  assert.equal(get(added, 'P7_grid_x'), '');
  assert.equal(get(added, 'note'), '');
});

test('merge into an empty file gives just the new rows', () => {
  const merged = mergeCsv({ header: [], rows: [] }, [image('a.png', 5)], SETTINGS);
  assert.deepEqual(merged.header, buildHeader(1));
  assert.equal(merged.rows.length, 1);
});

test('appended file names do not pile up suffixes', () => {
  const ts = '2026-09-24_101010';
  assert.equal(appendedFileName('data.csv', ts), `data_updated_${ts}.csv`);
  assert.equal(appendedFileName('data_updated.csv', ts), `data_updated_${ts}.csv`);
  assert.equal(appendedFileName('data_updated_2026-01-05_070809.CSV', ts), `data_updated_${ts}.csv`);
  assert.equal(appendedFileName('my_updated_file.csv', ts), `my_updated_file_updated_${ts}.csv`);
});

test('timestamp is local YYYY-MM-DD_HHMMSS without colons', () => {
  assert.equal(timestamp(new Date(2026, 0, 5, 7, 8, 9)), '2026-01-05_070809');
  assert.match(timestamp(), /^\d{4}-\d{2}-\d{2}_\d{6}$/);
});

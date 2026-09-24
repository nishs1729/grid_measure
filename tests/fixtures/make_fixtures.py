"""Generate grid test images with a known grid → pixel mapping.

Each image is a white sheet with black grid lines drawn at integer grid coordinates
through a known homography G (grid → pixel). The matrices are written to
fixtures.json, so tests can compute the exact pixel of any grid point and check
GridMeasure's calibration against the ground truth.

Run from the repo root:  python3 tests/fixtures/make_fixtures.py
Requires numpy and Pillow (the analysis scripts need them too).
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent


def homography(src, dst):
    """3×3 H (h8 = 1) mapping the 4 src points onto the 4 dst points."""
    A, b = [], []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        b.extend([u, v])
    h = np.linalg.solve(np.array(A, float), np.array(b, float))
    return np.append(h, 1.0).reshape(3, 3)


def render(width, height, G, line_px=1.6):
    """Draw grid lines x = k and y = k (integers) as seen through G (grid → pixel)."""
    H = np.linalg.inv(G)  # pixel → grid
    ys, xs = np.mgrid[0:height, 0:width].astype(float) + 0.5
    w = H[2, 0] * xs + H[2, 1] * ys + H[2, 2]
    gx = (H[0, 0] * xs + H[0, 1] * ys + H[0, 2]) / w
    gy = (H[1, 0] * xs + H[1, 1] * ys + H[1, 2]) / w

    # Local grid units per pixel, so lines keep a roughly constant width in pixels
    dgx = np.hypot(np.gradient(gx, axis=1), np.gradient(gx, axis=0))
    dgy = np.hypot(np.gradient(gy, axis=1), np.gradient(gy, axis=0))
    near_x = np.abs(gx - np.round(gx)) < (line_px / 2) * dgx
    near_y = np.abs(gy - np.round(gy)) < (line_px / 2) * dgy

    img = np.full((height, width), 255, np.uint8)
    img[(near_x | near_y) & (w > 0)] = 30
    return Image.fromarray(img, mode='L')


FIXTURES = {
    # Straight-on: 50 px per unit, grid origin at (100, 500), grid y pointing up
    'straight.png': (800, 600, np.array([[50, 0, 100], [0, -50, 500], [0, 0, 1]], float)),
    # Strong perspective: a 10×10 block of cells mapped to a keystoned quadrilateral
    'tilted.png': (
        1000,
        800,
        homography([(0, 0), (10, 0), (10, 10), (0, 10)], [(150, 700), (850, 650), (700, 150), (250, 200)]),
    ),
    # Large image (> 4000 px), 100 px per unit
    'large.png': (4200, 3000, np.array([[100, 0, 200], [0, -100, 2800], [0, 0, 1]], float)),
    # Small image, 20 px per unit
    'small.png': (120, 90, np.array([[20, 0, 10], [0, -20, 80], [0, 0, 1]], float)),
}


def main():
    meta = {}
    for name, (width, height, G) in FIXTURES.items():
        render(width, height, G).save(HERE / name, optimize=True)
        meta[name] = {'width': width, 'height': height, 'G': [float(v) for v in G.flatten()]}
        print(f'wrote {name} ({width}×{height})')
    (HERE / 'fixtures.json').write_text(json.dumps(meta, indent=2) + '\n')
    print('wrote fixtures.json')


if __name__ == '__main__':
    main()

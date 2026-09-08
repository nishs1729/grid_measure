"""
analysis.py — Mathematical, homography, and measurement analysis functions for GridMeasure.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Any, Mapping

import numpy as np


def compute_calibration_homography(
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    p4: tuple[float, float],
) -> tuple[np.ndarray, np.ndarray]:
    """Computes 3x3 homography H (pixel -> grid) and H_inv (grid -> pixel)."""
    src = [p1, p2, p3, p4]
    dst = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]

    A, b = [], []
    for (x, y), (u, v) in zip(src, dst):
        A.extend([
            [x, y, 1.0, 0.0, 0.0, 0.0, -u * x, -u * y],
            [0.0, 0.0, 0.0, x, y, 1.0, -v * x, -v * y],
        ])
        b.extend([u, v])

    h = np.linalg.solve(np.array(A, dtype=float), np.array(b, dtype=float))
    H = np.append(h, 1.0).reshape(3, 3)
    return H, np.linalg.inv(H)


def grid_to_pixel(H_inv: np.ndarray, u: float, v: float) -> tuple[float, float]:
    """Transform grid coordinates (u, v) to image pixel coordinates (x, y)."""
    vec = H_inv @ np.array([u, v, 1.0], dtype=float)
    return float(vec[0] / vec[2]), float(vec[1] / vec[2])


def compute_three_point_metrics(
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
) -> tuple[float, float, tuple[float, float]]:
    """
    Given three points A, B, C:
    Returns (distance(A, B), perpendicular_distance(C, line_AB), foot_of_perpendicular).
    """
    a, b, c = np.array(p1, float), np.array(p2, float), np.array(p3, float)
    v = b - a
    d_ab = float(np.linalg.norm(v))
    if d_ab < 1e-12:
        raise ValueError("Points A and B cannot be coincident.")

    v_u = v / d_ab
    foot = a + float(np.dot(c - a, v_u)) * v_u
    d_perp = float(np.linalg.norm(c - foot))
    return d_ab, d_perp, (float(foot[0]), float(foot[1]))


def extract_row_points(row: Mapping[str, Any]) -> dict[str, Any]:
    """Extracts calibration (P1-P4) and measurement points (P5+) from a CSV row."""
    image_name = str(row.get("image", "untitled"))
    orig_w = int(float(row.get("image_width", 1000)))
    orig_h = int(float(row.get("image_height", 1000)))

    calib = {f"P{i}": (float(row[f"P{i}_pixel_x"]), float(row[f"P{i}_pixel_y"])) for i in range(1, 5)}
    H, H_inv = compute_calibration_homography(calib["P1"], calib["P2"], calib["P3"], calib["P4"])

    meas_grid, meas_pixel = {}, {}
    for key, val in row.items():
        m = re.match(r"^P(\d+)_grid_x$", key)
        if m and int(m.group(1)) >= 5 and val not in (None, ""):
            idx = int(m.group(1))
            lbl = f"P{idx}"
            gx, gy = float(val), float(row[f"P{idx}_grid_y"])
            meas_grid[lbl] = (gx, gy)
            meas_pixel[lbl] = grid_to_pixel(H_inv, gx, gy)

    return {
        "image": image_name,
        "width": orig_w,
        "height": orig_h,
        "H": H,
        "H_inv": H_inv,
        "calibration_pixel": calib,
        "measurement_grid": meas_grid,
        "measurement_pixel": meas_pixel,
    }


def measure_triplet_sets(row: Mapping[str, Any], verbose: bool = True) -> dict[str, Any]:
    """Measures and reports (P5, P6, P7) and (P8, P9, P10) in grid and pixel units."""
    data = extract_row_points(row)
    grid_pts, px_pts = data["measurement_grid"], data["measurement_pixel"]
    triplets = [("Set 1", ("P5", "P6", "P7")), ("Set 2", ("P8", "P9", "P10"))]

    results: dict[str, Any] = {}
    if verbose:
        print("\n" + "=" * 60)
        print(f" MEASUREMENT REPORT: {data['image']}")
        print("=" * 60)

    for set_name, (p_a, p_b, p_c) in triplets:
        if not all(p in grid_pts for p in (p_a, p_b, p_c)):
            continue

        dg_base, dg_perp, foot_g = compute_three_point_metrics(grid_pts[p_a], grid_pts[p_b], grid_pts[p_c])
        dpx_base, dpx_perp, foot_px = compute_three_point_metrics(px_pts[p_a], px_pts[p_b], px_pts[p_c])

        results[set_name] = {
            "points": (p_a, p_b, p_c),
            "dist_baseline_grid": dg_base,
            "dist_baseline_pixel": dpx_base,
            "dist_perp_grid": dg_perp,
            "dist_perp_pixel": dpx_perp,
            "foot_grid": foot_g,
            "foot_pixel": foot_px,
        }

        if verbose:
            print(f"\n▶ {set_name} ({p_a}, {p_b}, {p_c}):")
            print(f"  1. Distance between {p_a} and {p_b}:")
            print(f"     • Calibrated Grid Units: {dg_base:.4f}")
            print(f"     • Original Pixel Units:  {dpx_base:.1f} px")
            print(f"  2. Perpendicular distance from {p_c} to line ({p_a}–{p_b}):")
            print(f"     • Calibrated Grid Units: {dg_perp:.4f}")
            print(f"     • Original Pixel Units:  {dpx_perp:.1f} px")
            print(f"     • Foot of perpendicular: pixel ({foot_px[0]:.1f}, {foot_px[1]:.1f})")

    if verbose:
        print("=" * 60 + "\n")
    return results


def export_calculated_distances(csv_path: str | Path, output_csv: str | Path | None = None) -> Path:
    """
    Reads an input CSV, calculates the two distances for both sets of points:
      - Set 1: P5_P6_distance, P7_perp_distance
      - Set 2: P8_P9_distance, P10_perp_distance
    and exports them to <input_csv>_calc.csv.
    """
    in_file = Path(csv_path)
    out_file = Path(output_csv) if output_csv else in_file.with_name(f"{in_file.stem}_calc.csv")

    with open(in_file, mode="r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    fieldnames = [
        "image",
        "P5_P6_distance",
        "P7_perp_distance",
        "P8_P9_distance",
        "P10_perp_distance",
    ]

    out_rows = []
    for row in rows:
        data = extract_row_points(row)
        grid_pts = data["measurement_grid"]

        d1_base, d1_perp = "", ""
        if all(p in grid_pts for p in ("P5", "P6", "P7")):
            b1, p1, _ = compute_three_point_metrics(grid_pts["P5"], grid_pts["P6"], grid_pts["P7"])
            d1_base, d1_perp = f"{b1:.4f}", f"{p1:.4f}"

        d2_base, d2_perp = "", ""
        if all(p in grid_pts for p in ("P8", "P9", "P10")):
            b2, p2, _ = compute_three_point_metrics(grid_pts["P8"], grid_pts["P9"], grid_pts["P10"])
            d2_base, d2_perp = f"{b2:.4f}", f"{p2:.4f}"

        out_rows.append({
            "image": row.get("image", ""),
            "P5_P6_distance": d1_base,
            "P7_perp_distance": d1_perp,
            "P8_P9_distance": d2_base,
            "P10_perp_distance": d2_perp,
        })

    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(out_rows)

    return out_file

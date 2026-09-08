"""
plot_points.py — Reconstructs and plots GridMeasure points and triplet measurements.

Given a row from a GridMeasure CSV export:
1. Reconstructs image pixel coordinates for all measurement points P5+ using
   the inverse of the 4-point projective homography H.
2. Computes 3-point geometry:
   - Distance between first two points: ||P2 - P1||
   - Perpendicular distance from third point P3 to line P1-P2
3. Measures and reports both consecutive triplet sets (P5-7 and P8-10).
4. Renders the points, calibration box, and measured lengths onto an empty canvas.
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path
from typing import Any, Mapping

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Distinct colors matching the GridMeasure UI
POINT_COLORS: dict[str, str] = {
    "P1": "#ff4444", "P2": "#44aaff", "P3": "#44dd44", "P4": "#ffaa00",
    "P5": "#e844ff", "P6": "#00ddcc", "P7": "#ff6699", "P8": "#88cc00",
    "P9": "#aa88ff", "P10": "#ffdd44",
}


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


def measure_triplet_sets(row: Mapping[str, Any]) -> dict[str, Any]:
    """Measures and reports (P5, P6, P7) and (P8, P9, P10) in grid and pixel units."""
    data = extract_row_points(row)
    grid_pts, px_pts = data["measurement_grid"], data["measurement_pixel"]
    triplets = [("Set 1", ("P5", "P6", "P7")), ("Set 2", ("P8", "P9", "P10"))]

    results: dict[str, Any] = {}
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

        print(f"\n▶ {set_name} ({p_a}, {p_b}, {p_c}):")
        print(f"  1. Distance between {p_a} and {p_b}:")
        print(f"     • Calibrated Grid Units: {dg_base:.4f}")
        print(f"     • Original Pixel Units:  {dpx_base:.1f} px")
        print(f"  2. Perpendicular distance from {p_c} to line ({p_a}–{p_b}):")
        print(f"     • Calibrated Grid Units: {dg_perp:.4f}")
        print(f"     • Original Pixel Units:  {dpx_perp:.1f} px")
        print(f"     • Foot of perpendicular: pixel ({foot_px[0]:.1f}, {foot_px[1]:.1f})")

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


def draw_dashed_line(
    draw: ImageDraw.ImageDraw,
    pt1: tuple[float, float],
    pt2: tuple[float, float],
    fill: str,
    width: int = 2,
    dash: float = 10.0,
    gap: float = 6.0,
) -> None:
    """Draws a dashed segment between pt1 and pt2."""
    dist = float(np.hypot(pt2[0] - pt1[0], pt2[1] - pt1[1]))
    if dist < 1e-6:
        return
    dx, dy = (pt2[0] - pt1[0]) / dist, (pt2[1] - pt1[1]) / dist
    curr = 0.0
    while curr < dist:
        end = min(curr + dash, dist)
        draw.line(
            [(pt1[0] + curr * dx, pt1[1] + curr * dy), (pt1[0] + end * dx, pt1[1] + end * dy)],
            fill=fill,
            width=width,
        )
        curr += dash + gap


def draw_right_angle(
    draw: ImageDraw.ImageDraw,
    foot: tuple[float, float],
    p_base: tuple[float, float],
    p_perp: tuple[float, float],
    size: float = 12.0,
    fill: str = "#ffffff",
    width: int = 2,
) -> None:
    """Draws a right-angle square indicator at the foot of the perpendicular."""
    f, b, p = np.array(foot, float), np.array(p_base, float), np.array(p_perp, float)
    vb, vp = b - f, p - f
    db, dp = np.linalg.norm(vb), np.linalg.norm(vp)
    if db < 1e-6 or dp < 1e-6:
        return
    ub, up = vb / db, vp / dp
    c1, c2, c3 = f + size * ub, f + size * ub + size * up, f + size * up
    draw.line([tuple(c1), tuple(c2), tuple(c3)], fill=fill, width=width)


def plot_row_points(
    row: Mapping[str, Any],
    size: tuple[int, int] | None = None,
    bg_color: str = "#12151c",
    draw_calibration_box: bool = True,
    draw_triplet_measurements: bool = True,
    output_path: str | Path | None = None,
) -> Image.Image:
    """Renders points, calibration box, and triplet measurements on an empty canvas."""
    data = extract_row_points(row)
    orig_w, orig_h = data["width"], data["height"]
    tw, th = size if size is not None else (orig_w, orig_h)
    sx, sy = tw / orig_w, th / orig_h

    def to_c(p: tuple[float, float]) -> tuple[float, float]:
        return (p[0] * sx, p[1] * sy)

    base_dim = min(tw, th)
    pt_r = max(4.0, base_dim * 0.007)
    lw = max(2, int(base_dim * 0.0025))

    try:
        font = ImageFont.load_default(size=max(12, int(base_dim * 0.015)))
    except TypeError:
        font = ImageFont.load_default()

    img = Image.new("RGB", (tw, th), color=bg_color)
    draw = ImageDraw.Draw(img)

    # 1. Subtle background grid
    spacing = int(base_dim * 0.08)
    if spacing > 20:
        for x in range(0, tw, spacing):
            draw.line([(x, 0), (x, th)], fill="#1e2330", width=1)
        for y in range(0, th, spacing):
            draw.line([(0, y), (tw, y)], fill="#1e2330", width=1)

    calib, meas = data["calibration_pixel"], data["measurement_pixel"]

    # 2. Calibration box (P1 -> P2 -> P3 -> P4 -> P1)
    if draw_calibration_box and len(calib) == 4:
        c_poly = [to_c(calib[f"P{i}"]) for i in range(1, 5)]
        draw.line(c_poly + [c_poly[0]], fill="#3d82f6", width=lw)

    # 3. Measured triplet lengths
    if draw_triplet_measurements:
        grid_pts = data["measurement_grid"]
        colors = {"Set 1": ("#06b6d4", "#f59e0b"), "Set 2": ("#10b981", "#f43f5e")}

        for set_name, (pa, pb, pc) in [("Set 1", ("P5", "P6", "P7")), ("Set 2", ("P8", "P9", "P10"))]:
            if not all(p in grid_pts for p in (pa, pb, pc)):
                continue
            col_base, col_perp = colors[set_name]
            dg_base, _, _ = compute_three_point_metrics(grid_pts[pa], grid_pts[pb], grid_pts[pc])
            _, dg_perp, foot_px = compute_three_point_metrics(meas[pa], meas[pb], meas[pc])
            ca, cb, cc = to_c(meas[pa]), to_c(meas[pb]), to_c(meas[pc])
            cfoot = to_c(foot_px)

            # Baseline line and perpendicular drop
            draw.line([ca, cb], fill=col_base, width=lw + 1)
            draw_dashed_line(draw, cc, cfoot, fill=col_perp, width=lw)
            draw_right_angle(draw, cfoot, ca, cc, size=max(10.0, base_dim * 0.012), fill=col_perp, width=lw)

            # Measurement text (no bounding boxes)
            mid_base = ((ca[0] + cb[0]) / 2 + 4, (ca[1] + cb[1]) / 2 - 4)
            mid_perp = ((cc[0] + cfoot[0]) / 2 + 4, (cc[1] + cfoot[1]) / 2 - 4)
            draw.text(mid_base, f"{pa}-{pb}: {dg_base:.3f}", fill=col_base, font=font)
            draw.text(mid_perp, f"⊥{pc}: {dg_perp:.3f}", fill=col_perp, font=font)

    # 4. Point markers and text labels (no bounding boxes)
    all_pts = {**calib, **meas}
    for lbl, pt in all_pts.items():
        cx, cy = to_c(pt)
        color = POINT_COLORS.get(lbl, "#ffffff")
        # Dot with dark outer border and white center
        draw.ellipse([cx - pt_r - 2, cy - pt_r - 2, cx + pt_r + 2, cy + pt_r + 2], fill="#0f1117")
        draw.ellipse([cx - pt_r, cy - pt_r, cx + pt_r, cy + pt_r], fill=color)
        draw.ellipse([cx - pt_r * 0.3, cy - pt_r * 0.3, cx + pt_r * 0.3, cy + pt_r * 0.3], fill="#ffffff")
        # Text label
        tx, ty = cx + pt_r + 4, cy - pt_r - 2
        if tx + 45 > tw:
            tx = cx - pt_r - 45
        if ty < 10:
            ty = cy + pt_r + 4
        draw.text((tx, ty), lbl, fill=color, font=font)

    # 5. Summary info line at top-left
    draw.text((14, 14), f"Image: {data['image']} ({orig_w}x{orig_h} px)", fill="#94a3b8", font=font)

    if output_path is not None:
        out_file = Path(output_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)
        img.save(out_file)

    return img


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Plot GridMeasure points and measure consecutive triplet sets.")
    parser.add_argument("--csv", default="analysis/data/test_measurements.csv", help="Path to CSV file.")
    parser.add_argument("--show-row", type=int, default=None, help="Row index to plot and show (default: None).")
    args = parser.parse_args()

    # Export calculated distances to <input_csv>_calc.csv
    calc_csv = export_calculated_distances(args.csv)
    print(f"✓ Saved calculations to {calc_csv}")

    with open(args.csv, mode="r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    if args.show_row is not None:
        if not (0 <= args.show_row < len(rows)):
            raise IndexError(f"--show-row {args.show_row} is out of range (0 to {len(rows) - 1}).")
        selected_row = rows[args.show_row]
        measure_triplet_sets(selected_row)
        img = plot_row_points(selected_row)
        img.show()
    else:
        for row in rows:
            measure_triplet_sets(row)

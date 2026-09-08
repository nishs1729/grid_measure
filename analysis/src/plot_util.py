"""
plot_util.py — Rendering and visualization utilities for GridMeasure points and geometries.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

import numpy as np
from PIL import Image, ImageDraw, ImageFont

try:
    from .analysis import compute_three_point_metrics, extract_row_points
except (ImportError, ValueError):
    from src.analysis import compute_three_point_metrics, extract_row_points

# Distinct colors matching the GridMeasure UI
POINT_COLORS: dict[str, str] = {
    "P1": "#ff4444", "P2": "#44aaff", "P3": "#44dd44", "P4": "#ffaa00",
    "P5": "#e844ff", "P6": "#00ddcc", "P7": "#ff6699", "P8": "#88cc00",
    "P9": "#aa88ff", "P10": "#ffdd44",
}


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

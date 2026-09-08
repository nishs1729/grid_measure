"""
ventrum.py — Reconstructs and plots GridMeasure points and triplet measurements.

Given a row from a GridMeasure CSV export:
1. Reconstructs image pixel coordinates for all measurement points P5+ using
   the inverse of the 4-point projective homography H.
2. Computes 3-point geometry:
   - Distance between first two points: ||P2 - P1||
   - Perpendicular distance from third point P3 to line P1-P2
3. Measures and reports both consecutive triplet sets (P5-7 and P8-10).
4. Renders the points, calibration box, and measured lengths onto a canvas.
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

# Ensure 'analysis' directory is in sys.path so 'src' can be imported reliably
analysis_dir = Path(__file__).resolve().parent
if str(analysis_dir) not in sys.path:
    sys.path.insert(0, str(analysis_dir))

from src.analysis import (
    export_calculated_distances,
    measure_triplet_sets,
)
from src.plot_util import plot_row_points


if __name__ == "__main__":

    default_csv = analysis_dir / "data" / "test_measurements.csv"
    if not default_csv.exists():
        default_csv = Path("analysis/data/test_measurements.csv")

    parser = argparse.ArgumentParser(
        description="Plot GridMeasure points and measure consecutive triplet sets (ventrum).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
notes:
  Calibration grid coordinates (P1\u2013P4 grid destinations) are read automatically
  from the P1_grid_x/y .. P4_grid_x/y columns in the CSV, exported by
  GridMeasure when custom coordinates are configured in the sidebar.
  Older CSV files without these columns default to the anticlockwise unit square:
    P1\u2192(0,0)  P2\u2192(1,0)  P3\u2192(1,1)  P4\u2192(0,1)

examples:
  python3 ventrum.py
  python3 ventrum.py --csv data/my_session.csv --show-row 0
  python3 ventrum.py --show-row 1 --save-plot out.png
""",
    )
    parser.add_argument(
        "--csv",
        default=str(default_csv),
        help="Path to CSV file (default: %(default)s).",
    )
    parser.add_argument(
        "--show-row",
        type=int,
        default=None,
        help="Row index to plot and show (default: None).",
    )
    parser.add_argument(
        "--save-plot",
        type=str,
        default=None,
        help="Optional file path to save rendered image.",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise FileNotFoundError(f"Input CSV not found: {csv_path}")

    # Export calculated distances to <input_csv>_calc.csv
    calc_csv = export_calculated_distances(csv_path)
    print(f"✓ Saved calculations to {calc_csv}")

    with open(csv_path, mode="r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    if args.show_row is not None:
        if not (0 <= args.show_row < len(rows)):
            raise IndexError(f"--show-row {args.show_row} is out of range (0 to {len(rows) - 1}).")
        selected_row = rows[args.show_row]
        measure_triplet_sets(selected_row)
        img = plot_row_points(selected_row, output_path=args.save_plot)
        try:
            img.show()
        except Exception:
            pass
    else:
        for row in rows:
            measure_triplet_sets(row)
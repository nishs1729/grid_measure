# GridMeasure

A lightweight, browser-based tool to calibrate camera images against a planar grid and measure real-world distances. Runs 100% client-side with zero dependencies.

---

## What It Is & What It's Used For

GridMeasure rectifies optical and perspective distortions (camera tilt, rotation, skew, scale) using a 4-point **2D projective transformation (homography)**.

**Common Uses:**
- **Specimen & Lab Measurement**: Measuring leaves, insects, seed sizes, or petri dish samples placed on millimeter grid paper.
- **Engineering & Inspection**: Sizing PCB traces, component tolerances, and planar materials.
- **Forensic & Field Work**: Measuring objects photographed in situ with a scale marker or grid.
- **Auditable Data Export**: Exporting coordinates in a format that allows exact mathematical reconstruction of points on the original image.

---

## Quick Start (Local Server)

Because GridMeasure uses modern JavaScript ES modules, opening `index.html` directly via `file:///` is blocked by browser CORS security policies. Run a local server using any of these options:

**Option 1: Python**
```bash
# Navigate to the project folder and start server
python3 -m http.server 8000
```
Open **`http://localhost:8000`** in any modern browser.

**Option 2: Node.js (npx)**
```bash
npx serve .
```
Open **`http://localhost:3000`** in any modern browser.

**Option 3: VS Code / IDE Live Preview**
Right-click `index.html` and select **"Live Preview: Show Preview"** (or **"Open with Live Server"**). *(Requires the Live Preview or Live Server extension).*

---

## How to Use

1. **Load Images**: Click **Add Images** (supports PNG, JPEG, WebP, TIFF). Thumbnails show status:
   - *No border*: 0 points.
   - *Yellow border*: 1–4 points (calibrating).
   - *Green border*: 5+ points (calibrated & measured).
2. **Calibrate Grid (P1–P4)**: Click the 4 corners of one known grid square in order:
   - **P1** $\to (0,0)$ (origin)
   - **P2** $\to (1,0)$ (one unit along X)
   - **P3** $\to (1,1)$ (opposite corner)
   - **P4** $\to (0,1)$ (one unit along Y)
   *Placing P4 computes the homography and displays calibration diagnostics.*
3. **Set Physical Units**: Under **Calibration** in the right sidebar, enter your grid unit size (e.g. `10` for 10 mm) to see measurements in physical units (`mm`).
4. **Place Measurement Points (P5+)**: Click any feature to add measurement points. Consecutive points (`P5–P6`, `P7–P8`, etc.) automatically compute distances.
5. **Interactive Controls**:
   - **Magnifier**: Floating zoom loupe with crosshair for sub-pixel precision.
   - **Drag to Reposition**: Drag any existing point to adjust it; moving P1–P4 instantly recalculates all measurements.
   - **Delete / Reset**: Click the **×** button on the latest point or use **Delete Last**; click **Reset Points** to clear the image.
6. **Export**: Click **Export CSV** to download data, or **Append to CSV** to merge with an existing file.

---

## Calibration Diagnostics Explained

Once P1–P4 are placed, the right sidebar displays 5 diagnostic cards to verify calibration accuracy and quantify distortion:

| Metric | What It Measures | Meaning & Interpretation |
| :--- | :--- | :--- |
| **Rotation** | Angle of vector $P1 \to P2$ relative to image horizontal. | Grid tilt relative to camera sensor (e.g. `+2.4°`). Compensated automatically. |
| **Scale** | Pixel resolution per unit ($\text{px/unit}$) and physical density ($\text{px/mm}$). | Higher values = greater precision. Compares X vs Y resolution ($U \times V$). |
| **Aspect Ratio** | Ratio of vertical to horizontal unit length ($\|P4-P1\| / \|P2-P1\|$). | `1.000` (`Square ✓`). Deviations indicate non-square pixels or angled tilt. |
| **Corner Angle** | Angle between $P1 \to P2$ and $P1 \to P4$ vectors. | `90.0°` (`Orthogonal ✓`). Deviations show shear skew or perspective slant. |
| **Perspective** | Projective magnitude of homography and keystone ratio ($\frac{\|P2-P1\|}{\|P3-P4\|}$). | *None* to *Strong*. Confirms that perspective foreshortening is being corrected. |

---

## Export Format & Complete Reconstruction

GridMeasure exports:
- Image metadata (`image`, `image_width`, `image_height`).
- **Raw pixel coordinates** for calibration points `P1`–`P4`.
- **Calibrated grid coordinates** for measurement points `P5+`.

Because the 3x3 homography matrix $H$ is invertible, downstream scripts can analytically recalculate $H^{-1}$ and reconstruct the exact pixel locations on the original image, guaranteeing full scientific auditability.

---

## Downstream Analysis Scripts (`analysis/`)

The repository includes Python tools in the `analysis/` directory to parse exported CSV data, compute geometric metrics, and render visualizations:

- **`analysis/ventrum.py`**: Driver CLI script for processing measurements.
- **`analysis/src/analysis.py`**: Core mathematical functions (homography inversion, coordinate mapping, perpendicular distance, CSV calculations export).
- **`analysis/src/plot_util.py`**: Pillow-based plotting and visualization utilities.

### Requirements

```bash
pip install numpy pillow
```

### Running Analysis (`ventrum.py`)

Run the script on exported data:

```bash
# Process all rows in the default CSV and generate <input>_calc.csv
python3 analysis/ventrum.py

# Specify a custom CSV file
python3 analysis/ventrum.py --csv path/to/measurements.csv

# Render and inspect a specific image/row (e.g. row 0)
python3 analysis/ventrum.py --show-row 0

# Save the rendered plot to a file
python3 analysis/ventrum.py --show-row 0 --save-plot output.png
```

### CLI Arguments

| Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `-h`, `--help` | flag | — | Displays the help text and exits. |
| `--csv` | string / path | `analysis/data/test_measurements.csv` | Path to the input GridMeasure CSV export file. |
| `--show-row` | integer | `None` | 0-indexed row number to plot and display. When omitted, all rows are processed and summarized. |
| `--save-plot` | string / path | `None` | Optional file path (e.g., `output.png`) to save the rendered visualization. |

### Calculated Output (`*_calc.csv`)

Running `ventrum.py` automatically generates a companion file `<input_csv>_calc.csv` containing:
- `P5_P6_distance`: Calibrated distance between baseline points P5 and P6.
- `P7_perp_distance`: Calibrated perpendicular drop from point P7 to baseline P5–P6.
- `P8_P9_distance`: Calibrated distance between baseline points P8 and P9.
- `P10_perp_distance`: Calibrated perpendicular drop from point P10 to baseline P8–P9.


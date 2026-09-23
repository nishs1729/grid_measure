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

1. **Load Images**: Click **Add Images**, drag image files onto the canvas or the image list, or paste an image from the clipboard (**Ctrl/Cmd+V**). Supports PNG, JPEG and WebP; TIFF usually only decodes in Safari. Files that can't be decoded are listed in a notice at the bottom of the screen. Pasted images are named `pasted_<timestamp>_<n>.png`. The count under **Add Images** shows how many images are calibrated (e.g. `7/12 calibrated`). Thumbnails show status:
   - *No border*: 0 points.
   - *Yellow border*: 1–4 points (calibrating, or calibrated with no measurements yet).
   - *Green border*: 5+ points and calibration succeeded (calibrated & measured).
   - *Red border*: 4+ points but calibration failed (e.g. three calibration points in a line) — reposition P1–P4.
2. **Calibrate Grid (P1–P4)**: Click the 4 corners of one known grid square in order:
   - **P1** $\to (0,0)$ (origin)
   - **P2** $\to (1,0)$ (one unit along X)
   - **P3** $\to (1,1)$ (opposite corner)
   - **P4** $\to (0,1)$ (one unit along Y)
   *Placing P4 computes the homography and displays calibration diagnostics.*
3. **Set Physical Units**: Under **Calibration** in the right sidebar, enter your grid unit size (e.g. `10`) and pick its unit (`mm`, `cm`, `m`, `µm`, `in`). Both are remembered in this browser and written to the export.
4. **Place Measurement Points (P5+)**: Click any feature to add measurement points. Consecutive points (`P5–P6`, `P7–P8`, etc.) automatically compute distances.
5. **Interactive Controls**:
   - **Zoom & Pan**: **Ctrl**+scroll (or a trackpad pinch) zooms around the cursor (25%–3200%; `100%` = one screen pixel per image pixel). Scroll moves the image vertically and **Shift**+scroll horizontally, like a document; trackpads scroll in both directions. You can also pan by holding **Space** and dragging, dragging with the **middle mouse button**, or on touch screens by dragging on an empty area. Scrolling stops at the image edges (with a small margin); an image smaller than the canvas stays centred. Pinch with two fingers to zoom. Press **`0`** / **`F`** or click **Fit** (top-right of canvas, which also shows the current zoom) to fit the image to the window. Each image remembers its own zoom and position. From 400% up, image pixels are drawn as sharp squares so you can see exactly where a pixel boundary is.
   - **Magnifier Loupe**: Off by default — press **`Z`** or click the **Zoom** button (top-right of canvas) to turn it on, then hover over the canvas. Displays a magnified view (2×, 4×, 8× or 16× relative to the screen, shown at the bottom of the loupe) with a **gap crosshair** (arms leave a clear gap around the center) and a **center dot** marking the exact sampled pixel. The crosshair uses a dark outline for visibility on both white and dark image backgrounds. Change the magnification with **`+`** / **`-`** or **Alt**+scroll; it is remembered in this browser. Press **`Z`** or click **Zoom** again to turn the loupe off.
   - **Drag to Reposition**: Drag any existing point to adjust it; moving P1–P4 instantly recalculates all measurements. A press only becomes a drag after the pointer moves more than 3 screen pixels, so clicking a point never nudges it by accident.
   - **Grid Overlay**: Once an image is calibrated, the fitted grid is drawn back onto it: cyan lines at every grid unit (every 10th stronger) and the calibration square P1–P4 in yellow. If calibration is good, the lines sit on the paper's grid across the whole sheet. When lines would be closer than 6 screen pixels, only every 2nd, 5th, 10th… line is drawn. Press **`G`** or click **Grid** (top-right of canvas) to hide or show it.
   - **Select & Nudge**: Click a point (on the canvas or its row in the sidebar) to select it; it gets a white ring. Arrow keys then move it by **0.1 px**, **Shift**+arrow by **1 px**, **Alt**+arrow by **10 px**. Press **`Esc`** or click an empty spot to deselect (clicking empty image area also adds a new point, as usual).
   - **Touch Screens**: Tap to place, press-and-drag to move points. The loupe appears above your finger (or beside it near the top edge) so the spot stays visible.
   - **Delete / Reset**: Click the **×** button on the latest point, use **Delete Last**, or press **`Delete`**/**`Backspace`**; click **Reset Points** or press **`R`** to clear the image.
   - **Switch Images**: Press **`]`**/**`PageDown`** for the next image and **`[`**/**`PageUp`** for the previous one.
6. **Export**: Click **Export CSV** to download data, or **Append to CSV** to merge with an existing file. Only images whose calibration succeeded are exported; if any are left out, you're asked to confirm first, with the skipped images listed.
   Files are named with a local timestamp: `gridmeasure_YYYY-MM-DD_HHMMSS.csv` for a new export, and `<original>_updated_YYYY-MM-DD_HHMMSS.csv` when appending (an earlier `_updated_…` suffix is replaced, not stacked).

---

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| **Left Click** | Place calibration or measurement point (on empty image area) |
| **Click point** | Select it for nudging |
| **Drag point** | Reposition point; recalculates in real time |
| **Arrow keys** | Nudge the selected point 0.1 px (**Shift**: 1 px, **Alt**: 10 px) |
| **Hover canvas** | Show magnifier zoom loupe (when turned on with **`Z`**) |
| **Scroll** / **Shift+scroll** | Scroll the image vertically / horizontally |
| **Ctrl+scroll** | Zoom the image around the cursor |
| **Space + drag** / **middle-drag** | Pan the image |
| **Pinch** / **drag empty area** (touch) | Zoom / pan the image |
| **`0`** / **`F`** | Fit image to window |
| **`G`** | Show / hide the fitted grid overlay |
| **`Z`** | Toggle zoom loupe on / off |
| **`+`** / **`-`** / **Alt+scroll** | Loupe magnification up / down (2×–16×) |
| **`]`** / **`PageDown`** | Next image |
| **`[`** / **`PageUp`** | Previous image |
| **`Delete`** / **`Backspace`** | Delete the last point |
| **`R`** | Reset all points on this image (asks to confirm) |
| **`Ctrl/Cmd+V`** | Paste an image from the clipboard |
| **`Esc`** | Deselect the point, or close the user guide |

Shortcuts are ignored while typing in a sidebar field and while the user guide is open. The guide (**Instructions** button, top-right) is organised into tabs: Getting Started, Calibrate, Measure, Check Accuracy, Export and Shortcuts.

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

The cards only describe the four calibration points. The **grid overlay** is the more direct check: it shows whether the fitted grid matches the real one everywhere on the image, not just at P1–P4.

---

## Limitations

GridMeasure corrects tilt, rotation, scale and perspective with a single **homography**. That model is exact only for a flat plane seen through an ideal (distortion-free) lens, so:

- **The grid and the object must lie on the same flat plane.** Anything raised above the paper (a thick specimen, a curled sheet) is measured as if it were on the paper; the error grows with the height and with how obliquely the photo was taken.
- **Lens distortion is not corrected.** Barrel or pincushion distortion bends straight grid lines, which a homography can't represent. The error grows with distance from the calibration square and is worst near the edges of the frame.

**Practical advice:**

- Calibrate on a **large square** (e.g. a 10×10 block of grid cells, with the P1–P4 grid coordinates set to `(0,0)`, `(10,0)`, `(10,10)`, `(0,10)`); small errors in clicking the corners then matter much less.
- Keep the object **inside or near** the calibration square.
- Avoid wide-angle lenses and the edges of the frame; photograph from as square-on as practical.
- **Check with the grid overlay.** Where its lines drift away from the paper's lines, measurements there are affected by distortion.

---

## Export Format & Complete Reconstruction

GridMeasure exports:
- Image metadata (`image`, `image_width`, `image_height`).
- Physical scale (`grid_unit_size`, `grid_unit`): the size and unit of one grid unit. `grid_unit_size` is empty if it wasn't set.
- **Raw pixel coordinates** for calibration points `P1`–`P4`, to 2 decimal places (so sub-pixel nudges are kept).
- **Calibrated grid coordinates** for measurement points `P5+`.

Columns are matched by name, so read them by name (not position) downstream. **Append to CSV** re-maps the existing file's rows by column name too: older exports without the unit columns get blanks there, and any extra columns you added are kept at the end. Files that don't have GridMeasure's `image` and `P1_pixel_x` columns are rejected.

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

Calibration grid coordinates (`P1_grid_x/y` .. `P4_grid_x/y`) are read automatically
from the CSV export and used to reconstruct the correct homography.
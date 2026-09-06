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

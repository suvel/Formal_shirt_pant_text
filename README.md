# Shirt Texture Mockup

A browser tool for previewing custom fabric/pattern designs on a shirt. Upload a
different texture image for each garment part — main body, sleeves, collar,
cuffs — and it's tiled, rotated, and shaded to match the shirt's real folds and
lighting, then masked to that part's shape. Add an optional overlay design
(e.g. a logo) and warp it into place with draggable corner handles, then
download the finished mockup as a transparent PNG.

## Getting Started

**Prerequisites**
- Any modern browser with Canvas 2D support (developed against Chrome).
- A way to serve static files. No Node/npm and no build step are required —
  this is plain HTML/CSS/vanilla JS. Python's built-in server is used below
  purely by convention; `npx serve`, `php -S`, or any static file server works
  the same way.

**Run it**

```
cd shirt_maker
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in your browser.

**Why it must be served over HTTP, not opened as a file** — the page reads
pixel data off the canvas (`getImageData()`) to build its lighting map on
load. Browsers block that under a `file://` URL (canvas-tainting rules), so
opening `index.html` directly will fail. `app.js` detects this case and shows
an on-page message telling you to run a local server instead.

## Usage

1. For any garment part you want to customize — **Main Body**, **R/L Sleeve**,
   **R/L Collar**, **R/L Cuff** — upload a texture image. Each part has its
   own independent **pattern rotation** (0–359°) and **repeat count** (1–10×)
   sliders, so you can scale and orient the fabric pattern differently per
   part.
2. Optionally upload an **overlay design image** (e.g. a logo or print) and
   drag its 4 corner handles on the preview to position and warp it onto the
   shirt.
3. Fine-tune where a part's texture is clipped by dragging its colored mask
   handles (pink/yellow/orange) directly on the preview. Sleeve masks have a
   "double points" button to add more control points for tracing tighter
   curves.
4. Click **Show Debug Tools** to reveal raw mask-coordinate readouts and a
   JSON log — useful if you're recalibrating a mask against the base shirt
   image. Hidden by default since it's not needed for normal use.
5. Click **Download PNG** to export the final composited mockup (transparent
   background, shirt-shaped).

## Project structure

```
shirt_maker/
├── index.html            # page markup: per-region controls, preview canvas, drag handles
├── app.js                # all application logic (region compositing, masking, drag handling)
├── style.css             # layout and styling
├── assert/plain_white.png  # base shirt image (480×520, transparent bg, pre-shaded)
├── PROGRESS.md           # internal dev log and verification checklist
└── README.md             # this file
```

## Decision history

A chronological record of the significant decisions made while building this
project, and why:

1. **Static, zero-build platform.** Plain HTML/CSS/vanilla JS with the Canvas
   2D API — no framework, no bundler, no backend. Chosen because the
   environment had Node/npm available but no image-processing libraries
   (Pillow, OpenCV, ImageMagick), so a client-side canvas approach avoided any
   install step entirely.
2. **Must be served over HTTP, not opened as a file.** `getImageData()`
   throws under `file://` due to browser canvas-tainting rules. This is
   handled in code (a dedicated caught error with on-page instructions), not
   just documented, since it would otherwise look like a broken page.
3. **Masking + lighting blend technique.** The base shirt photo is converted
   to a grayscale "lighting map"; the uploaded texture is tiled and composited
   under that map using `multiply`, then clipped to the shirt's real alpha
   silhouette via `destination-in`. This is the standard Photoshop mockup
   technique (masking + lighting). The compositing order matters — multiply
   must happen before destination-in, or edge antialiasing breaks.
4. **Configurable tiling (v1 → v2).** A fixed tile-size constant was replaced
   with user-facing rotation and repeat-count sliders, so pattern scale and
   orientation could be tuned live instead of hardcoded per texture.
5. **Introducing region masks.** A draggable, projective-warp overlay and a
   free-form polygon mask were added, with live coordinate readouts — the
   first step toward texturing a specific garment region instead of the whole
   shirt at once.
6. **Sleeve-specific masks.** Independent draggable polygons were added for
   each sleeve, along with a "double points" feature to subdivide a mask
   polygon for finer contour tracing around curved edges.
7. **Multi-region architecture (pivotal refactor).** The single global
   texture/mask was replaced with a `regions` object keyed by garment part
   (main, rCollar, lCollar, rSleeve, lSleeve, rCuff, lCuff), each carrying its
   own texture, rotation, repeat count, and mask; rendering loops over every
   region independently. This is what makes true per-part customization
   possible.
8. **Cuff masks.** The per-region mask system was extended to the right and
   left cuffs, completing mask coverage for every garment part.
9. **Debug tools hidden by default.** Raw mask-coordinate/JSON debug output
   was moved behind a toggle button so end users see a clean UI, while the
   calibration tools stay available for future mask tweaking.
10. **Two-panel layout.** The final UI was split into a config panel
    (per-region texture/rotation/repeat controls) and a preview panel (canvas,
    drag handles, download), replacing an earlier single-region dropdown-based
    UI with always-visible per-part controls.

See `PROGRESS.md` for the original dev log and manual verification checklist.

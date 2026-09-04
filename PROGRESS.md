# Progress

## Status: v1 built, not yet manually verified in a browser

## What exists
- `assert/plain_white.png` — original asset. 480×520 RGBA. Background already fully transparent (alpha=0); shirt body opaque (alpha=255) with soft antialiased edges (~3% partial-alpha pixels). Shirt RGB is already shaded gray, not flat white — confirmed by direct pixel inspection (corners, center `227,228,230`, near-collar `183,183,185`).
- `index.html` — page markup: file input for texture upload, error message area, one `<canvas id="preview-canvas" width="480" height="520">`, download button (starts disabled).
- `style.css` — layout, checkerboard background behind the canvas so transparency is visible, disabled-button styling.
- `app.js` — all logic. See "How it works" below.
- `README.md` — how to run it (must be served over http, not opened as `file://`).

## Decisions made (with rationale)
- **Platform**: static HTML/CSS/vanilla-JS page, Canvas 2D only. No build step, no npm install, no backend. Chosen because the project started completely empty and Node/npm were available but nothing else (no Pillow/OpenCV/ImageMagick), and a client-side canvas approach needed zero installs.
- **Scope**: "Simple" v1 — upload → auto-tiled + auto-lit → live preview → download. No manual controls (blend-mode picker, scale/rotate sliders) yet; explicitly deferred.
- **Blend technique**: grayscale of the original shirt = lighting map, applied via `multiply` over a tiled copy of the uploaded texture, then clipped to the shirt's real alpha via `destination-in`. This is the standard Photoshop mockup technique (masking + lighting), validated against the actual Canvas 2D compositing math during planning — order matters (multiply before destination-in, not after) or edge antialiasing breaks.
- **Must be served over http://**: opening `index.html` directly as `file://` will make `getImageData()` throw (Chrome canvas-tainting rules) when building the lighting map at page load. `app.js` catches this and shows an on-page instruction to run `python3 -m http.server`.

## How it works (app.js)
1. On load: fetch `plain_white.png`, draw to an offscreen canvas, convert to a full-alpha grayscale "lighting map" (kept in memory, built once).
2. On texture upload: scale the uploaded image so its larger dimension is ~175px, flatten it onto opaque white in a small tile canvas (guards against textures that have their own transparency), tile it across the full canvas via `createPattern`, multiply the lighting map on top, then `destination-in` the original shirt image to clip to its silhouette.
3. Download button exports the canvas via `toBlob('image/png')`.

Full design rationale and the edge-case list (huge/tiny textures, non-image files, re-upload resetting state, etc.) are in the approved plan: `~/.claude/plans/lets-on-creating-a-jiggly-star.md`.

## Verified so far
- `app.js` passes `node --check` (no syntax errors).
- Element IDs in `index.html` match `getElementById` calls in `app.js`.
- Server-serving requirement and command (`python3 -m http.server 8000`) confirmed to work in this environment (Python 3.14.4 present).

## Not yet verified
- Actually uploading a texture in a real browser and confirming the composited result looks correct (visible tiling, correct shading, clean transparent edges). No headless-browser tooling (chromium-cli/Playwright) is set up in this environment, so this needs a manual check.
- Download button producing a valid, correctly-transparent PNG.
- Cross-browser behavior (Chrome vs Firefox).

## Next steps
1. Run `python3 -m http.server 8000` in this folder, open `http://localhost:8000/`, and manually run through the checklist in the plan's "Verification" section (10 steps: placeholder state, file:// negative control, tiled pattern upload, large texture, tiny swatch, non-image file, re-upload replacing not layering, download, cross-browser).
2. If the result looks right: consider v2 additions the user may want later — manual blend-mode/scale/rotation controls, multiple garment images/colors, `git init` to start tracking history.

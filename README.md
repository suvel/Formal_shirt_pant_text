# Shirt Texture Mockup

Upload a texture or pattern image and it gets applied to the plain white shirt in `assert/plain_white.png`, keeping the fabric's original folds, shadows, and highlights.

## Running it

This page reads pixel data from the canvas, which browsers block when the page is opened directly as a `file://` URL. Serve it locally instead:

```
cd shirt_maker
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in your browser.

## Usage

1. Choose a texture image (any common image format).
2. The shirt preview updates automatically — the texture is tiled and shaded to match the shirt's lighting.
3. Click **Download PNG** to save the result (transparent background, shirt-shaped).

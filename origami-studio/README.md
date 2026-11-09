# Origami Studio v0.1

A local, single-step editor for making origami instruction diagrams. Built with React, TypeScript, Vite, react-konva, and GSAP.

## Run locally

From this folder, use Node.js 22.12+ or a supported newer release.

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r processing/requirements.txt
ORIGAMI_PYTHON=.venv/bin/python npm run dev
```

Open the address Vite prints, usually http://localhost:5173.

## Make a diagram

Use **↶** or **↷** beside the canvas title to rotate the photo and its annotations in 90° steps. The project saves the angle alongside the untouched photo. PNG export uses the rotated dimensions.

1. Choose **Import photo** and open a JPEG, PNG, WebP, or another image format your browser can decode. **Try sample diagram** loads a built-in illustration. Importing a replacement photo keeps annotations at their relative positions.
2. Choose **Valley fold** (dashed), **Mountain fold** (dash-dot), **Crease** (solid), or **Curved arrow**. Click the start point and then the end point on the canvas. The editor previews the mark between clicks, fits curved arrows to the canvas, and selects the new mark.
3. Select a mark on the canvas or in **Layers**. Drag the white endpoint handles to move them. Drag the gold arrow handle to change the curve. Click the pencil in the annotation’s layer row to open **Style** and edit the fold type, color, width, and opacity. Choose **Single head**, **Double head**, or **Fold and unfold** for an arrow. The fold-and-unfold style draws an outgoing arrow and a separate return curve. Use **Visible on canvas** in the style panel to show or hide it.
4. Choose **Preview animation** to watch the folds glow and arrows extend toward their tips.
5. Choose **Save JSON** for an editable project that includes the original image bytes. Use **Open project** to restore it. **Export PNG** downloads the photo and visible annotations at the photo’s dimensions, without the editing handles.

Shortcuts: **V** selects, **1–4** choose the drawing tools, **Esc** cancels or stops preview, and **Delete** removes the selected annotation when focus is outside a control. Photo and project files are processed locally in the browser.

## Verify

```sh
npm run build
```

For the Chrome workflow test, leave the development server running and run `npm test` in a second terminal. The test uses the standard macOS Chrome path when available. Elsewhere, set `CHROME_PATH` to the Chrome or Chromium executable, or install Chromium for Playwright with `npx playwright-core install chromium`. Set `STUDIO_URL` if Vite uses a different address.

## Prepare the paper photo

Under **Paper Photo**, turn on **Remove background** and choose **Paper Atelier**. This runs the single-photo adaptation of the [original photo pipeline](https://github.com/meifish/origami) through the local Vite server. It works best on the original combination of cool-colored paper and a warm background. Choose **Basic edge color** and adjust its tolerance for other images or the built-in SVG sample. Projects saved with the previous background method retain their settings.

Choose **Soft Editorial**, **Textured Illustration**, or **Graphic Paper Art** to use the original three treatments. They protect detail near creases and paper edges and share the same transparent silhouette. Turn off **Remove background** to keep the original surroundings while styling the paper. The simpler tint presets remain available.

**Compare original** switches between the untouched photo and the processed view. JSON stores the source photo and settings. PNG export uses the displayed view and preserves transparency when background removal is visible. Processing keeps the full image dimensions and respects the editor's rotation. The editor sends the photo only to its local processing server. Use `npm run dev` or `npm run preview` with the Python dependencies installed. A static copy of the build cannot run the Python processing.

After background removal, set **Crop margin** and click **Crop to paper**. The margin defaults to 3% of the shorter paper dimension, and is limited by the original photo edges. Set it to 0% for a tight crop. **Reset crop** restores the full frame. The crop is stored in JSON and applied to the exported PNG. Annotation coordinates stay aligned with the source photo.

Run the paper processing test independently with `node --test tests/paper.test.mjs`.

# PDF background compositing plan

## Problem

Safari/WebKit can omit an embedded background image while html-to-image rasterizes its cloned SVG foreignObject. The separate overlay still paints, so an otherwise correct translucent overlay appears to obscure the entire background. The direct PDF path currently captures both through this mechanism.

## Implementation

1. Create an export-only 2× canvas while the original slide image is decoded and available. Fill the background layer's base colour, draw its original image with the computed Fit/Fill placement, then draw the overlay using canvas globalAlpha.
2. Temporarily remove only the background layer from the disposable export iframe, and make the slide root's background transparent. Keep the has-background class and colour variables so text, captions, tables and callouts retain their appearance.
3. Rasterize this transparent foreground and composite it onto the background canvas. Restore the iframe DOM/style in finally, including when capture fails.
4. Keep the existing capture path for slides without background images. Preview, presentation, print, saved files and source decks remain unchanged.

## Validation

- Unit checks for image placement, centring/cropping and opacity boundaries.
- Actual browser pixel checks comparing known PNG, JPEG and SVG backgrounds plus overlays at 0, 0.25, 0.5 and 1 opacity, in both canvas ratios and Fit/Fill modes.
- Transparent PNG base-colour and foreground-transparency checks.
- Generate PDF fixtures and render them to confirm backgrounds, text, diagrams and content remain visible, one slide per page.
- Run the existing test suite and production build. Record the actual browser verification limits, especially Safari system access.

## Delivery

Commit implementation and regression evidence using the agent model identity. Publish through the existing GitHub Pages workflow and verify the deployed revision. No new runtime dependency is required.

## Results

- All 43 Node tests pass, including four new image-placement tests. Production build succeeds.
- The local browser harness passed 52 real-canvas regression cases: PNG/JPEG/SVG × Fit/Fill × opacity 0/0.25/0.5/1 × both ratios (48 cases), two transparent PNG cases, a no-background case, and forced-failure cleanup. Pixel checks compare measured RGBA values against expected blending and verify the foreground marker remains opaque and untinted.
- Two actual PDFs were downloaded through the complete production exporter: six pages each, 960×540 pt (16:9) and 972×648 pt (6:4). All twelve rendered pages were visually inspected; backgrounds, letterboxing, overlays, callouts and Mermaid content are visible as expected.
- Checks ran in the Codex in-app browser on this Mac. System Safari and the user's original affected deck still need acceptance testing; no claim is made that a particular Safari build was reproduced.

To repeat in Safari, run `npm run test:pdf-browser`, open `http://localhost:4180/`, and select **Run pixel checks**. The harness also exports both PDF fixtures. It uses only local synthetic images and is excluded from the production deployment.

# Editable PowerPoint export

## Implementation stages

1. Reuse SwiftReveal's native-object exporter and its tested OOXML corrections. Bundle its source and pinned dependencies locally, expose it only in trusted nonce-protected export frames, and retain the existing preview security boundary. Add measured slide capture, eight starter layout captures, theme colours, speaker notes and bounded operations. Use Arial by default for portable browser/PowerPoint metrics; retain explicit custom CSS fonts.
2. Add PowerPoint to the export UI, with progress, layout warnings, a download retry link and an explicit reminder to retain the editable SwiftReveal source. Keep the app fully offline and ensure the service worker caches the complete runtime.
3. Verify all layouts and both aspect ratios in a real browser, including rich-text bullets, native tables, SVG Mermaid, picture placeholders, background alpha, failure handling and offline readiness. Inspect ZIP/XML and independent renders, run the existing tests, then push and deploy through the existing GitHub Pages workflow. Commit each completed stage as GPT-6_Codex.

## Fidelity

Text, panels and tables remain editable native objects; pictures and Mermaid SVG diagrams are pictures. Eight named Slide Master layouts provide placeholders for new slides. Existing slides use measured positions and do not automatically reflow when a new layout is applied. Fonts are not embedded. The receiving computer needs the chosen fonts; advanced CSS effects can differ.

PowerPoint is an export format, not an editable PoWAReveal backup. Download the `.swiftreveal` source for permanent use and future editing in either companion app.

## Use

Choose **Export → Editable PowerPoint (.pptx)**. The app reports progress, requests a download, and offers a retry link plus a separate editable-source download. In PowerPoint, use **Home → New Slide** for the SwiftReveal layouts and **View → Slide Master** to edit them. Custom slide split/density overrides are captured on existing slides; new layout placeholders use the theme's starter defaults. Exported slide-count text does not automatically update when new slides are added.

All export code and its dependency licences are included in the content-hashed offline cache. No presentation content is uploaded. An installed or already-open copy may offer **Update ready** when a new deployment arrives; download an editable source copy before updating, as with any browser-stored work.

## Verification

Run `npm test` for the 47 automated tests, including the production build and complete offline cache coverage. Run `npm run test:powerpoint-browser`, open **http://localhost:4181/**, and click **Run PowerPoint checks**. Generated test artifacts stay in `.cache/powerpoint-qa` and are never deployed.

The browser regression harness passed 488 assertions across 16:9 and 6:4 presentations: all eight layouts, native rich-text bullets and tables, native theme colours and cover gradients, separate background pictures and 45% overlays, speaker notes, picture/content placeholders, and Mermaid SVG with PNG fallback. Invalid Mermaid aborts export and removes temporary frames; export preserves its source deck. The production app was also exercised from a Pages-style subdirectory through **PowerPoint ready**. Independent LibreOffice renders of both exports were inspected. Microsoft PowerPoint and Safari were not available for direct testing in this environment; the shared exporter was previously exercised in native WebKit by SwiftReveal.

Rebuild the trusted runtime with `npm run build:powerpoint`; normal production builds do this automatically. The exporter source was ported from SwiftReveal 0.10.0 (MIT), including its OOXML paragraph and placeholder corrections. Keep shared renderer/export changes aligned across the two repositories.

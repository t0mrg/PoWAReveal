# Editable PowerPoint export

## Implementation stages

1. Reuse SwiftReveal's native-object exporter and its tested OOXML corrections. Bundle its source and pinned dependencies locally, expose it only in trusted nonce-protected export frames, and retain the existing preview security boundary. Add measured slide capture, eight starter layout captures, theme colours, speaker notes and bounded operations. Use Arial by default for portable browser/PowerPoint metrics; retain explicit custom CSS fonts.
2. Add PowerPoint to the export UI, with progress, layout warnings, a download retry link and an explicit reminder to retain the editable SwiftReveal source. Keep the app fully offline and ensure the service worker caches the complete runtime.
3. Verify all layouts and both aspect ratios in a real browser, including rich-text bullets, native tables, SVG Mermaid, picture placeholders, background alpha, failure handling and offline readiness. Inspect ZIP/XML and independent renders, run the existing tests, then push and deploy through the existing GitHub Pages workflow. Commit each completed stage as GPT-6_Codex.

## Fidelity

Text, panels and tables remain editable native objects; pictures and Mermaid SVG diagrams are pictures. Eight named Slide Master layouts provide placeholders for new slides. Existing slides use measured positions and do not automatically reflow when a new layout is applied. Fonts are not embedded. The receiving computer needs the chosen fonts; advanced CSS effects can differ.

PowerPoint is an export format, not an editable PoWAReveal backup. Download the `.swiftreveal` source for permanent use and future editing in either companion app.

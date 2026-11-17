# Validation evidence

## Tested build

Date: 17 November 2026. Local repository, no configured remote, no GitHub publication or deployment. Stage commits use `GPT-6_Codex` as author/committer. The sibling SwiftReveal repository was used as a read-only implementation reference and native compatibility oracle.

## Automated checks

`npm test` passes 39 tests across codec, model, renderer, media, IndexedDB and PWA checks. `npm run build` produces the complete static shell in `dist/`; no runtime CDN downloads are needed. `git diff --check` passes.

- Native plain JSON and compressed Efficient-Storage fixtures decode to identical full decks, including identifiers, image bytes, notes and metadata.
- Additional fixtures produced by Apple's Compression framework exercise small LZVN and multiblock LZFSE (including a 3,000,000-character Unicode body). Corrupt hashes/lengths, malformed references, missing/orphaned assets and decompression output beyond declared bounds are rejected.
- Both the portable JSON and optional raw deduplicated container output were reopened successfully by the native SwiftRevealTool `measure-storage` command, which reported `roundTripPreserved: true`.
- Every layout/theme and content type is covered by renderer checks, including 6:4 geometry, title alignment, proportional bullet indentation, safe rich text, code whitespace and static SVG references.
- Independent IndexedDB instances simulate competing tabs. Exactly one conflicting writer succeeds; the other receives `DOCUMENT_CONFLICT`, retains its edit data, and does not poison subsequent writes. Queue, deletion and theme/library transactions are tested.
- Production-shell checks validate all index/manifest resources and complete content-hashed precaching. Service-worker tests exercise failed-install rollback, explicit update activation, root/subpath navigation fallback, scope/origin/method isolation and missing-asset fallback.
- Runtime dependencies were checked against npm advisories; jsPDF and DOMPurify were updated to patched versions before testing. Vendored decoder and runtime licences are retained and distributed with the build.

## Actual browser checks

Exercised through the Codex in-app browser on this Mac; this is not a claim of separate Chrome/Edge/Firefox/Safari certification.

- Launched editor, browser library and bundled native examples.
- Imported a real compressed native Efficient-Storage file through the file picker; all eight slides, embedded figures and notes appeared.
- Rendered Mermaid labels, highlighted code, SVG figures and backgrounds. No app errors were reported in the browser console during these checks.
- Created a Statement slide, edited its body into bullets, changed block font scale, palette and 6:4 aspect ratio; preview/navigator reflected the edits and download-needed state.
- Requested editable downloads and verified the download-status badge; reloaded and restored presentations from IndexedDB.
- Activated an available service-worker update and verified the presentation survived.
- Generated a direct PDF from the eight-slide native sample. Poppler confirmed eight 960×540 pt pages (16:9), no JavaScript, and no encryption. All eight pages were raster-rendered and visually inspected: nonblank slides, expected text/figures/table/card/metric layouts, footer numbering, no editor controls or clipped bullets. The PDF is intentionally raster output; selectable/vector text uses browser printing instead.
- Tested optimization analysis on the SVG example: source bytes remained unchanged and estimated savings were zero. Changing the lossy-conversion checkbox invalidated analysis and disabled Apply.
- Opened the production build under `http://localhost:4174/PoWAReveal/`, loaded the SVG example, and verified the latest multiline title editor and relative paths.
- Stopped both owned local servers, then reloaded both `/` and `/PoWAReveal/` successfully from their service-worker caches. Presentations and Ready offline status returned; the subpath check had no browser console errors.

`editor-preview.jpg` shows the actual browser UI with a native SVG figure. Local preview servers were stopped after verification.

## Remaining manual acceptance

Use [TESTING.md](TESTING.md) in desktop Chrome, Edge, Firefox and Safari, plus a tablet-sized viewport. In particular, verify actual browser Print → Save as PDF settings/page count, PWA installation, clipboard permissions, full-screen/presentation keyboard behaviour, image decoding/resizing quality and quota-recovery behaviour. Programmatic IndexedDB quota/conflict tests do not replace these UX checks.

The first exploratory PDF event-wait call timed out in the automation layer; a subsequent correctly awaited download completed. The final direct PDF was inspected as described above. No unresolved PDF-generation failure is being hidden.

## Browser adaptations and limitations

- Browser autosave is an IndexedDB library, not a filesystem save or cloud sync. Download requests are tracked separately from autosave and are not claimed as proof of a retained backup.
- Direct PDF export rasterizes at 2× logical resolution; print is the browser-vector alternative. Printer settings can override CSS page sizes, so verify one slide/page before saving.
- Portable downloads use native-compatible JSON, rather than generating LZFSE-compressed output. The decoder supports Apple's emitted v2, LZVN and stored LZFSE blocks; obsolete `bvx1` streams are explicitly rejected by the vendored decoder.
- TIFF/PDF/HEIC figure conversion is not universally available through browser image decoders. Unsupported inputs produce an explicit message; convert them to PNG/JPEG/SVG first.
- Browser font rendering, quotas, download permissions, installed-app affordances and clipboard policies vary. Large image-heavy decks and long undo histories use more memory; keep downloaded copies.
- Native macOS menus, Finder registration and AppKit document windows are represented by browser controls and library/new-window actions.

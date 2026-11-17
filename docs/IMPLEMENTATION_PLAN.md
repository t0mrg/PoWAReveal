# PoWAReveal implementation plan

## Agreed scope

The initial scope kept the Git repository local until user testing. On 17 November 2026 the user authorized a public MIT-licensed GitHub repository and GitHub Pages deployment, with cross-links to SwiftReveal. Static offline-first PWA for desktop Chrome, Edge, Firefox, and Safari, with a usable tablet layout. Match SwiftReveal 0.9.1's visual presentation and editing functions wherever browser APIs permit. No accounts, server, telemetry, remote fonts, or runtime CDN dependencies. Attribute stage commits to the implementing agent model (GPT-6_Codex).

## Stage 1 — foundation and contracts

- Record this plan, initialize the repository, define module boundaries and staged validation.
- Use browser ES modules bundled with esbuild, plain HTML/CSS UI, and IndexedDB. Static relative asset paths must work under `/PoWAReveal/` as well as `/`.
- Keep the SwiftReveal schema unchanged. Preserve optional fields, embedded base64 images, identifiers, notes, CSS, styles, canvas ratios, and metadata. Download portable JSON `.swiftreveal` documents that the native app can reopen.
- Commit foundation before feature development.

## Stage 2 — document compatibility and renderer

- Decode legacy JSON plus SWRVDECK containers, including LZFSE, bounded lengths, SHA-256 payload/asset checks, asset restoration, and actionable errors. Bundle any decoder locally with its licence. Test against Swift-produced fixtures and corrupted input.
- Port the eight layouts, nine palettes, six block types, rich text/HTML sanitization, code highlighting, custom CSS, SVG figures/backgrounds, density, title alignment, font scaling, and layout warnings. Reuse native CSS and bundled Mermaid/reveal resources where practical and retain licences.
- Render previews in sandboxed iframes, keeping document markup/CSS separate from editor controls. Allow only embedded image resources; no authored scripts or external requests.
- Validate layout/schema parity and compressed fixture round trips; commit this stage.

## Stage 3 — editor and local library

- Build a native-inspired toolbar, slide thumbnail navigator, live canvas, inspector, deck settings, notes, and CSS/theme editor.
- Implement new/open/import, slide and block insert/duplicate/delete/reorder/split, multiselection/copy/paste, independent scales, colours, TSV tables, undo/redo, keyboard controls, and image/background editing.
- IndexedDB stores multiple presentations, selected document, theme snapshots, autosave timestamps, and last-downloaded revision. Serialize writes to prevent stale autosaves. Keep edits available if storage fails; report errors visibly.
- A persistent message states: “Stored in this browser. Download a copy for permanent use.” Distinguish browser-saved from downloaded, make Download prominent, flag edits since download, request persistent storage when supported, and warn on exit with unbacked-up edits.
- Validate editing, reload persistence, failure states and accessibility; commit this stage.

## Stage 4 — offline, presentation and exports

- Bundle all runtime code and assets. Add manifest/icons and a versioned service worker with complete precache, scoped navigation fallback, transactional installation and user-controlled update activation. No refresh that discards edits.
- Presentation mode supports keyboard navigation, full screen, notes and exit. Export self-contained offline HTML, editable `.swiftreveal`, reusable theme files and a browser-only PDF if feasible.
- Prefer direct PDF download using high-resolution slide capture with an explicit raster-output label; preserve a vector browser-print alternative with slide-sized pages, one slide per page, no editor controls, and clear print settings. Fail visibly on capture errors rather than create empty slides.
- Raster import offers original/balanced/high/compact policies, preserves unchanged bytes, never upscales, retains transparent PNGs and SVG, and makes lossy conversions opt-in. Optimization previews size changes and applies one undoable edit.
- Provide static Pages deployment workflow without activating it. Validate root/subpath builds and offline reload; commit this stage.

## Stage 5 — integration and testing handoff

- Run unit/integration tests, build production assets, inspect actual browser UI, exercise file import/edit/download, rendered bullets, presentation, PDF/print, IndexedDB restore, service worker updates and offline navigation.
- Use representative native fixtures covering legacy JSON, compressed storage, SVG, raster images, all layouts, 16:9 and 6:4, and custom styles.
- Document precisely which browsers were exercised and which remain manual acceptance checks. Record real limitations (browser file-format support, browser quota/eviction, raster PDF versus print vector output).
- README provides exact local start commands, localhost URL, production preview and offline/install testing steps. Include compatibility/acceptance checklist and dependency licences.
- Commit the tested integration and report ready for local testing with no remote publication.

## Module boundaries

- `src/model.js`: default deck/block/slide factories, schema validation, identifiers, aspect ratios and cloning.
- `src/codec.js`: async `decodePresentation(ArrayBuffer|Uint8Array)`, `encodePresentation(deck)` returning portable JSON Uint8Array, async container encoding if practical.
- `src/renderer.js`: `renderDocument(deck, {mode: 'preview'|'presentation'|'capture'|'print', slideIndex, selectedBlockId})` returns complete self-contained HTML; `renderSlide(deck, slideIndex)`; `slideSize(deck)` returns `{width,height}`. Preview posts `{type:'select-block',id}` and `{type:'layout-report',warnings}` to parent; parent checks event source.
- `src/storage.js`: IndexedDB library and themes, serialized writes.
- `src/media.js`: `importImage(file, preset)`, `optimizeDeck(deck, options)` with byte statistics and no source mutation.
- `src/export.js`: download helper, HTML export, PDF and print using renderer output.
- `src/app.js`, `src/app.css`: editor, library and document lifecycle.
- `scripts/build.mjs`, `scripts/serve.mjs`, `public/sw.js`: build, local preview and PWA lifecycle.

## Implementation risks and decisions

LZFSE compatibility is an early gate, not a late workaround requiring native re-export. Browser image codecs differ; TIFF/PDF image import may require an explicit unsupported-format message if a client-side decoder cannot preserve fidelity. Print dialog settings are controlled by the browser. A download request cannot prove the user retained the file; UI wording must say “download requested”, not guarantee a durable backup. Browser persistence requests reduce eviction risk but never replace download guidance.

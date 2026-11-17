# PoWAReveal

[![Open PoWAReveal](https://img.shields.io/badge/Open_PoWAReveal-Launch_web_app-087F8C?style=for-the-badge)](https://t0mrg.github.io/PoWAReveal/)

An offline-first browser editor for [SwiftReveal](https://github.com/t0mrg/swiftreveal) presentations, with a local presentation library, native-inspired three-pane editor, and GitHub Pages hosting.

Use [PoWAReveal in your browser](https://t0mrg.github.io/PoWAReveal/), or install [SwiftReveal, the native macOS companion](https://github.com/t0mrg/swiftreveal#install). Both tools open `.swiftreveal` presentations; downloaded PoWAReveal files can be edited in SwiftReveal.

**Presentations are stored in this browser on this device. Download an editable copy for permanent use.** Clearing site data, private browsing, browser eviction, or changing origins can make a browser library unavailable. Persistent storage permission reduces eviction risk but is not a backup. The editor keeps this guidance visible and distinguishes autosaved edits from a download request.

## Start locally

Requires Node.js 22 or newer and npm. From this directory:

```sh
npm ci --ignore-scripts
npm run dev
```

Open **http://localhost:4173/**. The first command downloads build dependencies; the running app uses no server services or CDN. `npm run dev` builds the app and serves it on loopback. Restart it after source changes. Stop it with Ctrl+C.

Choose **Library → Getting started** for a bundled example, or **Open…** to import an existing `.swiftreveal` file. Choose **Download copy** to keep your editable presentation. Reopen that file in SwiftReveal or PoWAReveal.

For a production preview:

```sh
npm run build
npm run preview
```

For a Pages-style subdirectory preview:

```sh
node scripts/serve.mjs --dist --base PoWAReveal --port 4174
```

Open **http://localhost:4174/PoWAReveal/**. Browser storage is isolated by origin (including port), so this preview has a separate library from port 4173.

## Editing

- Create slides from eight layouts; add text, callout, metric, figure, table, and Mermaid blocks.
- Edit slide titles, section labels, subtitles, notes, column splits, density, independent slide/block scales, title alignment, colours and backgrounds.
- Click a block in the preview to select its inspector. Duplicate, reorder, delete or split blocks to another slide.
- Drag slides or use movement buttons. Command/Control-click selects multiple slides; Shift-click selects a range. Copy and paste above the receiving selection, including between PoWAReveal tabs.
- Undo/redo document edits. Native text-field undo remains available while typing.
- Choose among nine native palettes. CSS & themes provides custom slide CSS and browser-stored reusable themes with theme-file import/export.
- Raster import presets preserve original JPEG/PNG bytes when possible. Optimize analyzes changes before one undoable application; lossy conversion is opt-in. SVG remains vector. See [media/export details](docs/MEDIA_AND_EXPORTS.md).

Keyboard shortcuts: Command/Control-S requests an editable download; Command/Control-Z and Shift-Z undo/redo when outside text inputs. In the navigator, Command/Control-C/V copy/paste slides, A selects all, arrows navigate and Delete removes selected slides while retaining at least one.

## Presentation and export

**Present** opens a separate presentation window. Use arrows to navigate, N or S for notes, F for full screen, and Esc to leave full screen or close the presentation. Browser pop-up permission may be required.

**Export** offers:

- **Editable `.swiftreveal`**: portable JSON compatible with the native app, including images and speaker notes. This is the permanent editable backup.
- **Offline HTML**: self-contained reveal.js presentation with bundled Mermaid and code highlighting. No app or internet needed.
- **Direct PDF download**: client-side, high-resolution raster slides, one slide per page. Text is not selectable. Large decks can take time and memory; failure offers the print alternative.
- **Print / Save as PDF**: browser-rendered text and SVG with slide-sized pages. Set margins to None, disable browser headers/footers, and enable background graphics. Browser/printer settings can override CSS page sizes. Check the preview shows one slide per page.

Downloads include the document's notes and embedded assets. A browser download request does not prove a file was retained; check your Downloads folder and keep important files somewhere durable.

## Offline use and app installation

1. Open the app while the local server (or Pages site) is available.
2. Wait for **Ready offline** above the canvas. The entire shell, examples and runtime assets must finish caching first.
3. In supported browsers choose Install app; Safari supports Add to Dock. Installation is optional.
4. The app can reopen and edit cached presentations offline. Reload the **same URL and origin**; service workers do not operate on `file://`.
5. New builds show an update notice. Download important edits, then choose Update now. The app saves the current presentation before activating an update. IndexedDB data is separate from app-shell caches.

If browser storage fails or fills, edits remain open and Download stays available. Switching documents is blocked until the current revision has a download request or a successful browser save. Concurrent edits to the same presentation in different tabs are detected at save time; keep a downloaded copy of conflicting edits before reopening the latest saved version with **Library → Reload saved**.

## GitHub Pages

The public application is hosted at **[https://t0mrg.github.io/PoWAReveal/](https://t0mrg.github.io/PoWAReveal/)**. No installation or account is required. After the first complete load, the app can work offline.

The [Pages workflow](.github/workflows/pages.yml) runs the tests, builds the app, and deploys `dist/` on pushes to `main`. It can also be run manually from GitHub Actions. Repository Pages settings use **GitHub Actions** as the publishing source. Relative asset, manifest, and service-worker URLs support the `/PoWAReveal/` project path.

The hosted site and localhost have separate browser libraries. To move a presentation between them, download an editable `.swiftreveal` copy and open it at the other address. Publishing the app does not upload your browser-stored presentations.

## Development and validation

```sh
npm test
npm run build
```

Read [the implementation plan](docs/IMPLEMENTATION_PLAN.md), [validation evidence](docs/VALIDATION.md), and [manual acceptance checklist](docs/TESTING.md). Cross-browser visual and print acceptance should be completed in Chrome, Edge, Firefox and Safari before public deployment. The app targets desktop use with a stacked inspector on small tablet widths.

## Compatibility and limits

The editable schema remains SwiftReveal version 1. Downloads intentionally use its portable JSON representation. Compressed native imports are decoded locally; they do not require sending presentations to a service. Unsupported versions, corrupt lengths/hashes and missing assets produce visible errors.

Browser quotas and available memory vary. TIFF/PDF/HEIC image decoding is not universally available; convert unsupported figure files to PNG/JPEG/SVG before import. AppKit-specific menus, native filesystem autosave, Finder integration and OS document windows are replaced by browser controls, a browser library and downloadable files. Direct PDF is raster; print is the vector alternative. Custom CSS, scripts and resource-bearing HTML do not receive access to the editor: slide previews use sandboxed documents, allowlisted markup and a resource-restricting CSP.

No analytics, accounts, collaboration server, or network requests for user presentations are included. Dependencies and third-party licences are retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `src/vendor/`.

## License

PoWAReveal is available under the [MIT License](LICENSE). SwiftReveal attribution and bundled third-party licences are retained.

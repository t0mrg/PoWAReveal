# Local acceptance checklist

Use a normal browser profile and the same localhost origin throughout each persistence test. Important real files should already have backups. No remote deployment is needed.

## Editor and compatibility

- Open SwiftReveal's Getting Started JSON file and its Efficient-Storage compressed counterpart; titles, images, notes and metadata should agree.
- Open native Diagrams-and-Code and SVG-Images examples. Verify code whitespace, diagram labels, SVG clipping paths, backgrounds and captions.
- Edit and download a `.swiftreveal`; open it in SwiftReveal. Save in SwiftReveal and reopen in PoWAReveal.
- Exercise all eight layouts, both aspect ratios, nine palettes, compact spacing, column split, title centring, custom CSS and colour resets.
- Add/delete/duplicate/reorder blocks and slides; split at a selected block. Verify text and embedded images survive undo/redo.
- Verify bullets remain fully visible in Statement layout at normal and enlarged font sizes.
- Test multiselection and cross-tab slide copy/paste; receiving deck theme/CSS stays unchanged.
- Import/export a saved theme; apply it to another deck.

## Storage and data safety

- Edit a presentation and wait for “Saved in this browser”. Reload and verify the latest text.
- Keep several presentations in Library; reopen each and verify independent content.
- Download a copy, edit again, and confirm “Changed since last download”. Command/Control-S should request a new editable file.
- Confirm the storage banner remains visible and the browser asks before closing a document with edits not yet downloaded (browsers may suppress this without prior interaction).
- Edit the same saved presentation in two tabs. The second conflicting save must report failure, retain its in-memory edits and keep Download available.
- Simulate IndexedDB failure/quota in a disposable testing profile. Confirm save failure is visible, a document switch cannot silently discard unbacked-up edits, and Download still works.
- Request persistent storage. Regardless of grant/denial, the interface must continue recommending downloads.

## Media/export/presentation

- Import PNG/JPEG/SVG; use all resolution presets. Transparent PNG must retain transparency; no image should upscale.
- Analyze optimization with lossy options off/on; change an option after Analyze and confirm Apply becomes unavailable until analyzed again.
- Apply optimization and undo it; content/styles/notes remain unchanged.
- Present, navigate with arrows, show notes, enter/leave full screen and close using Esc.
- Export offline HTML and open the downloaded file without internet; check Mermaid and code rendering.
- Export direct PDF with text, image, SVG and Mermaid slides in both aspect ratios. Verify every page is nonblank, one slide/page, correct colours, no editor controls.
- Print/Save as PDF with margins None, headers/footers off, background graphics on. Verify one slide/page, notes omitted and selectable text where supported.

## PWA and Pages path

- Wait for Ready offline, stop the local server, reload the existing tab, edit, download and reopen Library.
- Open a new tab at the cached same-origin URL while offline.
- Restart server with a new build. Existing app should show an update notice; activation should preserve autosaved presentations.
- Repeat basic launch/import/export at `http://localhost:4174/PoWAReveal/` using the subpath command in README.
- Verify desktop Chrome, Edge, Firefox and Safari; check tablet widths, keyboard focus, readable labels and dialog scrolling.

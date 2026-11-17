# Media and export behaviour

All conversion runs in the browser. No presentation or image is uploaded.

## Images

Balanced limits the longest edge to 2560 pixels, High quality to 4096, and Compact to 1920. Images never upscale. Original preserves PNG/JPEG pixels and bytes. PNG and JPEG files already within the selected resolution keep their original bytes by default. Imported GIF, WebP and BMP use the first browser-decoded frame and convert to static PNG, preserving transparency. The browser applies JPEG EXIF orientation during decoding before resized pixels are written.

Self-contained static SVG stays vector artwork. Scripts, events, animated/interactive elements, entity declarations, foreign objects and external resource references are rejected visibly. Images embedded inside SVG may use data-URI PNG/JPEG resources. Conventional W3C SVG doctypes are removed without fetching them. Existing SVG source is bypassed by the raster optimizer and is never silently rasterized.

An image import is limited to 64 MiB (20 MiB for SVG). A canvas conversion is limited to 20 million output pixels. TIFF, PDF and HEIC import depends on browser decoding and generally needs conversion to PNG/JPEG/SVG first. A clear error explains unsupported input; no invalid image replaces the current figure.

Optimization processes each unique embedded image once and applies a new deck object, so the editor can make the operation one undoable change. Optional JPEG recompression or opaque-PNG-to-JPEG conversion is opt-in, and is only used when the output is smaller. Transparent PNGs remain PNG. Original suppresses every optional conversion. Resolution limits take precedence over unchanged byte size; resized images can occasionally be larger despite fewer pixels. Size estimates count unique image assets; portable JSON downloads can be larger because base64 and repeated references add overhead.

## HTML

Exported HTML embeds the renderer, reveal.js, diagrams, styles and image data. It remains usable with no network connection. Speaker notes are included in the exported document, as in SwiftReveal. Remove sensitive notes before sharing.

## PDF

**Download PDF** is a direct, server-free export. Each slide is captured at twice its logical resolution and occupies exactly one page, in the selected 16:9 or 6:4 ratio. The result is a high-resolution **raster PDF**: text is not selectable and SVG artwork is rasterized. Large presentations need more browser memory. Export stops visibly when a slide cannot render or an image/diagram is invalid; it does not deliberately save partial output.

**Print / Save as PDF** uses the browser's vector-capable print renderer. Only slides enter the print document, each on a separate page with a CSS page size matching the presentation. In the print dialog choose **Save as PDF**, **scale 100%**, **margins none**, disable **headers and footers**, and enable **background graphics**. Confirm that the browser honours the slide-size page setting; some browsers/printer drivers override custom paper sizes. This path is also the fallback if canvas capture is unsupported or memory-constrained.

A requested download cannot establish that the browser saved the file or that the user kept it. Browser-local save state and downloaded-copy state must remain separate in the editor.

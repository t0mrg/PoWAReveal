import { captureSlidePNG } from './pdf-capture.js';
import { jsPDF } from 'jspdf';
import { renderDocument, slideSize } from './renderer.js';

export function safeFilename(title = 'Presentation') {
  const name = String(title).replace(/[\u0000-\u001f/\\:*?"<>|]/g, '-').trim().replace(/[. ]+$/, '');
  return (name || 'Presentation').slice(0, 160);
}

/** Starts a download; browsers do not confirm that a user actually retained it. */
export function downloadFile(data, filename, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.hidden = true;
  document.body.append(anchor); anchor.click(); anchor.remove();
  // Give Safari time to consume the object URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return blob;
}

export function exportHTML(deck) {
  const html = renderDocument(deck, { mode: 'presentation', slideIndex: 0 });
  return downloadFile(html, `${safeFilename(deck.title)}.html`, 'text/html;charset=utf-8');
}

function waitFor(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]).finally(() => clearTimeout(timer));
}

async function renderFrame(html, size) {
  const frame = document.createElement('iframe');
  frame.title = 'Presentation export renderer';
  // This frame contains only renderer-sanitized markup. Its nonce-based CSP denies authored scripts.
  // Same-origin access is needed to read pixels; editor previews remain opaque sandbox origins.
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-modals');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', left: '-20000px', top: '0', width: `${size.width}px`, height: `${size.height}px`, border: '0', pointerEvents: 'none' });
  const loaded = new Promise((resolve, reject) => { frame.onload = resolve; frame.onerror = () => reject(new Error('The browser could not load the slide renderer.')); });
  frame.srcdoc = html;
  document.body.append(frame);
  try {
    await waitFor(loaded, 15_000, 'The slide renderer did not load in time.');
    const win = frame.contentWindow;
    if (!win?.document.querySelector('.sr-slide')) throw new Error('The exported presentation has no rendered slides.');
    await waitFor(Promise.resolve(win.swiftRevealReady), 30_000, 'The slide did not finish rendering. Check its diagram source and images.');
    if (win.document.fonts?.ready) await win.document.fonts.ready;
    await Promise.all([...win.document.images].map(async image => {
      try { await image.decode(); }
      catch { throw new Error('A slide image could not be decoded. Reimport the image before exporting.'); }
    }));
    return frame;
  } catch (error) { frame.remove(); throw error; }
}

function freezeSVGStyles(node, win) {
  // html-to-image deep-clones SVG subtrees. Resolve surrounding theme rules now,
  // so Mermaid's text/paths keep the same appearance inside the raster capture.
  const properties = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'opacity', 'color', 'visibility'];
  for (const element of node.querySelectorAll('svg, svg *')) {
    const computed = win.getComputedStyle(element);
    for (const property of properties) {
      const value = computed.getPropertyValue(property).replace(/url\(["']?[^)#]*#([^)'"\s]+)["']?\)/g, 'url(#$1)');
      if (value) element.style.setProperty(property, value);
    }
  }
}

/** High-resolution raster PDF, entirely local. Browser printing is the vector alternative. */
export async function exportPDF(deck, options = {}) {
  const size = slideSize(deck);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [size.width, size.height], hotfixes: ['px_scaling'], compress: true });
  pdf.setProperties({ title: deck.title || 'Presentation', author: deck.author || '', creator: 'PoWAReveal', subject: 'High-resolution presentation slides' });
  for (let index = 0; index < deck.slides.length; index++) {
    options.onProgress?.(index, deck.slides.length);
    const frame = await renderFrame(renderDocument(deck, { mode: 'capture', slideIndex: index }), size);
    try {
      const node = frame.contentDocument.querySelector('.sr-slide');
      if (node.querySelector('.sr-diagram-error')) throw new Error(`Slide ${index + 1} has a diagram error. Correct it before exporting.`);
      freezeSVGStyles(node, frame.contentWindow);
      const data = await waitFor(captureSlidePNG(node, size), 45_000, `Slide ${index + 1} could not be captured. Try Print / Save as PDF instead.`);
      if (!data || data === 'data:,') throw new Error(`Slide ${index + 1} produced an empty image. Try Print / Save as PDF instead.`);
      if (index) pdf.addPage([size.width, size.height], 'landscape');
      pdf.addImage(data, 'PNG', 0, 0, size.width, size.height, undefined, 'FAST');
    } finally { frame.remove(); }
    // Allow UI progress indicators to paint during a long export.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  options.onProgress?.(deck.slides.length, deck.slides.length);
  const blob = pdf.output('blob');
  if (options.download !== false) downloadFile(blob, `${safeFilename(deck.title)}.pdf`, 'application/pdf');
  return blob;
}

/** Opens a dedicated slide-sized print document; no editor chrome enters the PDF. */
export async function printDeck(deck) {
  const frame = await renderFrame(renderDocument(deck, { mode: 'print' }), slideSize(deck));
  let timer;
  const cleanup = () => { clearTimeout(timer); frame.remove(); };
  frame.contentWindow.addEventListener('afterprint', cleanup, { once: true });
  // Some Safari versions do not dispatch afterprint to hidden frames.
  timer = setTimeout(cleanup, 10 * 60_000);
  try { frame.contentWindow.focus(); frame.contentWindow.print(); }
  catch (error) { clearTimeout(timer); cleanup(); throw error; }
}

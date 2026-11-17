/** Browser-only image import and conservative, non-mutating optimization. */
export const IMAGE_PRESETS = Object.freeze({
  original: { label: 'Original pixels and format', maximum: Infinity, quality: 1 },
  balanced: { label: 'Balanced', maximum: 2560, quality: 0.85 },
  high: { label: 'High quality', maximum: 4096, quality: 0.92 },
  compact: { label: 'Compact', maximum: 1920, quality: 0.75 },
});
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_SVG_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_PIXELS = 20_000_000;

export function targetDimensions(width, height, preset = 'balanced') {
  const policy = IMAGE_PRESETS[preset];
  if (!policy) throw new Error('Unknown image quality preset.');
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 0x7fffffff)) {
    throw new Error('The image has invalid pixel dimensions.');
  }
  const scale = Math.min(1, policy.maximum / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function bytesToBase64(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < source.length; i += 0x8000) binary += String.fromCharCode(...source.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new Error('The embedded image is too large or invalid.');
  try { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
  catch { throw new Error('The embedded image has invalid base64 data.'); }
}

function sniffMIME(bytes, declared = '') {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) return 'image/png';
  if (declared === 'image/svg+xml' || /<svg[\s>]/i.test(new TextDecoder().decode(bytes.subarray(0, 2048)))) return 'image/svg+xml';
  const prefix = new TextDecoder().decode(bytes.subarray(0, 12));
  if (prefix.startsWith('GIF8')) return 'image/gif';
  if (prefix.startsWith('RIFF') && prefix.slice(8) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  return declared;
}

/** Retain static vector source; reject active content instead of altering artwork. */
export function validateSVG(source) {
  if (new TextEncoder().encode(source).length > MAX_SVG_BYTES) throw new Error('SVG images must be smaller than 20 MiB.');
  // Plotters commonly include an external W3C declaration. Remove it without loading it.
  let normalized = source.replace(/^\uFEFF/, '');
  if (/<\?xml-stylesheet\b/i.test(normalized)) throw new Error('SVG stylesheet processing instructions are not supported.');
  if (/<!DOCTYPE[^>]*\[/i.test(normalized) || /<!ENTITY/i.test(normalized)) throw new Error('SVG entity declarations and DTD subsets are not supported.');
  normalized = normalized.replace(/<!DOCTYPE\s+svg\s+(?:PUBLIC\s+["']-\/\/W3C\/\/DTD SVG 1\.[01]\/\/EN["']\s+)?(?:SYSTEM\s+)?["']https?:\/\/www\.w3\.org\/(?:Graphics\/SVG\/1\.[01]\/DTD\/svg1[01]\.dtd|TR\/2001\/REC-SVG-20010904\/DTD\/svg10\.dtd)["']\s*>/g, '');
  if (/<!DOCTYPE/i.test(normalized)) throw new Error('This SVG uses an unsupported document declaration.');
  const xml = new DOMParser().parseFromString(normalized, 'image/svg+xml');
  const root = xml.documentElement;
  if (xml.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('The SVG is not a valid SVG document.');
  const blocked = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'animate', 'animatemotion', 'animatetransform', 'set', 'discard']);
  function safeCSS(value) {
    const decoded = value.replace(/\/\*[\s\S]*?\*\//g, '');
    if (/\\|@|expression\s*\(|(?:javascript|https?|file|blob):/i.test(decoded)) return false;
    return [...decoded.matchAll(/url\s*\(([^)]*)\)/gi)].every(match => /^\s*['"]?#[\w:.-]+['"]?\s*$/.test(match[1]));
  }
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (node.namespaceURI !== root.namespaceURI || blocked.has(node.localName.toLowerCase())) throw new Error(`SVG element “${node.localName}” is not supported in static artwork.`);
    if (node.localName === 'style' && !safeCSS(node.textContent)) throw new Error('SVG styles must not load external resources.');
    for (const attr of node.attributes) {
      const name = attr.localName.toLowerCase();
      if (/^on/.test(name) || name === 'base') throw new Error('SVG event handlers and base URLs are not supported.');
      if (name === 'href' || name === 'src') {
        if (node.localName === 'a') throw new Error('Interactive SVG links are not supported.');
        if (!/^#[\w:.-]+$/.test(attr.value) && !(['image', 'feImage'].includes(node.localName) && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=\s]+$/.test(attr.value))) throw new Error('SVG images must be self-contained; external references are not supported.');
      }
      if ((name === 'style' || /url\s*\(/i.test(attr.value)) && !safeCSS(attr.value)) throw new Error('SVG styles must not load external resources.');
    }
  }
  return new XMLSerializer().serializeToString(root);
}

async function decodeRaster(bytes, mime) {
  const blob = new Blob([bytes], { type: mime });
  // Browser decoders apply EXIF orientation; canvas output stores display-oriented pixels.
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch { /* Safari and some codecs need HTMLImageElement instead. */ }
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new Error('This browser cannot decode the image. Use PNG, JPEG, WebP, GIF, or a self-contained SVG; convert TIFF/PDF/HEIC files first.');
  } finally { URL.revokeObjectURL(url); }
}

function canvasBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The browser could not encode the image.')), mime, quality));
}

function hasTransparentPixels(context, width, height) {
  // Scan strips to cap the temporary RGBA allocation.
  for (let row = 0; row < height; row += 128) {
    const pixels = context.getImageData(0, row, width, Math.min(128, height - row)).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) return true;
  }
  return false;
}

async function processImage(bytes, declaredMIME, options) {
  const originalBytes = bytes.byteLength;
  if (!originalBytes || originalBytes > MAX_IMAGE_BYTES) throw new Error('Image files must be nonempty and no larger than 64 MiB.');
  const mime = sniffMIME(bytes, declaredMIME);
  const preset = options.preset ?? 'balanced';
  if (!IMAGE_PRESETS[preset]) throw new Error('Unknown image quality preset.');
  if (mime === 'image/svg+xml') {
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    const safe = validateSVG(new TextDecoder(encoding, { fatal: true }).decode(bytes));
    const data = new TextEncoder().encode(safe);
    return { imageData: bytesToBase64(data), imageMIME: mime, width: 0, height: 0, originalBytes, bytes: data.length };
  }
  const image = await decodeRaster(bytes, mime);
  try {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    const target = targetDimensions(width, height, preset);
    const resized = target.width !== width || target.height !== height;
    const native = mime === 'image/png' || mime === 'image/jpeg';
    const unchanged = () => ({ imageData: bytesToBase64(bytes), imageMIME: mime, width, height, originalBytes, bytes: originalBytes });
    if (native && (preset === 'original' || (!resized && !options.recompressJPEG && !options.convertOpaquePNGToJPEG))) return unchanged();
    if (target.width * target.height > MAX_OUTPUT_PIXELS) throw new Error('The image is too large to convert at original resolution. Choose Balanced, High quality, or Compact.');
    const canvas = document.createElement('canvas');
    canvas.width = target.width; canvas.height = target.height;
    const context = canvas.getContext('2d', { willReadFrequently: !!options.convertOpaquePNGToJPEG });
    if (!context) throw new Error('This browser could not allocate an image canvas.');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, target.width, target.height);
    const convertPNG = mime === 'image/png' && options.convertOpaquePNGToJPEG && !hasTransparentPixels(context, target.width, target.height);
    if (native && !resized && !(mime === 'image/jpeg' && options.recompressJPEG) && !convertPNG) return unchanged();
    const outputMIME = mime === 'image/jpeg' || convertPNG ? 'image/jpeg' : 'image/png';
    const blob = await canvasBlob(canvas, outputMIME, IMAGE_PRESETS[preset].quality);
    // Optional recompression must not make an image larger. Required resizing/conversion may.
    if (!resized && native && blob.size >= originalBytes) return unchanged();
    const output = new Uint8Array(await blob.arrayBuffer());
    return { imageData: bytesToBase64(output), imageMIME: outputMIME, ...target, originalBytes, bytes: output.length };
  } finally { image.close?.(); }
}

export async function importImage(file, preset = 'balanced') {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Choose an image file to import.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image files must be no larger than 64 MiB.');
  return processImage(new Uint8Array(await file.arrayBuffer()), file.type, { preset });
}

export async function optimizeDeck(source, options = {}) {
  const deck = structuredClone(source);
  const cache = new Map();
  let originalBytes = 0, optimizedBytes = 0, changedImages = 0, imageReferences = 0;
  for (const slide of deck.slides) {
    for (const holder of [slide.background, ...(slide.blocks || [])].filter(Boolean)) {
      if (!holder.imageData) continue;
      imageReferences++;
      const key = `${holder.imageMIME}:${holder.imageData}`;
      let result = cache.get(key);
      if (!result) {
        const bytes = base64ToBytes(holder.imageData);
        // Keep existing SVG source byte-for-byte; this optimization is raster-only.
        result = holder.imageMIME === 'image/svg+xml' || (options.preset ?? 'balanced') === 'original'
          ? { imageData: holder.imageData, imageMIME: holder.imageMIME, originalBytes: bytes.length, bytes: bytes.length }
          : await processImage(bytes, holder.imageMIME, options);
        cache.set(key, result);
        originalBytes += result.originalBytes; optimizedBytes += result.bytes;
        if (result.imageData !== holder.imageData || result.imageMIME !== holder.imageMIME) changedImages++;
      }
      holder.imageData = result.imageData; holder.imageMIME = result.imageMIME;
    }
  }
  return { deck, originalBytes, optimizedBytes, savedBytes: originalBytes - optimizedBytes, changedImages, uniqueImages: cache.size, imageReferences };
}

import { toCanvas, toPng } from 'html-to-image';

/** CSS object-position offsets, resolved against unused (possibly negative) space. */
function positionOffset(value, space) {
  const keyword = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
  value = keyword[value] || value;
  if (/^-?(?:\d*\.)?\d+%$/.test(value)) return space * parseFloat(value) / 100;
  if (/^-?(?:\d*\.)?\d+(?:px)?$/.test(value)) return parseFloat(value);
  const calculation = /^calc\(\s*(-?[\d.]+)%\s*([+-])\s*([\d.]+)px\s*\)$/.exec(value);
  if (calculation) return space * Number(calculation[1]) / 100 + Number(calculation[3]) * (calculation[2] === '+' ? 1 : -1);
  throw new Error('PDF export cannot resolve this custom background image position. Use Print / Save as PDF instead.');
}

/** Place intrinsic image pixels in their CSS box; canvas clipping implements Fill. */
export function imagePlacement(imageWidth, imageHeight, box, fit = 'cover', position = '50% 50%') {
  if (![imageWidth, imageHeight, box.width, box.height].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('The slide background has invalid image dimensions.');
  }
  let width = imageWidth, height = imageHeight;
  if (fit === 'fill') { width = box.width; height = box.height; }
  else if (fit !== 'none') {
    const contain = Math.min(box.width / imageWidth, box.height / imageHeight);
    const scale = fit === 'cover' ? Math.max(box.width / imageWidth, box.height / imageHeight) : fit === 'scale-down' ? Math.min(1, contain) : contain;
    width *= scale; height *= scale;
  }
  const axes = position.match(/calc\([^)]*\)|[^\s]+/g) || ['50%', '50%'];
  return { x: box.x + positionOffset(axes[0], box.width - width), y: box.y + positionOffset(axes[1] || '50%', box.height - height), width, height };
}

function opacity(style) {
  const value = Number.parseFloat(style.opacity);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

/** Paint the decoded original image directly, avoiding embedded SVG image painting. */
function backgroundCanvas(node, layer, image, size, pixelRatio) {
  const win = node.ownerDocument.defaultView;
  const rootRect = node.getBoundingClientRect();
  if (!rootRect.width || !rootRect.height) throw new Error('The slide background has no drawable area.');
  const rect = element => {
    const value = element.getBoundingClientRect();
    return { x: (value.left - rootRect.left) * size.width / rootRect.width, y: (value.top - rootRect.top) * size.height / rootRect.height,
      width: value.width * size.width / rootRect.width, height: value.height * size.height / rootRect.height };
  };
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size.width * pixelRatio); canvas.height = Math.round(size.height * pixelRatio);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not allocate the PDF background canvas.');
  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = win.getComputedStyle(node).backgroundColor;
  context.fillRect(0, 0, size.width, size.height);
  const layerStyle = win.getComputedStyle(layer), layerRect = rect(layer);
  context.fillStyle = layerStyle.backgroundColor;
  context.fillRect(layerRect.x, layerRect.y, layerRect.width, layerRect.height);
  const imageStyle = win.getComputedStyle(image), imageBox = rect(image);
  const placed = imagePlacement(image.naturalWidth, image.naturalHeight, imageBox, imageStyle.objectFit, imageStyle.objectPosition);
  context.save();
  context.beginPath(); context.rect(imageBox.x, imageBox.y, imageBox.width, imageBox.height); context.clip();
  context.globalAlpha = opacity(imageStyle);
  context.drawImage(image, placed.x, placed.y, placed.width, placed.height);
  context.restore();
  const overlay = layer.querySelector('.sr-background-overlay');
  if (overlay) {
    const style = win.getComputedStyle(overlay), area = rect(overlay);
    context.save();
    context.globalAlpha = opacity(style);
    context.fillStyle = style.backgroundColor;
    context.fillRect(area.x, area.y, area.width, area.height);
    context.restore();
  }
  return canvas;
}

/** Source node belongs to a disposable export frame, never the editor preview. */
export async function captureSlidePNG(node, size, pixelRatio = 2) {
  const options = { width: size.width, height: size.height, pixelRatio, skipFonts: true, cacheBust: false };
  const layer = node.querySelector(':scope > .sr-background-layer');
  const image = layer?.querySelector('img.sr-background-image');
  if (!image) return toPng(node, options);
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('The slide background image could not be decoded.');
  const canvas = backgroundCanvas(node, layer, image, size, pixelRatio);
  const originalStyle = node.getAttribute('style'), nextSibling = layer.nextSibling;
  try {
    layer.remove();
    // Retain .has-background and all text variables; only the capture background changes.
    node.style.setProperty('background', 'transparent', 'important');
    const foreground = await toCanvas(node, options);
    const context = canvas.getContext('2d');
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(foreground, 0, 0, canvas.width, canvas.height);
    context.restore();
    return canvas.toDataURL('image/png');
  } finally {
    if (originalStyle === null) node.removeAttribute('style');
    else node.setAttribute('style', originalStyle);
    node.insertBefore(layer, nextSibling?.parentNode === node ? nextSibling : null);
  }
}

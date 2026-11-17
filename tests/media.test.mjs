import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_PRESETS, targetDimensions, bytesToBase64, base64ToBytes, optimizeDeck } from '../src/media.js';

test('image dimensions enforce resolution without ever upscaling or changing orientation', () => {
  assert.deepEqual(targetDimensions(6000, 4000, 'balanced'), { width: 2560, height: 1707 });
  assert.deepEqual(targetDimensions(2000, 6000, 'compact'), { width: 640, height: 1920 });
  assert.deepEqual(targetDimensions(640, 480, 'high'), { width: 640, height: 480 });
  assert.deepEqual(targetDimensions(6000, 4000, 'original'), { width: 6000, height: 4000 });
  for (const invalid of [0, -1, Infinity, NaN, 1.2]) assert.throws(() => targetDimensions(invalid, 100));
  assert.throws(() => targetDimensions(100, 100, 'missing'));
  assert.equal(IMAGE_PRESETS.balanced.quality, 0.85);
});

test('binary image conversion survives zero bytes and large chunks', () => {
  const bytes = Uint8Array.from({ length: 90_000 }, (_, i) => i % 256);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  assert.throws(() => base64ToBytes('not base64!'));
});

test('Original optimization is lossless, deduplicates estimates and never mutates the source', async () => {
  const data = bytesToBase64(new Uint8Array([0, 1, 2, 3]));
  const source = { title: 'Example', slides: [{ title: 'One', background: { imageData: data, imageMIME: 'image/png', overlayOpacity: 0.5 }, blocks: [{ id: 'a', imageData: data, imageMIME: 'image/png', caption: 'Keep me' }, { id: 'b', body: 'Keep this too' }] }] };
  const before = JSON.stringify(source);
  const result = await optimizeDeck(source, { preset: 'original', recompressJPEG: true, convertOpaquePNGToJPEG: true });
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(result.deck, source);
  assert.notEqual(result.deck, source);
  assert.equal(result.uniqueImages, 1);
  assert.equal(result.imageReferences, 2);
  assert.equal(result.originalBytes, 4);
  assert.equal(result.optimizedBytes, 4);
  assert.equal(result.savedBytes, 0);
  assert.equal(result.changedImages, 0);
});

test('raster optimization preserves SVG source and repeated references byte for byte', async () => {
  const imageData = bytesToBase64(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'));
  const deck = { slides: [{ blocks: [{ imageData, imageMIME: 'image/svg+xml' }] }] };
  const result = await optimizeDeck(deck, { preset: 'compact' });
  assert.equal(result.deck.slides[0].blocks[0].imageData, imageData);
  assert.equal(result.savedBytes, 0);
});

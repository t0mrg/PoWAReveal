import { validateDeck, MAX_FILE_BYTES } from './model.js';
import { decodeLzfse } from './vendor/lzfse.js';
export { encodePresentation } from './portable.js';

const magic = new TextEncoder().encode('SWRVDECK');
const HEADER_BYTES = 60;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };
const isBase64 = value => typeof value === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
function parseJSON(bytes, label) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(`The ${label} is not valid UTF-8 JSON.`); }
}
function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  fail('The presentation input must contain file bytes.');
}
export async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}
function fromBase64(value) {
  if (!isBase64(value)) fail('An image asset contains invalid base64 data.');
  const raw = atob(value), result = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) result[index] = raw.charCodeAt(index);
  return result;
}

/** Restore a SwiftReveal asset envelope without mutating the parsed input. */
async function restoreEnvelope(envelope) {
  if (!object(envelope) || envelope.schemaVersion !== 1) fail('The presentation uses an unsupported asset-storage version.');
  if (![envelope.assets, envelope.blockImages, envelope.backgroundImages].every(object)) fail('The presentation asset-storage structure is invalid.');
  const deck = validateDeck(envelope.deck);
  const used = new Set(), blocksRemaining = new Set(Object.keys(envelope.blockImages)), backgroundsRemaining = new Set(Object.keys(envelope.backgroundImages));
  for (const [digest, encoded] of Object.entries(envelope.assets)) {
    if (!/^[a-f0-9]{64}$/.test(digest) || await sha256(fromBase64(encoded)) !== digest) fail('An image asset failed its integrity check.');
  }
  function asset(mapping, id) {
    if (!own(mapping, id) || typeof mapping[id] !== 'string' || !own(envelope.assets, mapping[id])) fail('The presentation refers to a missing image asset.');
    const digest = mapping[id];
    used.add(digest);
    return envelope.assets[digest];
  }
  for (const slide of deck.slides) {
    if (slide.background != null) {
      if (slide.background.imageData !== '') fail('A stored background image contains unexpected inline bytes.');
      slide.background.imageData = asset(envelope.backgroundImages, slide.id);
      backgroundsRemaining.delete(slide.id);
    }
    for (const block of slide.blocks) {
      if (block.imageData != null) fail('An asset-storage block contains unexpected inline image bytes.');
      if (own(envelope.blockImages, block.id)) {
        block.imageData = asset(envelope.blockImages, block.id);
        blocksRemaining.delete(block.id);
      }
    }
  }
  if (blocksRemaining.size || backgroundsRemaining.size || used.size !== Object.keys(envelope.assets).length) fail('The presentation contains orphaned image assets or invalid image references.');
  return validateDeck(deck);
}

/** Read native legacy JSON or SWRVDECK version-1 raw/LZFSE containers. */
export async function decodePresentation(input) {
  const data = asBytes(input);
  if (data.byteLength > MAX_FILE_BYTES) fail('The presentation exceeds the 512 MiB file-size limit.');
  const startsMagic = magic.every((byte, index) => data[index] === byte);
  if (!startsMagic) {
    if (data.length > 0 && data.length < magic.length && data.every((byte, index) => byte === magic[index])) fail('The presentation file is truncated.');
    return validateDeck(parseJSON(data, 'presentation'));
  }
  if (data.length < HEADER_BYTES) fail('The presentation file is truncated.');
  const header = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = header.getUint16(8, false), codec = data[10];
  if (version !== 1) fail(`Unsupported presentation storage version: ${version}.`);
  if (codec !== 0 && codec !== 1) fail(`Unsupported presentation compression method: ${codec}.`);
  if (data[11] !== 0) fail('The presentation storage header is invalid.');
  const rawLength = header.getBigUint64(12, false), storedLength = header.getBigUint64(20, false);
  if (rawLength < 1n || rawLength > BigInt(MAX_FILE_BYTES)) fail('The decoded presentation exceeds the 512 MiB storage limit.');
  if (storedLength < 1n || storedLength > BigInt(MAX_FILE_BYTES - HEADER_BYTES)) fail('The presentation payload length is invalid.');
  const expectedLength = HEADER_BYTES + Number(storedLength);
  if (data.length < expectedLength) fail('The presentation file is truncated.');
  if (data.length !== expectedLength) fail('The presentation storage header or file length is invalid.');
  const payload = data.subarray(HEADER_BYTES);
  const expectedHash = Array.from(data.subarray(28, 60), byte => byte.toString(16).padStart(2, '0')).join('');
  if (await sha256(payload) !== expectedHash) fail('The presentation failed its integrity check. Restore an undamaged copy.');
  let raw;
  if (codec === 0) {
    if (payload.length !== Number(rawLength)) fail('The uncompressed presentation length is invalid.');
    raw = payload;
  } else {
    try { raw = await decodeLzfse(payload, Number(rawLength)); }
    catch (error) { fail(`The compressed presentation could not be decoded: ${error.message}`); }
    if (!(raw instanceof Uint8Array) || raw.length !== Number(rawLength)) fail('The decompressed presentation length is invalid.');
  }
  return restoreEnvelope(parseJSON(raw, 'presentation asset envelope'));
}

/** Optional lossless deduplicated container, readable by native SwiftReveal.
 * Codec zero deliberately avoids depending on an encoder. Normal downloads use
 * portable JSON; this API is useful for large repeated-asset presentations.
 */
export async function encodeContainer(input) {
  const deck = validateDeck(input), envelope = { schemaVersion: 1, deck, assets: {}, blockImages: {}, backgroundImages: {} };
  async function store(encoded) {
    const digest = await sha256(fromBase64(encoded));
    envelope.assets[digest] = encoded;
    return digest;
  }
  for (const slide of deck.slides) {
    if (slide.background) {
      envelope.backgroundImages[slide.id] = await store(slide.background.imageData);
      slide.background.imageData = '';
    }
    for (const block of slide.blocks) {
      if (block.imageData != null) {
        envelope.blockImages[block.id] = await store(block.imageData);
        delete block.imageData;
      }
    }
  }
  const raw = new TextEncoder().encode(JSON.stringify(envelope));
  if (raw.length > MAX_FILE_BYTES - HEADER_BYTES) fail('The presentation exceeds the 512 MiB storage limit.');
  const result = new Uint8Array(HEADER_BYTES + raw.length);
  result.set(magic);
  const header = new DataView(result.buffer);
  header.setUint16(8, 1, false);
  header.setBigUint64(12, BigInt(raw.length), false);
  header.setBigUint64(20, BigInt(raw.length), false);
  const digest = await sha256(raw);
  result.set(Uint8Array.from(digest.match(/../g), byte => Number.parseInt(byte, 16)), 28);
  result.set(raw, HEADER_BYTES);
  return result;
}

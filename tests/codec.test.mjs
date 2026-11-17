import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDeck, createBlock, validateDeck, MAX_FILE_BYTES } from '../src/model.js';
import { decodePresentation, encodePresentation, encodeContainer, sha256 } from '../src/codec.js';
import { decodeLzfse } from '../src/vendor/lzfse.js';

const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const file = name => readFile(new URL(`fixtures/${name}`, import.meta.url));
async function container(envelope, codec = 0, payloadOverride) {
  const raw = bytes(envelope), payload = payloadOverride ?? raw, result = new Uint8Array(60 + payload.length);
  result.set(new TextEncoder().encode('SWRVDECK'));
  const view = new DataView(result.buffer);
  view.setUint16(8, 1); result[10] = codec;
  view.setBigUint64(12, BigInt(raw.length));view.setBigUint64(20, BigInt(payload.length));
  result.set(Uint8Array.from((await sha256(payload)).match(/../g), v => parseInt(v, 16)), 28);
  result.set(payload, 60);return result;
}
function imageDeck() {
  const deck=createDeck(), block=createBlock('figure');block.imageData='aW1hZ2U=';
  deck.slides[0].blocks=[block,{...structuredClone(block),id:crypto.randomUUID()}];
  deck.slides[0].background={imageData:block.imageData,imageMIME:'image/png',imageFit:false,overlayColor:'#102036',overlayOpacity:.45,textColor:'#FFFFFF'};
  deck.aspectRatio='sixByFour';deck.customCSS='.emphasis {color:red}';deck.slides[0].notes='Remember this';
  return deck;
}

test('native Swift JSON and LZFSE fixtures restore identical full documents and image bytes', async () => {
  const legacy=await decodePresentation(await file('native-legacy.swiftreveal'));
  const compressed=await decodePresentation(await file('native-efficient.swiftreveal'));
  assert.deepEqual(compressed,legacy);
  assert.equal(compressed.slides.length,8);
  assert.ok(compressed.slides.some(slide=>slide.blocks.some(block=>block.imageData?.length>1000)));
  assert.deepEqual(await decodePresentation(encodePresentation(compressed)),compressed);
});

test('codec accepts ArrayBuffer and byte views without losing offsets', async()=>{
  const encoded=encodePresentation(createDeck()), padded=new Uint8Array(encoded.length+12);padded.set(encoded,6);
  assert.deepEqual(await decodePresentation(padded.subarray(6,-6)),await decodePresentation(encoded.buffer));
});

test('raw native container deduplicates assets and preserves metadata, ratios, and source bytes',async()=>{
  const deck=imageDeck(), original=structuredClone(deck), encoded=await encodeContainer(deck);
  const envelope=JSON.parse(new TextDecoder().decode(encoded.subarray(60)));
  assert.equal(Object.keys(envelope.assets).length,1);
  assert.equal(Object.keys(envelope.blockImages).length,2);
  assert.equal(Object.keys(envelope.backgroundImages).length,1);
  assert.deepEqual(await decodePresentation(encoded),validateDeck(deck));
  assert.deepEqual(deck,original);
});

test('rejects incomplete headers, unsupported codecs, reserved bits, and dishonest lengths',async()=>{
  const encoded=await encodeContainer(createDeck());
  for(const length of [1,5,8,59])await assert.rejects(decodePresentation(encoded.slice(0,length)),/truncated/);
  const version=encoded.slice();version[9]=2;await assert.rejects(decodePresentation(version),/storage version/);
  const codec=encoded.slice();codec[10]=99;await assert.rejects(decodePresentation(codec),/compression method/);
  const reserved=encoded.slice();reserved[11]=1;await assert.rejects(decodePresentation(reserved),/header/);
  const big=encoded.slice();new DataView(big.buffer).setBigUint64(12,BigInt(MAX_FILE_BYTES)+1n);await assert.rejects(decodePresentation(big),/512 MiB/);
  const short=encoded.slice(0,-1);await assert.rejects(decodePresentation(short),/truncated/);
  const long=new Uint8Array(encoded.length+1);long.set(encoded);await assert.rejects(decodePresentation(long),/length/);
});

test('payload corruption is rejected before decompression',async()=>{
  const encoded=(await file('native-efficient.swiftreveal')).slice();encoded[encoded.length-1]^=1;
  await assert.rejects(decodePresentation(encoded),/integrity/);
});

test('rejects digest mismatches, missing images and orphaned asset references',async()=>{
  const encoded=await encodeContainer(imageDeck());
  const envelope=JSON.parse(new TextDecoder().decode(encoded.subarray(60)));
  const digest=Object.keys(envelope.assets)[0];
  const badAsset=structuredClone(envelope);badAsset.assets[digest]='dGFtcGVyZWQ=';
  await assert.rejects(decodePresentation(await container(badAsset)),/image asset.*integrity/);
  const missing=structuredClone(envelope);delete missing.assets[digest];
  await assert.rejects(decodePresentation(await container(missing)),/missing image asset/);
  const unknown=structuredClone(envelope);unknown.blockImages[crypto.randomUUID()]=digest;
  await assert.rejects(decodePresentation(await container(unknown)),/orphaned/);
  const inline=structuredClone(envelope);inline.deck.slides[0].blocks[0].imageData='aW1hZ2U=';
  await assert.rejects(decodePresentation(await container(inline)),/unexpected inline/);
});

test('LZFSE stored and LZVN streams are supported with exact output bounds',()=>{
  const raw=new Uint8Array([0x62,0x76,0x78,0x2d,3,0,0,0,65,66,67,0x62,0x76,0x78,0x24]);
  assert.deepEqual(decodeLzfse(raw,3),new Uint8Array([65,66,67]));
  assert.throws(()=>decodeLzfse(raw,2),/declared/);
  assert.throws(()=>decodeLzfse(raw,4),/length/);
  assert.throws(()=>decodeLzfse(new Uint8Array([...raw,0]),3),/trailing/);
  const lzvn=new Uint8Array([0x62,0x76,0x78,0x6e,3,0,0,0,12,0,0,0,0xe3,65,66,67,6,0,0,0,0,0,0,0,0x62,0x76,0x78,0x24]);
  assert.deepEqual(decodeLzfse(lzvn,3),new Uint8Array([65,66,67]));
});

test('LZFSE never allocates output beyond the authenticated declared size',()=>{
  const bomb=new Uint8Array([0x62,0x76,0x78,0x6e,255,255,255,127,0,0,0,0]);
  assert.throws(()=>decodeLzfse(bomb,16),/declared/);
  assert.throws(()=>decodeLzfse(new Uint8Array(),0),/limit/);
});


test('native Apple LZVN and multi-block LZFSE fixtures decode without truncation',async()=>{
  const small=await decodePresentation(await file('native-small.swiftreveal'));
  assert.equal(small.slides[0].blocks[0].body,'A short repeated sentence. '.repeat(80));
  const large=await decodePresentation(await file('native-multiblock.swiftreveal'));
  assert.equal(large.slides[0].blocks[0].body,'Unicode αβ and repeated text.\n'.repeat(100000));
});

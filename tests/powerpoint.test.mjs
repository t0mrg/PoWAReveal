import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeck,createSlide} from '../src/model.js';
import {renderDocument,themePalette} from '../src/renderer.js';
import {exportPowerPoint} from '../src/powerpoint.js';

test('PowerPoint renderer uses trusted offline runtime and a portable font',()=>{
  const deck=createDeck();
  const html=renderDocument(deck,{mode:'powerpoint'});
  assert.match(html,/sr-capture sr-powerpoint/);
  assert.match(html,/font-family:Arial,sans-serif/);
  assert.match(html,/swiftRevealPowerPoint=/);
  assert.match(html,/connect-src 'none'/);
  assert.doesNotMatch(html,/<script src=/);
  const nonce=html.match(/script-src 'nonce-([^']+)'/)[1];
  for(const tag of html.matchAll(/<script\b([^>]*)>/g))assert.ok(tag[1].includes(`nonce="${nonce}"`));
  for(const mode of ['capture','preview','presentation','print'])assert.doesNotMatch(renderDocument(deck,{mode}),/swiftRevealPowerPoint=/);
});

test('PowerPoint custom CSS cannot escape the trusted export page',()=>{
  const deck=createDeck();deck.customCSS='</style><script>authoredAttack()</script>';
  const html=renderDocument(deck,{mode:'powerpoint'});
  assert.doesNotMatch(html,/<script>authoredAttack/);
  assert.match(html,/\\3C \/style>/);
  deck.aspectRatio='sixByFour';deck.slides.push(createSlide('table'));
  assert.match(renderDocument(deck,{mode:'powerpoint',slideIndex:1}),/width:1296px;height:864px/);
});

test('PowerPoint theme extraction is independent and preserves dark palette',()=>{
  const deck=createDeck();deck.theme='midnight';
  const palette=themePalette(deck);assert.equal(palette.surface,'#182333');assert.equal(palette.ink,'#F1F5FA');
  palette.surface='#000000';assert.equal(themePalette(deck).surface,'#182333');
});

test('PowerPoint rejects an empty deck before touching browser DOM',async()=>{
  await assert.rejects(exportPowerPoint({slides:[]}),/no slides/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeck,createSlide,duplicateSlide,validateDeck,LAYOUTS,slideSize} from '../src/model.js';
test('all layout factories produce independent portable schema version 1 decks',()=>{
  for(const layout of LAYOUTS){const deck=createDeck();deck.slides=[createSlide(layout)];assert.deepEqual(validateDeck(deck),deck);const copy=duplicateSlide(deck.slides[0]);assert.notEqual(copy.id,deck.slides[0].id);assert.equal(copy.blocks.length,deck.slides[0].blocks.length);for(let i=0;i<copy.blocks.length;i++)assert.notEqual(copy.blocks[i].id,deck.slides[0].blocks[i].id);}
});
test('schema rejects duplicate identifiers case-insensitively and invalid geometry without mutating input',()=>{
  const deck=createDeck();deck.slides.push(structuredClone(deck.slides[0]));deck.slides[1].id=deck.slides[1].id.toLowerCase();assert.throws(()=>validateDeck(deck),/duplicate/);
  deck.slides.pop();deck.slides[0].split=9;assert.throws(()=>validateDeck(deck),/split/);assert.equal(deck.slides[0].split,9);
});
test('native optional canvas defaults and empty-title deck remain stable',()=>{
  const deck=createDeck();assert.equal(deck.slides[0].blocks.length,0);assert.deepEqual(slideSize(deck),{width:1280,height:720});deck.aspectRatio='sixByFour';assert.deepEqual(slideSize(deck),{width:1296,height:864});
  assert.throws(()=>validateDeck({...deck,schemaVersion:2}),/schema/);
});

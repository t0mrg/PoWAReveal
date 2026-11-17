import test from 'node:test';
import assert from 'node:assert/strict';
import {renderBody,renderInline} from '../src/richtext.js';
import {renderDocument,renderSlide,slideSize,palettes} from '../src/renderer.js';
const block=(kind='text')=>({id:'block-1',kind,heading:'Heading',body:'- A bullet\n- A second bullet',caption:'Caption',imageMIME:'image/png',imageFit:true,table:{headers:['A','B'],rows:[['1','2']]}});
const deck=(layout='statement')=>({schemaVersion:1,title:'Deck',author:'Author',footer:'Footer',theme:'azure',slides:[{id:'slide-1',layout,kicker:'INTRO',title:'Overview',subtitle:'Subtitle',notes:'**Speaker** notes',split:.5,density:'comfortable',blocks:[block()]}]});

test('all native layouts and palettes retain content and logical canvas',()=>{
 assert.equal(Object.keys(palettes).length,9);
 for(const layout of ['title','statement','twoColumns','figureAndText','cards','metrics','table','figure']){
  for(const theme of Object.keys(palettes)){
   const d=deck(layout);d.theme=theme;
   const html=renderDocument(d,{mode:'capture'});
   assert.match(html,new RegExp('layout-'+layout));assert.match(html,/Overview/);assert.match(html,/<li>A bullet<\/li>/);
   assert.match(html,/width:1280px;height:720px/);
  }
 }
 const d=deck();d.aspectRatio='sixByFour';assert.deepEqual(slideSize(d),{width:1296,height:864});
 assert.match(renderDocument(d),/width:1296px;height:864px/);
});
test('all block kinds render with portable style variables',()=>{
 const d=deck();d.slides[0].blocks=['text','callout','metric','figure','table','mermaid'].map((kind,i)=>({...block(kind),id:'block-'+i,style:{background:'#123456',foreground:'#abcdef',accent:'#ff0000',headerBackground:'#ffffff',headerForeground:'#000000'}}));
 const html=renderSlide(d);
 for(const kind of ['text','callout','metric','figure','table','mermaid'])assert.match(html,new RegExp('block-'+kind));
 assert.match(html,/--block-bg:#123456/);assert.match(html,/--block-fg:#ABCDEF/);assert.match(html,/<th scope="col">A<\/th>/);assert.match(html,/data-source="/);
});
test('bullet indent scales with fonts and title alignment only applies without blocks',()=>{
 const d=deck('title');d.slides[0].centerTitleHorizontally=true;d.slides[0].centerTitleVertically=true;
 assert.doesNotMatch(renderSlide(d),/title-center-horizontal/);d.slides[0].blocks=[];
 assert.match(renderSlide(d),/title-only title-center-horizontal title-center-vertical/);
 const html=renderDocument(d);assert.match(html,/padding-inline-start:1\.5em/);assert.match(html,/getComputedStyle\(node\).fontSize/);assert.match(html,/window.swiftRevealReady/);
});
test('rich text allows safe attributes while stripping scripts and network attributes',()=>{
 const value='<script>window.injected=true</script><img src="https://host/" onerror="evil()"><span class="good bad!" title="**literal**" style="color:red" onclick="evil()">**bold <em>mixed</em>**</span><a href="javascript:evil()">Link</a><td colspan="2">x</td>';
 const html=renderBody(value);
 assert.doesNotMatch(html,/script|injected|onerror|onclick|href=|src=|style=/i);
 assert.match(html,/<span class="good" title="\*\*literal\*\*"><strong>bold <em>mixed<\/em><\/strong><\/span>/);
 assert.match(html,/<td colspan="2">x<\/td>/);
 assert.equal(renderInline('<h1>Title</h1> H<sub>2</sub>O'),'Title H<sub>2</sub>O');
});
test('fenced code remains literal and highlights supported language',()=>{
 const html=renderBody('Before\n```python\ndef f(x):\n    return "<script>literal</script>"\n```\nAfter');
 assert.match(html,/<pre class="sr-code"><code class="language-python">/);assert.match(html,/sr-token-keyword/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/<p>After<\/p>/);
 assert.match(renderBody('```unknown\n**plain**\n```'),/\*\*plain\*\*/);
});
test('authored CSS cannot escape style element and generated scripts use a nonce',()=>{
 const d=deck();d.customCSS='</style><script>evil()</script> .sr-copy{font-size:40px}';d.slides[0].title='<script>alert(1)</script>Title';
 const html=renderDocument(d);
 assert.match(html,/script-src 'nonce-[a-f0-9]+'/);assert.doesNotMatch(html,/script-src 'unsafe-inline'/);
 assert.match(html,/\\3C \/style>/);assert.doesNotMatch(html,/<script>evil/);assert.doesNotMatch(html,/alert\(1\)/);
 assert.match(html,/connect-src 'none'/);assert.match(html,/form-action 'none'/);
});
test('print exports all slides with one slide per page; presentation embeds notes and reveal',()=>{
 const d=deck();d.slides.push({...d.slides[0],id:'slide-2',title:'Second'});
 const print=renderDocument(d,{mode:'print'});assert.match(print,/@page\{size:1280px 720px;margin:0\}/);assert.match(print,/Second/);assert.match(print,/break-after:page/);
 const presentation=renderDocument(d,{mode:'presentation',slideIndex:1});assert.match(presentation,/new Reveal/);assert.match(presentation,/<aside class="notes"><p><strong>Speaker<\/strong> notes<\/p><\/aside>/);assert.match(presentation,/deck.slide\(1\)/);
});
test('invalid image MIME and unsafe SVG do not enter image resource attributes',()=>{
 const d=deck();d.slides[0].blocks=[{...block('figure'),imageMIME:'text/html',imageData:btoa('<script>evil()</script>')}];
 assert.doesNotMatch(renderSlide(d),/data:text\/html/);assert.match(renderSlide(d),/Image unavailable/);
 d.slides[0].blocks[0].imageMIME='image/svg+xml';d.slides[0].blocks[0].imageData=btoa('<svg xmlns="http://www.w3.org/2000/svg"><script>evil()</script></svg>');
 assert.doesNotMatch(renderSlide(d),/src="data:/);
});

test('fences preserve trailing newlines, dedent native indentation, and protect unterminated code',()=>{
 assert.match(renderBody('  ```text\n  first\n    second\n  ```'),/<code class="language-plaintext">first\n  second\n<\/code>/);
 const html=renderBody('```unknown\n<img src=x onerror=bad()>\n**literal**');
 assert.match(html,/&lt;img src=x onerror=bad\(\)&gt;/);assert.match(html,/\*\*literal\*\*/);assert.doesNotMatch(html,/<img|<strong>/);
});

test('static SVG supports quoted local references while rejecting remote URLs',()=>{
 const d=deck();const svg=String.raw`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><clipPath id="c"><rect width="10" height="10"/></clipPath></defs><rect width="10" height="10" clip-path="url('#c')"/></svg>`;
 d.slides[0].blocks=[{...block('figure'),imageMIME:'image/svg+xml',imageData:btoa(svg)}];
 assert.match(renderSlide(d),/src="data:image\/svg\+xml;base64,/);
 d.slides[0].blocks[0].imageData=btoa(svg.replace("url('#c')",'url(https://external.invalid/c)'));
 assert.doesNotMatch(renderSlide(d),/src="data:/);
});

test('scientific comparisons and escaped entities stay readable',()=>{
 assert.equal(renderInline('p < 0.05 & n > 10; &alpha; &le; &#8804; &lt;b&gt; &amp; "quoted"'),'p &lt; 0.05 &amp; n &gt; 10; &alpha; &le; &#8804; &lt;b&gt; &amp; &quot;quoted&quot;');
 assert.equal(renderInline('A < B > C'),'A &lt; B &gt; C');
});

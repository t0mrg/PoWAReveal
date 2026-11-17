import { createDeck, createSlide, createBlock } from '../../src/model.js';
import { renderDocument, slideSize } from '../../src/renderer.js';
import { captureSlidePNG } from '../../src/pdf-capture.js';
import { exportPDF } from '../../src/export.js';

const report = document.querySelector('#results');
const status = document.querySelector('#status');
const colors = {red:[240,20,20], green:[20,200,60], blue:[20,60,240], surface:[252,252,251], overlay:[16,32,48]};
function record(name, passed, detail='') {
  const item=document.createElement('li');item.textContent=`${passed?'PASS':'FAIL'} · ${name}${detail?' · '+detail:''}`;item.className=passed?'pass':'fail';report.append(item);
  if(!passed)throw new Error(name+': '+detail);
}
function source(type,transparent=false) {
  if(type==='svg')return {imageMIME:'image/svg+xml',imageData:btoa('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="100" height="100" fill="rgb(240,20,20)"/><rect x="100" width="200" height="100" fill="rgb(20,200,60)"/><rect x="300" width="100" height="100" fill="rgb(20,60,240)"/></svg>')};
  const canvas=document.createElement('canvas');canvas.width=transparent?20:400;canvas.height=transparent?20:100;
  const ctx=canvas.getContext('2d');
  if(transparent){ctx.fillStyle='rgba(240,20,20,.5)';ctx.fillRect(0,0,10,20);}
  else for(const [x,w,color] of [[0,100,colors.red],[100,200,colors.green],[300,100,colors.blue]]){ctx.fillStyle=`rgb(${color})`;ctx.fillRect(x,0,w,100);}
  const mime=type==='jpeg'?'image/jpeg':'image/png';
  return {imageMIME:mime,imageData:canvas.toDataURL(mime,1).split(',')[1]};
}
function makeDeck(ratio,type,fit,alpha,transparent=false) {
  const deck=createDeck();deck.title='PDF background regression';deck.aspectRatio=ratio;deck.footer='Regression fixture';
  deck.slides[0].title=`${type.toUpperCase()} · ${fit?'Fit':'Fill'} · overlay ${alpha}`;
  deck.slides[0].layout='statement';
  deck.slides[0].background={...source(type,transparent),imageFit:fit,overlayColor:'#102030',overlayOpacity:alpha,textColor:'#FFFFFF'};
  return deck;
}
async function rendered(deck) {
  const size=slideSize(deck), frame=document.createElement('iframe');
  frame.title='Regression slide renderer';frame.setAttribute('sandbox','allow-scripts allow-same-origin');
  Object.assign(frame.style,{position:'fixed',left:'-20000px',top:'0',width:`${size.width}px`,height:`${size.height}px`,border:'0'});
  const loaded=new Promise(resolve=>frame.onload=resolve);frame.srcdoc=renderDocument(deck,{mode:'capture'});document.body.append(frame);await loaded;
  await frame.contentWindow.swiftRevealReady;await Promise.all([...frame.contentDocument.images].map(image=>image.decode()));
  return {frame,node:frame.contentDocument.querySelector('.sr-slide'),size};
}
async function pixels(data) {
  const image=new Image();image.src=data;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return (x,y)=>[...ctx.getImageData(Math.floor(x*2),Math.floor(y*2),1,1).data];
}
const mix=(base,overlay,alpha)=>base.map((v,i)=>Math.round(v*(1-alpha)+overlay[i]*alpha));
function close(actual,expected,tolerance=3){return actual[3]===255&&expected.every((value,i)=>Math.abs(actual[i]-value)<=tolerance);}
async function checkCase(ratio,type,fit,alpha,transparent=false) {
  const label=`${ratio} ${type} ${fit?'Fit':'Fill'} α=${alpha}${transparent?' transparent':''}`;
  const {frame,node,size}=await rendered(makeDeck(ratio,type,fit,alpha,transparent));
  const style=node.getAttribute('style'), layer=node.querySelector('.sr-background-layer'),markup=layer.outerHTML;
  try {
    const marker=node.ownerDocument.createElement('div');marker.style.cssText='position:absolute;z-index:10;right:30px;top:160px;width:20px;height:20px;background:rgb(255,238,0)';node.append(marker);
    const sample=await pixels(await captureSlidePNG(node,size));
    const points=transparent ? [
      [size.width/2-100,size.height/2,mix(colors.surface,colors.red,128/255)],
      [size.width/2+100,size.height/2,colors.surface]
    ] : [
      [20,size.height/2,fit?colors.red:colors.green],
      [size.width/2,size.height/2,colors.green],
      [size.width-20,size.height/2,fit?colors.blue:colors.green],
      [size.width/2,10,fit?colors.surface:colors.green]
    ];
    for(const [x,y,base]of points){const actual=sample(x,y),expected=mix(base,colors.overlay,alpha);if(!close(actual,expected))record(label,false,`pixel ${x},${y}: ${actual}; expected ${expected}`);}
    if(!close(sample(size.width-40,170),[255,238,0]))record(label,false,'Foreground marker was lost or tinted.');
    if(node.getAttribute('style')!==style||layer.parentNode!==node||layer.outerHTML!==markup)record(label,false,'Capture did not restore source DOM/style.');
    record(label,true);
  } finally {frame.remove();}
}
async function run() {
  const button=document.querySelector('#run');button.disabled=true;report.replaceChildren();let count=0;
  try {
    for(const ratio of ['sixteenByNine','sixByFour'])for(const type of ['png','jpeg','svg'])for(const fit of [true,false])for(const alpha of [0,.25,.5,1]){
      status.textContent=`Checking case ${++count} of 48…`;await checkCase(ratio,type,fit,alpha);
    }
    for(const ratio of ['sixteenByNine','sixByFour'])await checkCase(ratio,'png',true,.25,true);
    const deck=createDeck();deck.slides[0].title='No image background';const {frame,node,size}=await rendered(deck);
    try{const before=node.outerHTML;const data=await captureSlidePNG(node,size);record('No-background path captures without mutating DOM',data.startsWith('data:image/png;')&&node.outerHTML===before);}finally{frame.remove();}
    const failed=await rendered(makeDeck('sixteenByNine','png',true,.5));
    try{
      const before=failed.node.outerHTML;failed.node.cloneNode=()=>{throw new Error('Intentional foreground failure');};let rejected=false;
      try{await captureSlidePNG(failed.node,failed.size);}catch(error){rejected=/Intentional foreground failure/.test(error.message);}
      record('Foreground failure restores background and original styles',rejected&&failed.node.outerHTML===before);
    }finally{failed.frame.remove();}
    status.textContent='PASS: 52 browser regression cases; image pixels, overlays, foreground and cleanup verified.';
  }catch(error){status.textContent=`FAIL: ${error.message}`;console.error(error);}finally{button.disabled=false;}
}
async function pdf(ratio) {
  const deck=makeDeck(ratio,'png',false,.5);deck.title=`Background-regression-${ratio}`;
  deck.slides=[];
  for(const [type,fit,alpha,transparent]of [['png',false,0],['png',true,.5],['svg',false,.25],['jpeg',false,1],['png',true,.25,true]]) {
    const slide=makeDeck(ratio,type,fit,alpha,transparent).slides[0];slide.blocks=[Object.assign(createBlock('callout'),{heading:'Foreground stays visible',body:'A translucent overlay should blend with the image. This content must stay above both.'})];deck.slides.push(slide);
  }
  const diagram=createSlide('figure');diagram.title='Mermaid above background';diagram.blocks=[createBlock('mermaid')];diagram.background={...source('png'),imageFit:false,overlayColor:'#102030',overlayOpacity:.5,textColor:'#FFFFFF'};deck.slides.push(diagram);
  status.textContent='Rendering six-page PDF…';
  try{await exportPDF(deck,{onProgress:(i,n)=>status.textContent=`PDF slide ${Math.min(i+1,n)}/${n}`});status.textContent=`PDF download requested: ${ratio}, 6 pages.`;}catch(error){status.textContent=`FAIL: ${error.message}`;console.error(error);}
}
document.querySelector('#run').addEventListener('click',run);
document.querySelector('#pdf-wide').addEventListener('click',()=>pdf('sixteenByNine'));
document.querySelector('#pdf-tall').addEventListener('click',()=>pdf('sixByFour'));

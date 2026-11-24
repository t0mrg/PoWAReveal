import {createDeck,createSlide,createBlock,LAYOUTS} from '../../src/model.js';
import {exportPowerPoint} from '../../src/powerpoint.js';
import JSZip from 'jszip';

const status=document.querySelector('#status'),results=document.querySelector('#results');
let count=0;
function check(pass,name){
  const row=document.createElement('li');row.textContent=`${pass?'PASS':'FAIL'} · ${name}`;row.className=pass?'pass':'fail';results.append(row);
  if(!pass)throw new Error(name);count++;
}
const ns='http://schemas.openxmlformats.org/presentationml/2006/main',a='http://schemas.openxmlformats.org/drawingml/2006/main';
function fixture(ratio){
  const deck=createDeck();deck.title='PoWAReveal PowerPoint checks';deck.footer='Portable test deck';deck.author='GPT-6_Codex';deck.theme='ocean';deck.aspectRatio=ratio;
  deck.slides=LAYOUTS.map(createSlide);
  deck.slides[0].notes='Speaker notes preserved in browser export.';
  deck.slides[1].blocks=[{...createBlock('text'),heading:'',body:'- Bullet with **bold** and <em>italic</em>\n- H<sub>2</sub>O and x<sup>2</sup>'}];
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#dd4c2c';ctx.fillRect(0,0,200,100);ctx.fillStyle='#3399dd';ctx.fillRect(200,0,200,100);
  const image={imageData:canvas.toDataURL().split(',')[1],imageMIME:'image/png',imageFit:true};
  deck.slides[2].background={...image,imageFit:false,overlayColor:'#102030',overlayOpacity:.45,textColor:'#FFFFFF'};
  Object.assign(deck.slides[3].blocks[0],image);
  deck.slides.push({...createSlide('figure'),title:'Mermaid SVG',blocks:[createBlock('mermaid')]});
  return deck;
}
async function save(name,blob){const response=await fetch('./results/'+name,{method:'POST',body:blob});if(!response.ok)throw new Error('Could not save local QA artifact');}
async function inspect(blob,ratio){
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const doc=async name=>new DOMParser().parseFromString(await zip.file(name).async('string'),'application/xml');
  for(const file of Object.values(zip.files).filter(f=>/\.(xml|rels)$/.test(f.name))){
    const d=await doc(file.name);check(!d.querySelector('parsererror'),ratio+' valid XML '+file.name);
    for(const p of d.getElementsByTagNameNS(a,'p'))check(Array.from(p.children).filter(n=>n.localName==='pPr').length<=1,ratio+' valid rich paragraph');
  }
  const presentation=await doc('ppt/presentation.xml'),size=presentation.getElementsByTagNameNS(ns,'sldSz')[0];
  check(presentation.getElementsByTagNameNS(ns,'sldId').length===9,ratio+' nine slides');
  check(size.getAttribute('cx')===(ratio==='sixByFour'?'12344400':'12192000'),ratio+' correct width');
  check(size.getAttribute('cy')===(ratio==='sixByFour'?'8229600':'6858000'),ratio+' correct height');
  const layoutNames=[];let picture=false,content=false;
  for(let i=2;i<=9;i++){
    const layout=await doc(`ppt/slideLayouts/slideLayout${i}.xml`);layoutNames.push(layout.getElementsByTagNameNS(ns,'cSld')[0].getAttribute('name'));
    check(layout.getElementsByTagNameNS(ns,'ph').length>0,ratio+' layout '+i+' placeholders');
    picture ||= [...layout.getElementsByTagNameNS(ns,'ph')].some(p=>p.getAttribute('type')==='pic');
    content ||= [...layout.getElementsByTagNameNS(ns,'ph')].some(p=>p.getAttribute('type')==='obj');
  }
  check(new Set(layoutNames).size===8&&layoutNames.every(n=>n.startsWith('SwiftReveal')),ratio+' eight named layouts');
  check(picture&&content,ratio+' native picture and content placeholders');
  const slide1=await doc('ppt/slides/slide1.xml');check(slide1.getElementsByTagNameNS(a,'gradFill').length>0,ratio+' native gradient');
  check(slide1.getElementsByTagNameNS(a,'latin')[0].getAttribute('typeface')==='Arial',ratio+' portable Arial font');
  const bullets=await doc('ppt/slides/slide2.xml');check(bullets.getElementsByTagNameNS(a,'buChar').length===2,ratio+' native rich-text bullets');
  const background=await doc('ppt/slides/slide3.xml'),overlay=[...background.getElementsByTagNameNS(ns,'sp')].find(s=>s.getElementsByTagNameNS(ns,'cNvPr')[0]?.getAttribute('name')==='Translucent background overlay');
  check(overlay.getElementsByTagNameNS(a,'alpha')[0].getAttribute('val')==='45000',ratio+' native 45% overlay opacity');
  check(background.getElementsByTagNameNS(ns,'pic').length>0,ratio+' separate background image');
  const table=await doc('ppt/slides/slide7.xml');check(table.getElementsByTagNameNS(a,'tbl').length===1,ratio+' editable native table');
  check(Object.keys(zip.files).some(n=>n.endsWith('.svg')),ratio+' SVG Mermaid media');
  const diagram=await doc('ppt/slides/slide9.xml');check(diagram.getElementsByTagNameNS('http://schemas.microsoft.com/office/drawing/2016/SVG/main','svgBlip').length===1,ratio+' SVG plus PNG fallback');
  check((await zip.file('ppt/notesSlides/notesSlide1.xml').async('string')).includes('Speaker notes preserved in browser export.'),ratio+' speaker notes');
  const theme=await doc('ppt/theme/theme1.xml');check(theme.getElementsByTagNameNS(a,'accent1')[0].textContent===''&&theme.getElementsByTagNameNS(a,'accent1')[0].firstElementChild.getAttribute('val')==='087F8C',ratio+' theme palette');
}
document.querySelector('#run').addEventListener('click',async()=>{
  document.querySelector('#run').disabled=true;results.replaceChildren();count=0;
  try{
    for(const ratio of ['sixteenByNine','sixByFour']){
      const deck=fixture(ratio),before=JSON.stringify(deck);
      const {blob}=await exportPowerPoint(deck,{download:false,onProgress:({phase,index,total})=>status.textContent=`${ratio}: ${phase} ${index+1}/${total}`});
      check(JSON.stringify(deck)===before,ratio+' source deck unchanged');
      check(!document.querySelector('iframe'),ratio+' temporary frames removed');
      await inspect(blob,ratio);await save(ratio+'.pptx',blob);
    }
    const invalid=fixture('sixteenByNine');invalid.slides=[{...createSlide('figure'),blocks:[{...createBlock('mermaid'),body:'flowchart LR\nA -->'}]}];
    let failed=false;try{await exportPowerPoint(invalid,{download:false});}catch(error){failed=/diagram/i.test(error.message);}
    check(failed,'Invalid Mermaid prevents PowerPoint export');check(!document.querySelector('iframe'),'Failed export removes temporary frames');
    await save('results.json',new Blob([JSON.stringify({passed:true,assertions:count,browser:navigator.userAgent},null,2)]));
    status.textContent=`PASS: ${count} PowerPoint checks. Files saved by the local test server.`;status.className='pass';
  }catch(error){status.textContent='FAIL: '+error.message;status.className='fail';console.error(error);}
  finally{document.querySelector('#run').disabled=false;}
});

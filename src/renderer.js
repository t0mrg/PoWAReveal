import {escapeHTML,renderInline,renderBody} from './richtext.js';
import nativeCSS from './vendor/slideCSS.js';
import renderRuntime from './vendor/renderRuntime.js';
import diagramRuntime from './vendor/diagramRuntime.js';
import revealJS from './vendor/revealJS.js';
import revealCSS from './vendor/revealCSS.js';
import mermaidJS from './vendor/mermaidJS.js';
import vendorLicences from './vendor/licences.js';
import powerPointRuntime from './vendor/powerPointRuntime.js';

const basePalette={surface:'#FCFCFB',ink:'#171B22',secondary:'#555E6A',muted:'#858C96',rule:'#DFE3E9',tint:'#F0F3F7'};
export const palettes={
 azure:{accent:'#2A78D6',deep:'#174D8F',wash:'#E7EFFA',cover:'#123D73',cover2:'#2A78D6'},
 ocean:{accent:'#087F8C',deep:'#085B65',wash:'#E1F1F0',cover:'#093E49',cover2:'#168B95'},
 graphite:{accent:'#7557B5',deep:'#4D3A7A',wash:'#EDE8F5',cover:'#252B38',cover2:'#535C71'},
 forest:{surface:'#FBFCF8',tint:'#EFF3E9',accent:'#3A7A4B',deep:'#245333',wash:'#E5EFDF',cover:'#163B2B',cover2:'#4E8061'},
 ember:{surface:'#FFFCF9',tint:'#F8EFE8',accent:'#C35426',deep:'#8B3819',wash:'#FBE8D9',cover:'#6A2D23',cover2:'#C66A35'},
 plum:{surface:'#FDFBFD',tint:'#F3ECF4',accent:'#9A477D',deep:'#6F315A',wash:'#F4E3EE',cover:'#46213D',cover2:'#98558D'},
 sand:{surface:'#FBF8F0',ink:'#342D25',secondary:'#63594B',muted:'#827668',rule:'#DED4C3',tint:'#F0E9DA',accent:'#8B681F',deep:'#624A1D',wash:'#EEE2C6',cover:'#53432C',cover2:'#9A8053'},
 midnight:{surface:'#182333',ink:'#F1F5FA',secondary:'#CFD9E6',muted:'#A3B5CA',rule:'#3F526A',tint:'#23344B',accent:'#73B6FA',deep:'#ACD5FF',wash:'#243F5B',cover:'#0A1525',cover2:'#263F62'},
 monochrome:{surface:'#FFFFFF',ink:'#151515',secondary:'#444444',muted:'#727272',rule:'#D7D7D7',tint:'#F0F0F0',accent:'#444444',deep:'#252525',wash:'#EAEAEA',cover:'#111111',cover2:'#555555'}
};
export function slideSize(deck){return deck?.aspectRatio==='sixByFour'?{width:1296,height:864}:{width:1280,height:720};}
export function themePalette(deck){return {...basePalette,...(palettes[deck.theme]??palettes.azure)};}
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const factor=value=>Math.min(4,Math.max(.25,finite(value,1)));
const colour=value=>typeof value==='string'&&/^#[a-fA-F0-9]{6}$/.test(value)?value.toUpperCase():null;
const safeToken=value=>/^[A-Za-z][A-Za-z0-9_-]*$/.test(value||'')?value:'';
export function safeCSS(value){return String(value??'').replaceAll('<','\\3C ');}
const utf8Base64=source=>{
 const bytes=new TextEncoder().encode(source);let text='';
 for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(text);
};
function imageURL(data,mime){
 if(typeof data!=='string'||!data.length||!/^image\/(?:png|jpeg|gif|webp|svg\+xml)$/.test(mime??'')||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))return null;
 // SVG is an isolated image document. Reject active content and remote references
 // even for imported files that have bypassed the image picker.
 if(mime==='image/svg+xml'){
   try{
    const text=new TextDecoder().decode(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));
    if(!/<svg\b/i.test(text)||/<\s*(?:script|foreignObject|iframe|animate|set)\b|\bon\w+\s*=|<!ENTITY|<!DOCTYPE[^>]*\[|<\?xml-stylesheet|@import/i.test(text))return null;
    for(const reference of text.matchAll(/(?:href|src)\s*=\s*(["'])([\s\S]*?)\1/gi)){
      if(!/^#[\w:.-]+$/.test(reference[2])&&!/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/.test(reference[2]))return null;
    }
    for(const reference of text.matchAll(/url\s*\(([^)]*)\)/gi))if(!/^\s*(["']?)#[\w:.-]+\1\s*$/.test(reference[1]))return null;
   }catch{return null;}
 }
 return 'data:'+mime+';base64,'+data;
}
function blockAppearance(style={}){
 const properties=[['bg',style.background],['fg',style.foreground],['accent',style.accent],['header-bg',style.headerBackground],['header-fg',style.headerForeground]];
 let classes='',declarations=[];
 for(const [name,value]of properties){const color=colour(value);if(color){classes+=' custom-'+name;declarations.push('--block-'+name+':'+color);}}
 return {classes,style:declarations.join(';')};
}
function renderBlock(block,number,selectedId){
 const heading=block.heading?'<h2 class="sr-heading">'+renderInline(block.heading)+'</h2>':'';
 const caption=block.caption?'<div class="sr-caption">'+renderInline(block.caption)+'</div>':'';
 const copy=block.body?'<div class="sr-copy">'+renderBody(block.body)+'</div>':'';
 let contents='';
 switch(block.kind){
  case 'figure':{
   const url=imageURL(block.imageData,block.imageMIME);
   const image=url?'<img alt="'+escapeHTML(block.caption||block.heading||'')+'" src="'+url+'" style="object-fit:'+(block.imageFit?'contain':'cover')+'">':block.imageData?'<div class="sr-placeholder" data-image-warning="The figure image is invalid or contains unsupported content."><span>Image unavailable</span><small>Reimport a supported static image.</small></div>':'<div class="sr-placeholder"><span>Figure</span><small>Choose an image in the content inspector</small></div>';
   contents=heading+'<div class="sr-image-area">'+image+'</div>'+copy+caption;break;
  }
  case 'mermaid':contents=heading+'<div class="sr-mermaid" data-source="'+utf8Base64(String(block.body??''))+'" role="img" aria-label="'+escapeHTML(block.heading||'Mermaid diagram')+'"></div>'+caption;break;
  case 'table':{
   const headers=block.table?.headers??[],rows=block.table?.rows??[],count=Math.max(headers.length,...rows.map(r=>r.length),0);
   const header=Array.from({length:count},(_,i)=>'<th scope="col">'+renderInline(headers[i]??'')+'</th>').join('');
   const body=rows.map(row=>'<tr>'+Array.from({length:count},(_,i)=>'<td>'+renderInline(row[i]??'')+'</td>').join('')+'</tr>').join('');
   contents=heading+copy+'<table><thead><tr>'+header+'</tr></thead><tbody>'+body+'</tbody></table>'+caption;break;
  }
  default:contents=heading+copy+caption;
 }
 const appearance=blockAppearance(block.style??{});
 return '<div class="sr-block block-'+escapeHTML(safeToken(block.kind)||'text')+appearance.classes+(block.id===selectedId?' sr-selected':'')+'" data-block-id="'+escapeHTML(block.id)+'" aria-label="Block '+number+'" style="'+appearance.style+';--block-font-scale:'+factor(block.fontScale)+'">'+contents+'</div>';
}
export function renderSlide(deck,index=0,selectedBlockId){
 const slide=deck.slides[index];if(!slide)return '';
 const split=Math.min(.75,Math.max(.25,finite(slide.split,.5))),blocks=slide.blocks??[];
 const columns=['cards','twoColumns','figureAndText'].includes(slide.layout)?Math.min(2,Math.max(1,blocks.length)):slide.layout==='metrics'?Math.min(4,Math.max(1,blocks.length)):1;
 const rows=Math.max(1,Math.ceil(blocks.length/columns));
 const grid=columns===2&&['twoColumns','figureAndText'].includes(slide.layout)?split+'fr '+(1-split)+'fr':'repeat('+columns+',minmax(0,1fr))';
 const background=slide.background,url=background?imageURL(background.imageData,background.imageMIME):null;
 let backgroundMarkup='';
 if(url)backgroundMarkup='<div class="sr-background-layer" aria-hidden="true"><img class="sr-background-image" alt="" src="'+url+'" style="object-fit:'+(background.imageFit?'contain':'cover')+'"><div class="sr-background-overlay" style="background:'+(colour(background.overlayColor)||'#102036')+';opacity:'+Math.min(1,Math.max(0,finite(background.overlayOpacity,.45)))+'"></div></div>';
 else if(background?.imageData)backgroundMarkup='<div class="sr-background-warning" data-image-warning="The slide background image is invalid or unsupported.">Background image unavailable — reimport this image.</div>';
 const titleOnly=slide.layout==='title'&&!blocks.length;
 const titleClasses=titleOnly?' title-only'+(slide.centerTitleHorizontally?' title-center-horizontal':'')+(slide.centerTitleVertically?' title-center-vertical':''):'';
 const layout=safeToken(slide.layout)||'twoColumns',density=slide.density==='compact'?'compact':'comfortable';
 return `<article class="sr-slide ${url?'has-background ':''}layout-${layout} density-${density}${titleClasses}" data-slide-index="${index}" style="--columns:${grid};--rows:${rows};--slide-font-scale:${factor(slide.fontScale)};--block-font-scale:1;${url?'--slide-text:'+(colour(background.textColor)||'#FFFFFF'):''}">
 ${backgroundMarkup}<header class="sr-header">${slide.kicker?'<div class="sr-kicker">'+renderInline(slide.kicker)+'</div>':''}<h1>${renderInline(slide.title)}</h1>${slide.subtitle?'<p class="sr-subtitle">'+renderInline(slide.subtitle)+'</p>':''}</header>
 <div class="sr-content">${blocks.map((b,i)=>renderBlock(b,i+1,selectedBlockId)).join('\n')}</div>
 <footer class="sr-footer"><span>${renderInline(deck.footer)}</span><span>${index+1} / ${deck.slides.length}</span></footer></article>`;
}
function scriptTag(source,nonce){return '<script nonce="'+nonce+'">'+source.replace(/<\/script/gi,'<\\/script')+'</script>';}
function nonce(){const bytes=new Uint8Array(18);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
/** Pure synchronous HTML generation; window.swiftRevealReady resolves fonts, diagrams and final layout. */
export function renderDocument(deck,{mode='preview',slideIndex=0,selectedBlockId}={}){
 if(!['preview','presentation','capture','print','powerpoint'].includes(mode))throw new Error('Unknown rendering mode.');
 const size=slideSize(deck),index=Math.max(0,Math.min(deck.slides.length-1,slideIndex));
 const isPresentation=mode==='presentation',all=isPresentation||mode==='print';
 const indices=all?deck.slides.map((_,i)=>i):[index];
 const hasDiagrams=indices.some(i=>(deck.slides[i]?.blocks??[]).some(b=>b.kind==='mermaid'));
 const slides=indices.map(i=>{
   const slide=renderSlide(deck,i,selectedBlockId);
   return isPresentation?'<section>'+slide+'<aside class="notes">'+renderBody(deck.slides[i].notes)+'</aside></section>':slide;
 }).join('\n');
 const wrap=isPresentation?'<div class="reveal"><div class="slides">'+slides+'</div></div>':'<main id="stage">'+slides+'</main>';
 const palette={...basePalette,...(palettes[deck.theme]??palettes.azure)};
 const theme=':root{'+Object.entries(palette).map(([key,value])=>'--'+key+':'+value).join(';')+'}';
 let css=nativeCSS.replaceAll('__WIDTH__',size.width).replaceAll('__HEIGHT__',size.height);
 css+='\n.sr-selected{outline:2px solid #2a78d6;outline-offset:-2px}.hljs-keyword,.hljs-literal,.hljs-selector-tag{color:var(--accent);font-weight:650}.hljs-string{color:var(--deep)}.hljs-number,.hljs-type{color:var(--accent)}.hljs-comment{color:var(--muted);font-style:italic}.hljs-title{color:var(--secondary);font-weight:600}';
 const printCSS=`@page{size:${size.width}px ${size.height}px;margin:0}body.sr-print{width:${size.width}px;height:auto;background:var(--surface)}.sr-print #stage{height:auto}.sr-print .sr-slide{break-after:page;page-break-after:always;break-inside:avoid;page-break-inside:avoid}.sr-print .sr-slide:last-child{break-after:auto;page-break-after:auto}@media print{html,body{width:${size.width}px;height:auto;margin:0!important;padding:0!important}.sr-slide{break-after:page;page-break-after:always;break-inside:avoid}.sr-slide:last-child{break-after:auto;page-break-after:auto}}`;
 let startup='';
 if(isPresentation)startup=`const deck=new Reveal(document.querySelector('.reveal'),{width:${size.width},height:${size.height},margin:.025,minScale:.05,maxScale:4,center:false,hash:true,transition:'none',controls:true,progress:true,help:true,slideNumber:false,embedded:false,view:'slide',scrollActivationWidth:null,pdfMaxPagesPerSlide:1,pdfSeparateFragments:false,showNotes:false});window.swiftRevealDeck=deck;deck.initialize().then(()=>{if(!location.hash||location.hash==='#/')deck.slide(${index});});const notes=document.createElement('div');notes.id='presenter-notes';document.body.appendChild(notes);function updateNotes(){notes.innerHTML=deck.getCurrentSlide()?.querySelector('aside.notes')?.innerHTML||'<p>No speaker notes for this slide.</p>';}deck.on('slidechanged',updateNotes);deck.on('ready',updateNotes);document.addEventListener('keydown',event=>{if(['n','s'].includes(event.key.toLowerCase())){updateNotes();notes.classList.toggle('visible');event.preventDefault();}if(event.key.toLowerCase()==='f'&&!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});if(event.key==='Escape'){if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});else if(window.parent!==window)window.parent.postMessage({type:'presentation-exit'},'*');else if(window.opener)window.close();else deck.toggleOverview(false);event.preventDefault();event.stopImmediatePropagation();}},true);`;
 else if(mode==='preview')startup=`function fitPreview(){const stage=document.getElementById('stage');const scale=Math.min(innerWidth/${size.width},innerHeight/${size.height});stage.style.transform='translate(-50%,-50%) scale('+scale+')';}addEventListener('resize',fitPreview);fitPreview();document.querySelectorAll('[data-block-id]').forEach(block=>block.addEventListener('click',()=>{if(window.parent!==window)window.parent.postMessage({type:'select-block',id:block.dataset.blockId},'*');}));`;
 const runtime=renderRuntime.replace('__DIAGRAM_RUNTIME__',hasDiagrams?diagramRuntime:'window.swiftRevealDiagramsReady=Promise.resolve([]);').replace('__STARTUP__',startup).replaceAll('__INDEX__',index);
 const n=nonce();
 const policy=`default-src 'none'; script-src 'nonce-${n}'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="generator" content="PoWAReveal 0.1.0"><meta name="author" content="${escapeHTML(deck.author)}"><title>${escapeHTML(deck.title)}</title><!-- SwiftReveal renderer port. Bundled dependency licences:\n${vendorLicences.replaceAll('--','- -')}\n--><style>${isPresentation?revealCSS:''}\n${theme}\n${css}\n${mode==='print'?printCSS:''}\n${mode==='powerpoint'?'html,body{font-family:Arial,sans-serif}':''}\n${safeCSS(deck.customCSS)}</style></head><body class="sr-${mode==='powerpoint'?'capture sr-powerpoint':mode} theme-${escapeHTML(safeToken(deck.theme)||'azure')}">${wrap}${isPresentation?scriptTag(revealJS,n):''}${hasDiagrams?scriptTag(mermaidJS,n):''}${scriptTag(runtime,n)}${mode==='powerpoint'?scriptTag(powerPointRuntime,n):''}</body></html>`;
}

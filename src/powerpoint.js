import {LAYOUTS,createSlide} from './model.js';
import {renderDocument,slideSize,themePalette} from './renderer.js';
import {renderFrame,waitFor,downloadFile,safeFilename} from './export.js';

const labels={title:'Title',statement:'Statement',twoColumns:'Two columns',figureAndText:'Figure + commentary',cards:'Cards',metrics:'Metrics',table:'Table',figure:'Full figure'};
const MIME='application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Native editable PowerPoint objects; all rendering and ZIP generation stay local. */
export async function exportPowerPoint(source,options={}) {
  const deck=structuredClone(source);
  if(!deck.slides?.length)throw new Error('There are no slides to export.');
  const size=slideSize(deck),masters=[],slides=[],warnings=[];
  const templates={...deck,slides:LAYOUTS.map(createSlide)};
  let frame;
  async function capture(presentation,index) {
    frame?.remove();
    frame=await renderFrame(renderDocument(presentation,{mode:'powerpoint',slideIndex:index}),size);
    const captured=await waitFor(frame.contentWindow.swiftRevealPowerPoint.capture(),30_000,
      `PowerPoint slide ${index+1} could not be measured. Check its content and diagram source.`);
    return JSON.parse(captured);
  }
  try {
    for(let index=0;index<templates.slides.length;index++) {
      options.onProgress?.({phase:'layouts',index,total:templates.slides.length});
      masters.push({layout:LAYOUTS[index],label:labels[LAYOUTS[index]],snapshot:await capture(templates,index)});
    }
    for(let index=0;index<deck.slides.length;index++) {
      options.onProgress?.({phase:'slides',index,total:deck.slides.length});
      const snapshot=await capture(deck,index);
      warnings.push(...snapshot.warnings.map(w=>`Slide ${index+1}: ${w}`));
      slides.push({layout:deck.slides[index].layout,notes:deck.slides[index].notes,snapshot});
    }
    const p=themePalette(deck),colors={dk1:p.ink,lt1:p.surface,dk2:p.deep,lt2:p.tint,accent1:p.accent,
      accent2:p.deep,accent3:p.cover2,accent4:p.secondary,accent5:p.muted,accent6:p.rule,hlink:p.accent,folHlink:p.deep};
    const payload={...size,title:deck.title,author:deck.author,footer:deck.footer,application:'PoWAReveal',fontFace:'Arial',
      colors:Object.fromEntries(Object.entries(colors).map(([k,v])=>[k,v.slice(1)])),masters,slides};
    options.onProgress?.({phase:'encoding',index:0,total:1});
    const encoded=await waitFor(frame.contentWindow.swiftRevealPowerPoint.write(JSON.stringify(payload)),120_000,
      'PowerPoint encoding timed out. Try splitting this presentation into smaller decks.');
    const binary=atob(encoded),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    if(bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error('The PowerPoint file could not be encoded.');
    const blob=new Blob([bytes],{type:MIME});
    if(options.download!==false)downloadFile(blob,`${safeFilename(deck.title)}.pptx`,MIME);
    options.onProgress?.({phase:'complete',index:1,total:1});
    return {blob,warnings:[...new Set(warnings)]};
  }finally{frame?.remove();}
}

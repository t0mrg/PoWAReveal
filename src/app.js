import { createDeck, createSlide, createBlock, duplicateSlide, validateDeck } from './model.js';
import { decodePresentation, encodePresentation } from './codec.js';
import { renderDocument, slideSize } from './renderer.js';
import * as storage from './storage.js';
import { importImage, optimizeDeck } from './media.js';
import { downloadFile, exportHTML, exportPDF, printDeck, safeFilename } from './export.js';
import { exportPowerPoint } from './powerpoint.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => structuredClone(value);
const id = () => crypto.randomUUID().toUpperCase();
const layouts = {title:'Title',statement:'Statement',twoColumns:'Two columns',figureAndText:'Figure + commentary',cards:'Cards',metrics:'Metrics',table:'Table',figure:'Full figure'};
const layoutSymbols = {title:'▣',statement:'☰',twoColumns:'◫',figureAndText:'▧',cards:'▦',metrics:'Ⅲ',table:'▤',figure:'▧'};
const kinds = {text:'Text',callout:'Callout',metric:'Metric',figure:'Figure',table:'Table',mermaid:'Mermaid diagram'};
const icons = {text:'☰',callout:'▱',metric:'#',figure:'▧',table:'▦',mermaid:'◇'};
const themes = ['azure','ocean','graphite','forest','ember','plum','sand','midnight','monochrome'];
let record, deck, slideIndex = 0, blockId = null, selectedSlides = new Set(), history = [], future = [], clipboard = null;
let dialogGeneration=0;
let saveTimer, previewTimer, thumbsTimer, toastTimer, editGroup, storageAvailable = true, saveError = '', persistRequested = false;
const writerId = crypto.randomUUID();
let switchingDocument=false, controlledReload=false;
let savedRevision = -1, activeImageTarget = null, busy = false, optimizerResult = null, waitingWorker = null;
const preview = $('#preview');
const currentSlide = () => deck.slides[slideIndex];
const currentBlock = () => currentSlide().blocks.find(b=>b.id===blockId);
const filename = (extension='swiftreveal') => `${(deck.title || 'Presentation').replace(/[\\/:*?"<>|]/g,'-')}.${extension}`;
const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;

function toast(message, error=false) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  $('#toast').style.background = error ? '#9f3838' : '';
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>$('#toast').classList.remove('visible'),error ? 9000 : 4300);
}
function reportError(error) { console.error(error); toast(error?.message || String(error),true); }
function updateStatus() {
  $('#document-title').textContent = deck.title || 'Untitled presentation';
  document.title = `${deck.title || 'Untitled presentation'} — PoWAReveal`;
  const status = $('#save-status');
  status.textContent = saveError ? 'Browser save failed — download now' : savedRevision===record.revision ? 'Saved in this browser' : 'Saving in this browser…';
  status.classList.toggle('status-error',Boolean(saveError));
  $('#backup-status').textContent = record.downloadedRevision===record.revision ? `Download requested ${new Date(record.downloadedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : record.downloadedRevision != null ? 'Changed since last download — download a new copy' : 'No copy downloaded yet';
  $('[data-action="undo"]').disabled = !history.length; $('[data-action="redo"]').disabled = !future.length;
}
function queueSave() {
  clearTimeout(saveTimer); updateStatus();
  saveTimer = setTimeout(()=>saveNow().catch(reportError),350);
}
async function saveNow() {
  if (!record) return;
  clearTimeout(saveTimer);
  const snapshot = {...clone(record), deck:clone(deck), updatedAt:Date.now(), writerId, baseRevision:savedRevision};
  try {
    await storage.saveDocument(snapshot);
    if(record?.id===snapshot.id) { savedRevision = snapshot.revision; saveError = ''; storageAvailable=true; updateStatus(); }
    return true;
  } catch (error) {
    if(record?.id!==snapshot.id)return false;
    saveError = error?.message || 'Storage unavailable'; storageAvailable=false; updateStatus();
    $('#storage-banner').classList.add('status-error');
    if(error?.code==='DOCUMENT_CONFLICT')toast(error.message,true);
    else if (!persistRequested) { persistRequested=true; toast('Browser storage failed. Your edits are still open. Download a copy now.',true); }
    return false;
  }
}
function mutate(change, group=null) {
  if(switchingDocument) return;
  if (!group || group!==editGroup) { history.push(clone(deck)); if(history.length>80) history.shift(); }
  editGroup=group; future=[]; change();
  record.revision++; record.updatedAt=Date.now(); record.deck=deck;
  queueSave(); schedulePreview();
}
function undo(redo=false) {
  const source=redo ? future:history, target=redo ? history:future;
  if(!source.length) return;
  target.push(clone(deck)); deck=source.pop(); editGroup=null;
  slideIndex=Math.min(slideIndex,deck.slides.length-1); blockId=null; selectedSlides=new Set([currentSlide().id]);
  record.revision++; record.deck=deck; queueSave(); renderAll();
}
function schedulePreview() {
  clearTimeout(previewTimer); previewTimer=setTimeout(renderPreview,120);
  clearTimeout(thumbsTimer); thumbsTimer=setTimeout(renderSlides,450);
}
function renderPreview() {
  const size=slideSize(deck); const slide=currentSlide();
  preview.srcdoc=renderDocument(deck,{mode:'preview',slideIndex,selectedBlockId:blockId});
  $('#canvas-ratio').textContent=deck.aspectRatio==='sixByFour' ? '6:4':'16:9';
  $('#slide-position').textContent=`Slide ${slideIndex+1} of ${deck.slides.length} · ${layouts[slide.layout] || slide.layout}`;
  $('#notes').value=slide.notes || '';
  $('#canvas-frame').style.aspectRatio=`${size.width}/${size.height}`;
  fitCanvas(); $('#layout-warnings').textContent='';
}
function fitCanvas() {
  if(!deck) return;
  const outer=$('.canvas-space'), frame=$('#canvas-frame'), {width,height}=slideSize(deck);
  const s=getComputedStyle(outer), availableW=outer.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight), availableH=outer.clientHeight-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom);
  const scale=Math.max(.05,Math.min(availableW/width,availableH/height));
  frame.style.width=`${width*scale}px`; frame.style.height=`${height*scale}px`;
}
function renderSlides() {
  const container=$('#slides-list'), scroll=container.scrollTop;
  const {width,height}=slideSize(deck);
  container.innerHTML=deck.slides.map((slide,i)=>`<div class="slide-item ${i===slideIndex?'active':''} ${selectedSlides.has(slide.id)?'selected':''}" data-slide="${i}" tabindex="0" role="option" aria-selected="${selectedSlides.has(slide.id)}" aria-label="Slide ${i+1}: ${escape(slide.title)}" draggable="true"><div class="slide-thumb" style="aspect-ratio:${width}/${height}"><iframe title="Slide ${i+1} thumbnail" sandbox="allow-scripts" loading="lazy" tabindex="-1"></iframe></div><div class="slide-label"><span>${i+1}</span><strong>${escape(slide.title || 'Untitled slide')}</strong></div></div>`).join('');
  container.setAttribute('role','listbox'); container.setAttribute('aria-multiselectable','true');
  container.querySelectorAll('iframe').forEach((iframe,i)=>{ iframe.srcdoc=renderDocument(deck,{mode:'preview',slideIndex:i}); });
  container.scrollTop=scroll;
  $('#slide-count').textContent=deck.slides.length;
  $('[data-action="delete-slide"]').disabled=deck.slides.length<=1;
  requestAnimationFrame(()=>container.querySelectorAll('.slide-thumb').forEach(thumb=>{
    const iframe=thumb.firstElementChild; iframe.style.width=`${width}px`; iframe.style.height=`${height}px`; iframe.style.transform=`scale(${thumb.clientWidth/width})`;
  }));
}
const options=(items,value)=>Object.entries(items).map(([key,label])=>`<option value="${escape(key)}" ${key===value?'selected':''}>${escape(label)}</option>`).join('');
function field(label,name,value,scope='slide',type='text',extra='') {
  const attrs=`data-scope="${scope}" data-field="${name}" ${extra}`;
  return `<label class="field"><span>${label}</span>${type==='textarea'?`<textarea ${attrs} class="${name==='body'?'body-text':name==='title'?'title-text':''}">${escape(value)}</textarea>`:`<input type="${type}" ${attrs} value="${escape(value)}">`}</label>`;
}
function selectField(label,name,value,items,scope='slide') { return `<label class="field"><span>${label}</span><select data-scope="${scope}" data-field="${name}">${options(items,value)}</select></label>`; }
function scaleField(label,scope,value=1) { return `<label class="field"><span>${label}</span><div class="scale-field"><input aria-label="${label}" data-scope="${scope}" data-field="fontScale" type="number" min="0.25" max="4" step="0.05" value="${value ?? 1}"><input aria-label="${label} slider" data-scope="${scope}" data-field="fontScale" type="range" min="0.25" max="4" step="0.05" value="${value ?? 1}"><button class="reset" data-action="reset-scale" data-scope="${scope}" type="button" aria-label="Reset ${label}">↺</button></div></label>`; }
function checkField(label,name,value,scope='slide') { return `<label class="check-field"><input type="checkbox" data-scope="${scope}" data-field="${name}" ${value?'checked':''}>${label}</label>`; }
function colorField(label,name,value,scope='block-style',fallback='#087F8C') { return `<div class="colour-row"><span>${label}</span><input aria-label="${label}" type="color" data-scope="${scope}" data-field="${name}" value="${escape(value || fallback)}"><button data-action="reset-color" data-scope="${scope}" data-field="${name}" title="Use theme default">↺</button></div>`; }
function renderInspector() {
  const slide=currentSlide(), block=currentBlock(), inspector=$('#inspector'), scroll=inspector.scrollTop;
  inspector.innerHTML=`<h2>Slide ${slideIndex+1}</h2>${field('Section label','kicker',slide.kicker)}${field('Title','title',slide.title,'slide','textarea','rows="2"')}${field('Subtitle','subtitle',slide.subtitle,'slide','textarea')}<div class="section-title">LAYOUT</div>${selectField('Composition','layout',slide.layout,layouts)}${selectField('Spacing','density',slide.density,{comfortable:'Comfortable',compact:'Compact'})}${scaleField('Slide font scale','slide',slide.fontScale)}${['twoColumns','figureAndText'].includes(slide.layout)?field('Left column share (0.25–0.75)','split',slide.split,'slide','number','min="0.25" max="0.75" step="0.05"'):''}${slide.layout==='title'?`${checkField('Centre title horizontally','centerTitleHorizontally',slide.centerTitleHorizontally)}${checkField('Centre title vertically','centerTitleVertically',slide.centerTitleVertically)}`:''}<details><summary>Slide background</summary><div class="row-actions"><button data-action="background-image">Choose image…</button>${slide.background?'<button data-action="remove-background">Remove</button>':''}</div>${slide.background?`${checkField('Fit complete image','imageFit',slide.background.imageFit,'background')}${colorField('Overlay','overlayColor',slide.background.overlayColor,'background','#102036')}${field('Overlay opacity','overlayOpacity',slide.background.overlayOpacity,'background','number','min="0" max="1" step="0.05"')}${colorField('Text','textColor',slide.background.textColor,'background','#FFFFFF')}`:'<p class="subtle">Use the theme background, or embed an image for this slide.</p>'}</details><div class="section-title">CONTENT BLOCKS</div><div class="block-list">${slide.blocks.map((b,i)=>`<div class="block-row ${b.id===blockId?'active':''}" data-block="${b.id}" tabindex="0" role="button" aria-pressed="${b.id===blockId}"><span class="block-icon">${icons[b.kind]}</span><div><strong>${escape(b.heading || kinds[b.kind])}</strong><small>${i+1} · ${kinds[b.kind]}</small></div><button data-action="move-block-up" data-id="${b.id}" aria-label="Move block up">↑</button><button data-action="move-block-down" data-id="${b.id}" aria-label="Move block down">↓</button></div>`).join('') || '<div class="empty-state">No content blocks. Add one below.</div>'}</div><div class="row-actions"><button data-action="add-block">＋ Add block</button><span class="spacer"></span><button data-action="duplicate-block" ${block?'':'disabled'} title="Duplicate block">⧉</button><button data-action="delete-block" ${block?'':'disabled'} title="Delete block">−</button></div>${block ? renderBlockEditor(block) : ''}`;
  inspector.scrollTop=scroll;
}
function renderBlockEditor(block) {
  let content=`<div class="section-title">EDIT ${kinds[block.kind].toUpperCase()}</div>${field('Heading','heading',block.heading,'block')}${scaleField('Block font scale','block',block.fontScale)}`;
  if(block.kind==='figure') content+=`<div class="row-actions"><button data-action="block-image">Choose image…</button>${block.imageData?'<button data-action="remove-image">Remove</button>':''}</div>${block.imageData?`<img class="image-preview" alt="Selected figure" src="data:${escape(block.imageMIME)};base64,${escape(block.imageData)}">`:''}${checkField('Fit complete image','imageFit',block.imageFit,'block')}`;
  if(block.kind==='table') content+=`<label class="field"><span>Table (tab-separated values)</span><textarea class="body-text" data-scope="table" data-field="tsv">${escape([block.table.headers,...block.table.rows].map(r=>r.join('\t')).join('\n'))}</textarea></label><p class="subtle">First row contains headings. Paste cells directly from a spreadsheet.</p>`;
  content+=field(block.kind==='mermaid'?'Mermaid source':'Body','body',block.body,'block','textarea');
  if(block.kind==='mermaid') content+='<p class="subtle">Offline flowcharts and directed graphs. Use flowchart LR or flowchart TD.</p>';
  content+=field('Caption / source','caption',block.caption,'block','textarea');
  content+=`<details><summary>Block colours</summary>${colorField('Background','background',block.style?.background)}${colorField('Text','foreground',block.style?.foreground,'block-style','#171B22')}${colorField('Accent','accent',block.style?.accent)}${block.kind==='table'?`${colorField('Header background','headerBackground',block.style?.headerBackground)}${colorField('Header text','headerForeground',block.style?.headerForeground,'block-style','#171B22')}`:''}<button data-action="reset-colors">Reset all colours</button></details><div class="row-actions"><button data-action="split-slide">Split slide at this block</button></div>`;
  return content;
}
function renderAll() { renderSlides(); renderPreview(); renderInspector(); updateStatus(); }
function selectSlide(index,event={}) {
  const next=deck.slides[index]; if(!next) return;
  if(event.shiftKey) { const a=Math.min(slideIndex,index),b=Math.max(slideIndex,index); for(let i=a;i<=b;i++) selectedSlides.add(deck.slides[i].id); }
  else if(event.metaKey || event.ctrlKey) { if(selectedSlides.has(next.id) && selectedSlides.size>1) selectedSlides.delete(next.id); else selectedSlides.add(next.id); }
  else selectedSlides=new Set([next.id]);
  slideIndex=index; blockId=null; editGroup=null; renderAll();
}
async function activateRecord(next) {
  const previousBusy=busy;
  switchingDocument=true; busy=true; $('.workspace').inert=true; $('.app-toolbar').inert=true;
  try {
    if(record && !(await saveNow()) && record.downloadedRevision!==record.revision) throw new Error('The current presentation could not be saved in this browser. Download your edits before opening another presentation.');
    const nextDeck=validateDeck(next.deck);
    record=clone(next); deck=nextDeck; record.deck=deck;
    savedRevision=record.revision; saveError=''; slideIndex=0; blockId=null; history=[];future=[];editGroup=null;selectedSlides=new Set([deck.slides[0].id]);
    storage.setSetting('active-document',record.id).catch(()=>{}); renderAll();
  } finally { switchingDocument=false; busy=previousBusy; $('.workspace').inert=false; $('.app-toolbar').inert=false; }
}
async function newDocument(imported=null) {
  const now=Date.now();
  await activateRecord({id:id(),deck:imported || createDeck(),revision:0,downloadedRevision:null,downloadedAt:null,createdAt:now,updatedAt:now});
  await saveNow();
}
function modal(title,body,footer='<button data-action="close-dialog">Done</button>') {
  dialogGeneration++;
  $('#dialog-content').innerHTML=`<div class="dialog-header"><h2>${title}</h2><button data-action="close-dialog" aria-label="Close dialog">×</button></div><div class="dialog-body">${body}</div>${footer?`<div class="dialog-footer">${footer}</div>`:''}`;
  if(!$('#dialog').open) $('#dialog').showModal();
}
const closeModal=()=>$('#dialog').close();
function showLayouts() { modal('Add slide',`<div class="layout-picker">${Object.entries(layouts).map(([layout,label])=>`<button class="layout-choice" data-action="insert-slide" data-layout="${layout}"><span class="layout-symbol">${layoutSymbols[layout]}</span><div><strong>${label}</strong><small>${{title:'A title, subtitle and opening message',statement:'One clear idea, given room to breathe',twoColumns:'Two balanced columns of content',figureAndText:'An image and supporting commentary',cards:'Four points in a structured grid',metrics:'Key numbers and their meaning',table:'Data with a heading and caption',figure:'A large image or diagram'}[layout]}</small></div></button>`).join('')}</div>`); }
function showBlocks() { modal('Add content block',`<div class="layout-picker">${Object.entries(kinds).map(([kind,label])=>`<button class="layout-choice" data-action="insert-block" data-kind="${kind}"><span class="layout-symbol">${icons[kind]}</span><strong>${label}</strong></button>`).join('')}</div>`); }
function showSettings() {
  modal('Deck settings',`${field('Presentation title','title',deck.title,'deck')}${field('Author','author',deck.author,'deck')}${field('Footer','footer',deck.footer,'deck')}${selectField('Theme','theme',deck.theme,Object.fromEntries(themes.map(t=>[t,t[0].toUpperCase()+t.slice(1)])),'deck')}${selectField('Aspect ratio','aspectRatio',deck.aspectRatio || 'sixteenByNine',{sixteenByNine:'16:9 · 1280 × 720',sixByFour:'6:4 (3:2) · 1296 × 864'},'deck')}<p class="subtle">Settings apply to previews, presentation mode and exports. Your slide contents remain editable in SwiftReveal.</p>`);
}
async function showThemes() {
  let saved=[]; try {saved=await storage.listThemes();}catch{}
  modal('CSS & reusable themes',`<p class="subtle">CSS applies to slides only, after the built-in theme. External resources are blocked; embed images through figure or background controls.</p><label class="field"><span>Deck CSS</span><textarea class="code-editor" data-scope="deck" data-field="customCSS" spellcheck="false">${escape(deck.customCSS || '')}</textarea></label><div class="row-actions"><button data-action="css-example">Insert example</button><button data-action="clear-css">Clear CSS</button></div><div class="section-title">REUSABLE THEMES</div><label class="field"><span>Theme name</span><input id="theme-name" value="${escape(deck.customThemeName || '')}" placeholder="My theme"></label><div class="row-actions"><button data-action="save-theme">Save theme</button><button data-action="export-theme">Download theme</button><button data-action="import-theme">Import theme…</button></div>${saved.map(t=>`<div class="library-row"><div><strong>${escape(t.name)}</strong><small>${escape(t.baseTheme)}</small></div><button data-action="apply-theme" data-id="${t.id}">Apply</button><button data-action="delete-theme" data-id="${t.id}" aria-label="Delete theme">×</button></div>`).join('')}`);
}
async function showLibrary() {
  await saveNow();
  let documents=[]; try {documents=await storage.listDocuments();}catch(error) {reportError(error);}
  documents.sort((a,b)=>b.updatedAt-a.updatedAt);
  modal('Your browser library',`<div class="warning-box"><strong>This library lives in this browser on this device.</strong> It does not sync or replace a downloaded file. Private browsing, clearing site data, or browser eviction can remove it.</div><div class="section-title">BUNDLED EXAMPLES</div><div class="row-actions"><button data-action="open-example" data-name="Getting-Started">Getting started</button><button data-action="open-example" data-name="Diagrams-and-Code">Diagrams & code</button><button data-action="open-example" data-name="SVG-Images">SVG</button></div><div class="section-title">YOUR PRESENTATIONS</div>${documents.map(r=>`<div class="library-row"><div><strong>${escape(r.deck.title || 'Untitled presentation')}</strong><small>${r.deck.slides.length} slides · ${new Date(r.updatedAt).toLocaleString()}${r.downloadedRevision!==r.revision?' · Download needed':''}</small></div><button data-action="open-library" data-id="${r.id}">${r.id===record.id?'Reload saved':'Open'}</button><button data-action="delete-library" data-id="${r.id}" aria-label="Delete presentation" class="danger">Delete</button></div>`).join('') || '<p>No stored presentations yet.</p>'}`,`<button data-action="open">Import presentation…</button><button data-action="new">New presentation</button><button data-action="new-window">New window</button><button data-action="close-dialog">Done</button>`);
}
function showExports() { modal('Export presentation',`<button class="export-option" data-action="download"><strong>Editable SwiftReveal file (.swiftreveal)</strong><small>Keep a permanent copy. Reopens in SwiftReveal or PoWAReveal, with embedded images and notes.</small></button><button class="export-option" data-action="export-html"><strong>Offline HTML presentation</strong><small>Self-contained presentation with bundled diagrams and navigation. Works without this app.</small></button><button class="export-option" data-action="export-powerpoint"><strong>Editable PowerPoint (.pptx)</strong><small>Native text, shapes and tables, SVG diagrams, and eight reusable layouts. Uses Arial by default; custom CSS fonts are retained. Fonts are not embedded.</small></button><button class="export-option" data-action="export-pdf"><strong>Download PDF</strong><small>Direct browser-side export. High-resolution raster slides, one slide per page; text is not selectable.</small></button><button class="export-option" data-action="print"><strong>Print / Save as PDF</strong><small>Browser-rendered text and vectors. One slide per page. Use no margins, disable headers/footers, and enable background graphics.</small></button>`); }
function copySlides() {
  const selected=deck.slides.filter(s=>selectedSlides.has(s.id));
  clipboard={schemaVersion:1,slides:clone(selected)};
  // Cross-tab transfer in browser storage does not require clipboard permissions.
  storage.setSetting('slide-clipboard',clipboard).catch(()=>{});
  const text=JSON.stringify({type:'powareveal-slides',...clipboard});
  navigator.clipboard?.writeText(text).catch(()=>{});
  toast(`Copied ${selected.length} slide${selected.length===1?'':'s'}.`);
}
async function pasteSlides() {
  const destinationId=record.id, destinationRevision=record.revision;
  let value=clipboard;
  try { value=await storage.getSetting('slide-clipboard') || value; }catch{}
  if(record.id!==destinationId||record.revision!==destinationRevision)throw new Error('The destination changed while reading copied slides. Paste again.');
  if(!value?.slides?.length) {toast('Copy slides in PoWAReveal first.');return;}
  const at=Math.min(...deck.slides.map((s,i)=>selectedSlides.has(s.id)?i:Infinity));
  const incoming=value.slides.map(s=>duplicateSlide(s));
  mutate(()=>deck.slides.splice(Number.isFinite(at)?at:slideIndex,0,...incoming));
  slideIndex=Number.isFinite(at)?at:slideIndex;selectedSlides=new Set(incoming.map(s=>s.id));blockId=null;renderAll();
}
async function downloadCopy() {
  const revision=record.revision;
  const data=await encodePresentation(deck);
  await downloadFile(data,filename(),'application/octet-stream');
  record.downloadedRevision=revision; record.downloadedAt=Date.now();
  await saveNow(); updateStatus(); toast('Download requested. Keep the .swiftreveal file somewhere safe.');
}
async function importFiles(files) {
  for(const file of files) {
    if(file.size>512*1024*1024)throw new Error('Presentation files must be no larger than 512 MiB.');
    const imported=await decodePresentation(new Uint8Array(await file.arrayBuffer()));
    await newDocument(imported);
  }
  toast(`Opened ${files.length} presentation${files.length===1?'':'s'} in your browser library. Download a copy after editing.`);
}
function showOptimize() {
  optimizerResult=null;
  modal('Optimize images',`<p class="subtle">Analyze before applying. Original image bytes are preserved unless resizing or an explicitly selected conversion makes them smaller. SVG stays vector.</p><label class="field"><span>Resolution preset</span><select id="opt-preset"><option value="balanced">Balanced · 2560 px</option><option value="high">High · 4096 px</option><option value="compact">Compact · 1920 px</option><option value="original">Original pixels and format</option></select></label><label class="check-field"><input id="opt-jpeg" type="checkbox">Recompress JPEGs</label><label class="check-field"><input id="opt-png" type="checkbox">Convert opaque PNGs to JPEG (lossy)</label><div id="opt-result" class="warning-box">Analyze to estimate savings. Changes apply as one undoable edit.</div>`,`<button data-action="analyze-optimize">Analyze</button><button data-action="apply-optimize" disabled>Apply</button><button data-action="close-dialog">Cancel</button>`);
}
async function perform(action,element={dataset:{}}) {
  if(busy && !['close-dialog','dismiss-update'].includes(action)) return;
  switch(action) {
    case 'close-dialog': closeModal(); break;
    case 'new': closeModal(); await newDocument(); break;
    case 'new-window': window.open(new URL('./#new',location.href).href,'_blank','noopener'); break;
    case 'library': await showLibrary(); break;
    case 'open': $('#file-input').click(); break;
    case 'open-example': {const name=element.dataset.name;if(!['Getting-Started','Diagrams-and-Code','SVG-Images'].includes(name))return;await runBusy('Opening bundled example…',async()=>{const response=await fetch(`./examples/${name}.swiftreveal`);if(!response.ok)throw new Error('The example could not be loaded.');const example=await decodePresentation(new Uint8Array(await response.arrayBuffer()));await newDocument(example);closeModal();});break;}
    case 'download': await downloadCopy(); break;
    case 'settings': showSettings(); break;
    case 'themes': await showThemes(); break;
    case 'exports': showExports(); break;
    case 'undo': undo(); break;
    case 'redo': undo(true); break;
    case 'add-slide': showLayouts(); break;
    case 'insert-slide': { const slide=createSlide(element.dataset.layout);mutate(()=>deck.slides.splice(slideIndex+1,0,slide));closeModal();selectSlide(slideIndex+1);break; }
    case 'duplicate-slide': { const incoming=deck.slides.filter(s=>selectedSlides.has(s.id)).map(s=>duplicateSlide(s));mutate(()=>deck.slides.splice(slideIndex+1,0,...incoming));slideIndex++;selectedSlides=new Set(incoming.map(s=>s.id));blockId=null;renderAll();break; }
    case 'delete-slide': {
      if(deck.slides.length<=1) return;
      const remaining=deck.slides.filter(s=>!selectedSlides.has(s.id));
      if(!remaining.length) {toast('Keep at least one slide.');return;}
      mutate(()=>deck.slides=remaining);selectSlide(Math.min(slideIndex,deck.slides.length-1));break;
    }
    case 'move-slide-up': case 'move-slide-down': {
      const direction=action.endsWith('up')?-1:1, currentID=currentSlide().id;
      mutate(()=>{
        const order=direction<0 ? [...deck.slides.keys()] : [...deck.slides.keys()].reverse();
        for(const i of order) if(selectedSlides.has(deck.slides[i].id)) {const to=i+direction;if(to>=0&&to<deck.slides.length&&!selectedSlides.has(deck.slides[to].id)) [deck.slides[i],deck.slides[to]]=[deck.slides[to],deck.slides[i]];}
      });slideIndex=deck.slides.findIndex(s=>s.id===currentID);renderAll();break;
    }
    case 'copy-slides':copySlides();break;
    case 'paste-slides':await pasteSlides();break;
    case 'add-block':showBlocks();break;
    case 'insert-block':{const block=createBlock(element.dataset.kind);mutate(()=>currentSlide().blocks.push(block));blockId=block.id;closeModal();renderAll();break;}
    case 'duplicate-block': {const b=currentBlock();if(!b)return;const copy=clone(b);copy.id=id();mutate(()=>currentSlide().blocks.splice(currentSlide().blocks.indexOf(b)+1,0,copy));blockId=copy.id;renderAll();break;}
    case 'delete-block':{const b=currentBlock();if(!b)return;mutate(()=>currentSlide().blocks=currentSlide().blocks.filter(x=>x.id!==b.id));blockId=null;renderAll();break;}
    case 'move-block-up':case 'move-block-down':{const blocks=currentSlide().blocks,from=blocks.findIndex(b=>b.id===element.dataset.id),to=from+(action.endsWith('up')?-1:1);if(to<0||to>=blocks.length)return;mutate(()=>[blocks[from],blocks[to]]=[blocks[to],blocks[from]]);renderAll();break;}
    case 'split-slide':{const slide=currentSlide(),at=slide.blocks.findIndex(b=>b.id===blockId);if(at<0)return;const next=clone(slide);next.id=id();next.title=`${slide.title} (continued)`;mutate(()=>{next.blocks=slide.blocks.splice(at);deck.slides.splice(slideIndex+1,0,next);});selectSlide(slideIndex+1);break;}
    case 'reset-scale':mutate(()=>{const target=element.dataset.scope==='block'?currentBlock():currentSlide();delete target.fontScale;});renderAll();break;
    case 'reset-color':mutate(()=>{const target=element.dataset.scope==='background'?currentSlide().background:currentBlock()?.style;if(target)delete target[element.dataset.field];});renderAll();break;
    case 'reset-colors':mutate(()=>delete currentBlock().style);renderAll();break;
    case 'block-image':case 'background-image':activeImageTarget={recordId:record.id,slideId:currentSlide().id,blockId:action==='block-image'?blockId:null};showImageImport();break;
    case 'choose-image-file':$('#image-input').click();break;
    case 'remove-image':mutate(()=>delete currentBlock().imageData);renderAll();break;
    case 'remove-background':mutate(()=>delete currentSlide().background);renderAll();break;
    case 'css-example':mutate(()=>deck.customCSS=(deck.customCSS || '')+'\n.sr-copy .emphasis { color: var(--accent); font-weight: 700; }\n');await showThemes();break;
    case 'clear-css':mutate(()=>{deck.customCSS='';deck.customThemeName='';});await showThemes();break;
    case 'save-theme': {const name=$('#theme-name').value.trim();if(!name)throw new Error('Give your theme a name.');await storage.saveTheme({schemaVersion:1,id:id(),name,baseTheme:deck.theme,css:deck.customCSS || ''});mutate(()=>deck.customThemeName=name);await showThemes();toast('Theme saved in this browser. Download it for permanent use.');break;}
    case 'export-theme':{const name=$('#theme-name').value.trim() || 'My theme';await downloadFile(JSON.stringify({schemaVersion:1,id:id(),name,baseTheme:deck.theme,css:deck.customCSS || ''},null,2),`${name.replace(/[\\/:*?"<>|]/g,'-')}.swiftrevealtheme`,'application/json');break;}
    case 'import-theme':$('#theme-input').click();break;
    case 'apply-theme':{const theme=(await storage.listThemes()).find(t=>t.id===element.dataset.id);if(!theme)return;mutate(()=>{deck.theme=theme.baseTheme;deck.customCSS=theme.css;deck.customThemeName=theme.name;});await showThemes();renderAll();break;}
    case 'delete-theme':await storage.deleteTheme(element.dataset.id);await showThemes();break;
    case 'open-library':{const next=await storage.getDocument(element.dataset.id);if(next){await activateRecord(next);closeModal();}break;}
    case 'delete-library':{
      if(!confirm('Delete this presentation from this browser? Download a copy first if you need to keep it.'))return;
      const deleting=element.dataset.id;
      if(deleting===record.id){await saveNow();clearTimeout(saveTimer);record=null;await storage.deleteDocument(deleting);await newDocument();}
      else await storage.deleteDocument(deleting);
      await showLibrary();break;
    }
    case 'present':{
      const win=window.open('','_blank');if(!win)throw new Error('Allow pop-ups to open presentation mode.');
      const html=renderDocument(deck,{mode:'presentation',slideIndex});win.document.open();win.document.write(html);win.document.close();break;
    }
    case 'export-html':await runBusy('Preparing offline HTML…',async()=>{await exportHTML(clone(deck));toast('Offline HTML download requested.');});break;
    case 'export-pdf':await runBusy('Rendering PDF slides…',async()=>{const exportedDeck=clone(deck);const blob=await exportPDF(exportedDeck,{onProgress:(index,total)=>toast(`Rendering PDF slide ${Math.min(index+1,total)} of ${total}…`)});const url=URL.createObjectURL(blob);modal('PDF ready',`<p>Your PDF contains ${exportedDeck.slides.length} slide pages. A download has been requested. If your browser blocked it, use the link below.</p><p><a class="download-result" href="${url}" download="${escape(filename('pdf'))}">Download PDF again</a></p><p class="subtle">High-resolution raster output. For selectable text, use Print / Save as PDF.</p>`);setTimeout(()=>URL.revokeObjectURL(url),600000);toast('PDF download requested. Check your Downloads folder.');});break;
    case 'export-powerpoint':await runBusy('Preparing PowerPoint…',async()=>{
      const exportedDeck=clone(deck);
      const {blob,warnings}=await exportPowerPoint(exportedDeck,{onProgress:({phase,index,total})=>{
        if(phase==='encoding')toast('Encoding PowerPoint…');
        else if(phase!=='complete')toast(`Preparing PowerPoint ${phase==='layouts'?'layout':'slide'} ${index+1} of ${total}…`);
      }});
      const url=URL.createObjectURL(blob),name=safeFilename(exportedDeck.title)+'.pptx';
      modal('PowerPoint ready',`<p>Your PowerPoint contains ${exportedDeck.slides.length} slides and eight reusable SwiftReveal layouts. A download has been requested. If your browser blocked it, use the link below.</p><p><a class="download-result" href="${url}" download="${escape(name)}">Download PowerPoint again</a></p><p class="subtle">In PowerPoint, choose Home → New Slide for SwiftReveal layouts or View → Slide Master to edit them. Fonts are not embedded; custom CSS may differ.</p>${warnings.length?`<div class="warning-box"><strong>Layout warnings</strong><ul>${warnings.map(w=>`<li>${escape(w)}</li>`).join('')}</ul></div>`:''}<div class="warning-box"><strong>Keep your editable source.</strong> Download a .swiftreveal copy for permanent use and future editing in PoWAReveal or SwiftReveal.</div><button data-action="download">Download editable .swiftreveal copy</button>`);
      setTimeout(()=>URL.revokeObjectURL(url),600000);toast('PowerPoint download requested. Check your Downloads folder.');
    });break;
    case 'print':await runBusy('Preparing print layout…',()=>printDeck(clone(deck)));break;
    case 'optimize':showOptimize();break;
    case 'analyze-optimize':{
      const revision=record.revision,sourceId=record.id,generation=dialogGeneration;
      const analysisOptions={preset:$('#opt-preset').value,recompressJPEG:$('#opt-jpeg').checked,convertOpaquePNGToJPEG:$('#opt-png').checked};
      await runBusy('Analyzing image sizes…',async()=>{
        const result=await optimizeDeck(clone(deck),analysisOptions);
        if(generation!==dialogGeneration||!$('#dialog').open)return;
        optimizerResult={...result,revision,sourceId,analysisOptions};
        if($('#opt-result'))$('#opt-result').textContent=`Image data: ${bytes(result.originalBytes)} → ${bytes(result.optimizedBytes)}. Estimated saving: ${bytes(Math.max(0,result.savedBytes))}.`;
        const apply=$('[data-action="apply-optimize"]');if(apply)apply.disabled=false;
      });break;
    }
    case 'apply-optimize':if(optimizerResult){if(JSON.stringify(optimizerResult.analysisOptions)!==JSON.stringify({preset:$('#opt-preset').value,recompressJPEG:$('#opt-jpeg').checked,convertOpaquePNGToJPEG:$('#opt-png').checked}))throw new Error('Optimization options changed. Analyze again.');if(optimizerResult.revision!==record.revision||optimizerResult.sourceId!==record.id)throw new Error('The presentation changed. Analyze again before applying.');mutate(()=>deck=optimizerResult.deck);closeModal();renderAll();toast('Image optimization applied. Download a fresh copy.');}break;
    case 'persist':{const supported=Boolean(navigator.storage?.persist);const granted=supported?await navigator.storage.persist():false;toast(granted?'Persistent browser storage granted. Still download copies for permanent use.':'This browser did not grant persistent storage. Keep downloaded copies.');$('#persist-button').textContent=granted?'Persistent storage granted':'Download copies regularly';break;}
    case 'help':modal('Using PoWAReveal',`<div class="warning-box">Your presentations stay in this browser. Download an editable copy regularly and before clearing site data. Downloads include your notes and embedded images.</div><p>Edit the slide in the right inspector. Click a block in the canvas to edit it. Drag slides in the navigator to reorder them, or use the arrow buttons.</p><div class="help-grid"><kbd>⌘ / Ctrl S</kbd><span>Download an editable copy</span><kbd>⌘ / Ctrl Z</kbd><span>Undo</span><kbd>⌘ / Ctrl ⇧ Z</kbd><span>Redo</span><kbd>⌘ / Ctrl C / V</kbd><span>Copy/paste slides when navigator has focus</span><kbd>⌘ / Ctrl click</kbd><span>Select multiple slides</span><kbd>Shift click</kbd><span>Select a range of slides</span><kbd>Arrow keys</kbd><span>Navigate slides when navigator has focus</span></div><p class="subtle">Presentations support arrows, N/S for speaker notes and Esc to exit. Use the browser full-screen control for a distraction-free presentation. Install through your browser’s app menu when supported; Safari uses Add to Dock. Offline use becomes available after the initial complete load.</p><p><a href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener">Open-source licences</a></p>`);break;
    case 'activate-update':await saveNow();if(saveError)throw new Error('Download your copy before updating: browser storage is unavailable.');waitingWorker?.postMessage({type:'SKIP_WAITING'});break;
    case 'dismiss-update':$('#update-banner').hidden=true;break;
  }
}
async function runBusy(message,work) {busy=true;document.body.classList.add('busy');toast(message);try{await work();}finally{busy=false;document.body.classList.remove('busy');}}
function showImageImport() {modal('Import image',`<p class="subtle">Figures and backgrounds are embedded in your presentation. SVG stays vector. Images are never enlarged.</p><label class="field"><span>Import quality</span><select id="import-preset"><option value="balanced">Balanced · longest edge 2560 px</option><option value="high">High quality · longest edge 4096 px</option><option value="compact">Compact · longest edge 1920 px</option><option value="original">Original pixels and format</option></select></label><p class="subtle">JPEG and PNG files within the limit retain their original bytes. Browser-unsupported image formats report an error.</p>`,`<button data-action="choose-image-file" class="primary">Choose image…</button><button data-action="close-dialog">Cancel</button>`);}
function handleField(event) {
  const el=event.target,scope=el.dataset.scope,name=el.dataset.field;
  if(!scope || !name || !deck || switchingDocument) return;
  // Selects and checkboxes only emit a single change; text fields use input.
  if(event.type==='change' && !['SELECT'].includes(el.tagName) && el.type!=='checkbox' && el.type!=='color')return;
  if(event.type==='input' && (el.tagName==='SELECT'||el.type==='checkbox'))return;
  let value=el.type==='checkbox'?el.checked:el.type==='number'||el.type==='range'?Number(el.value):el.value;
  if(['fontScale','split','overlayOpacity'].includes(name)) {
    if(!Number.isFinite(value))return;
    value=Math.min(name==='fontScale'?4:name==='split'?.75:1,Math.max(name==='fontScale'?.25:name==='split'?.25:0,value));
  }
  mutate(()=>{
    if(scope==='table') {
      const rows=value.replace(/\r\n?/g,'\n').split('\n').map(r=>r.split('\t'));
      while(rows.length>1&&rows.at(-1).length===1&&rows.at(-1)[0]==='')rows.pop();
      currentBlock().table={headers:rows[0],rows:rows.slice(1)};return;
    }
    let target=scope==='deck'?deck:scope==='slide'?currentSlide():scope==='block'?currentBlock():scope==='background'?currentSlide().background:currentBlock().style ||= {};
    if(target) target[name]=value;
  },`${scope}:${name}:${blockId}:${currentSlide().id}`);
  if(name==='fontScale') document.querySelectorAll(`[data-scope="${scope}"][data-field="fontScale"]`).forEach(input=>{if(input!==el)input.value=value;});
  if(['layout','density'].includes(name))renderInspector();
  if(['title','kicker'].includes(name))updateStatus();
}

document.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]');
  if(action) {event.preventDefault();perform(action.dataset.action,action).catch(reportError);return;}
  const block=event.target.closest('[data-block]');if(block){blockId=block.dataset.block;editGroup=null;renderInspector();renderPreview();return;}
  const slide=event.target.closest('[data-slide]');if(slide)selectSlide(Number(slide.dataset.slide),event);
});
document.addEventListener('input',handleField);document.addEventListener('change',handleField);
document.addEventListener('focusout',()=>{editGroup=null;});
window.addEventListener('message',event=>{
  if(event.source!==preview.contentWindow)return;
  if(event.data?.type==='select-block'&&currentSlide().blocks.some(b=>b.id===event.data.id)){blockId=event.data.id;editGroup=null;renderInspector();renderPreview();}
  if(event.data?.type==='layout-report') $('#layout-warnings').textContent=(event.data.warnings || []).join(' ');
});
$('#file-input').addEventListener('change',event=>{const files=[...event.target.files];event.target.value='';if(files.length)runBusy('Opening presentation…',()=>importFiles(files)).catch(reportError);});
$('#image-input').addEventListener('change',async event=>{
  const file=event.target.files[0],preset=$('#import-preset')?.value || 'balanced',target=activeImageTarget;event.target.value='';if(!file||!target)return;
  try { await runBusy('Importing image…',async()=>{
    const image=await importImage(file,preset);
    if(record.id!==target.recordId)throw new Error('The active presentation changed. Import the image again.');
    const slide=deck.slides.find(s=>s.id===target.slideId);if(!slide)throw new Error('The destination slide was removed.');
    const block=target.blockId?slide.blocks.find(b=>b.id===target.blockId):null;if(target.blockId&&!block)throw new Error('The destination block was removed.');
    mutate(()=>{if(block)Object.assign(block,{imageData:image.imageData,imageMIME:image.imageMIME});else slide.background={imageData:image.imageData,imageMIME:image.imageMIME,imageFit:false,overlayColor:'#102036',overlayOpacity:.45,textColor:'#FFFFFF'};});closeModal();renderAll();
  }); }catch(error){reportError(error);}
});
$('#theme-input').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try {const theme=JSON.parse(await file.text());if(theme.schemaVersion!==1||!theme.name?.trim()||!themes.includes(theme.baseTheme)||typeof theme.css!=='string')throw new Error('This is not a supported SwiftReveal theme.');theme.id=id();await storage.saveTheme(theme);await showThemes();toast('Theme imported into this browser.');}catch(error){reportError(error);}
});
$('#dialog').addEventListener('click',event=>{if(event.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
$('#dialog').addEventListener('close',()=>{editGroup=null;optimizerResult=null;dialogGeneration++;});
document.addEventListener('change',event=>{if(['opt-preset','opt-jpeg','opt-png'].includes(event.target.id)){optimizerResult=null;const apply=$('[data-action="apply-optimize"]');if(apply)apply.disabled=true;const result=$('#opt-result');if(result)result.textContent='Options changed. Analyze again before applying.';}});
document.addEventListener('keydown',event=>{
  const input=event.target.closest('input,textarea,select,[contenteditable="true"]'), command=event.metaKey||event.ctrlKey;
  if(command&&event.key.toLowerCase()==='s'){event.preventDefault();downloadCopy().catch(reportError);return;}
  if(!input && command&&event.key.toLowerCase()==='z'){event.preventDefault();undo(event.shiftKey);return;}
  if(!input && command&&event.key.toLowerCase()==='y'){event.preventDefault();undo(true);return;}
  const nav=event.target.closest('.navigator');
  if(nav&&!input){
    if(command&&event.key.toLowerCase()==='c'){event.preventDefault();copySlides();}
    if(command&&event.key.toLowerCase()==='v'){event.preventDefault();pasteSlides().catch(reportError);}
    if(command&&event.key.toLowerCase()==='a'){event.preventDefault();selectedSlides=new Set(deck.slides.map(s=>s.id));renderSlides();}
    if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();selectSlide(Math.min(deck.slides.length-1,Math.max(0,slideIndex+(event.key==='ArrowDown'?1:-1))),event);$('#slides-list').focus();}
    if(['Delete','Backspace'].includes(event.key)){event.preventDefault();perform('delete-slide').catch(reportError);}
  }
  if(event.key==='Enter'&&event.target.matches('[data-block]')){blockId=event.target.dataset.block;renderInspector();renderPreview();}
});
let dragSlide;
$('#slides-list').addEventListener('dragstart',event=>{const item=event.target.closest('[data-slide]');if(item){dragSlide=Number(item.dataset.slide);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(dragSlide));}});
$('#slides-list').addEventListener('dragend',()=>{dragSlide=null;});
$('#slides-list').addEventListener('dragover',event=>{if(event.target.closest('[data-slide]')){event.preventDefault();event.dataTransfer.dropEffect='move';}});
$('#slides-list').addEventListener('drop',event=>{event.preventDefault();const item=event.target.closest('[data-slide]');if(!item||!Number.isInteger(dragSlide))return;const to=Number(item.dataset.slide),from=dragSlide;dragSlide=null;if(from===to)return;mutate(()=>{const [slide]=deck.slides.splice(from,1);deck.slides.splice(to,0,slide);});selectSlide(to);});
window.addEventListener('beforeunload',event=>{if(!controlledReload&&record&&record.downloadedRevision!==record.revision){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{saveNow().catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveNow().catch(()=>{});});
new ResizeObserver(()=>{fitCanvas();if(deck){const {width,height}=slideSize(deck);document.querySelectorAll('.slide-thumb').forEach(thumb=>{const f=thumb.firstElementChild;f.style.transform=`scale(${thumb.clientWidth/width})`;});}}).observe($('.workspace'));
async function setupOffline() {
  if(!('serviceWorker' in navigator)){$('#offline-state').textContent='Offline install unavailable in this browser';return;}
  try {
    const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    const updateReady=worker=>{waitingWorker=worker;$('#update-banner').hidden=false;};
    if(registration.waiting)updateReady(registration.waiting);
    registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)updateReady(registration.waiting || worker);});});
    let refreshing=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(waitingWorker&&!refreshing){refreshing=true;controlledReload=true;location.reload();}});
    await navigator.serviceWorker.ready;
    $('#offline-state').textContent='● Ready offline';$('#offline-state').classList.add('ready');
  } catch(error) {$('#offline-state').textContent='Offline cache unavailable';console.warn(error);}
}
window.addEventListener('offline',()=>{$('#offline-state').textContent='● Offline';});
window.addEventListener('online',()=>{$('#offline-state').textContent='● Online';});
async function start() {
  try {
    await storage.openStorage();
    const active=await storage.getSetting('active-document');
    const saved=active?await storage.getDocument(active):null;
    if(location.hash==='#new'){window.history.replaceState(null,'',location.pathname+location.search);await newDocument();}
    else if(saved)await activateRecord(saved);else await newDocument();
  }catch(error){storageAvailable=false;await newDocument();reportError(new Error('Browser storage is unavailable. Download your presentation before closing.'));}
  setupOffline();
}
start().catch(reportError);

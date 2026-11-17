export const LAYOUTS=Object.freeze(['title','statement','twoColumns','figureAndText','cards','metrics','table','figure']);
export const BLOCK_KINDS=Object.freeze(['text','callout','metric','figure','table','mermaid']);
export const THEMES=Object.freeze(['azure','ocean','graphite','forest','ember','plum','sand','midnight','monochrome']);
export const MAX_FILE_BYTES=512*1024*1024;
const uuid=()=>crypto.randomUUID().toUpperCase();
const copy=value=>structuredClone(value);
export function createBlock(kind='text') {
  if(!BLOCK_KINDS.includes(kind))throw new Error('Unsupported block type.');
  const block={id:uuid(),kind,heading:'',body:'',caption:'',imageMIME:'image/png',imageFit:true,table:{headers:['Item','Category','Value'],rows:[['Item A','Group 1','42'],['Item B','Group 2','28']]}};
  Object.assign(block,{
    text:{heading:'Heading',body:'Write your key points here.\nStart a line with • or - for a bullet.'},
    callout:{heading:'Key point',body:'The finding your audience should remember.'},
    metric:{heading:'42',body:'A meaningful measure'},
    figure:{caption:'Figure caption and source'},
    table:{heading:'Example table'},
    mermaid:{heading:'Flow diagram',body:'flowchart LR\n    A[Input] --> B[Process]\n    B --> C[Output]'}
  }[kind]);
  return block;
}
export function createSlide(layout='twoColumns') {
  if(!LAYOUTS.includes(layout))throw new Error('Unsupported slide layout.');
  const slide={id:uuid(),layout,kicker:'',title:layout==='title'?'Your presentation':'Untitled slide',subtitle:'',notes:'',split:.5,density:'comfortable',blocks:[]};
  switch(layout) {
    case 'title':slide.blocks=[Object.assign(createBlock('callout'),{heading:'The central message',body:'A concise introduction to your presentation.'})];break;
    case 'statement':slide.blocks=[Object.assign(createBlock('text'),{heading:'',body:'One clear idea, given room to breathe.'})];break;
    case 'twoColumns':slide.blocks=[createBlock('text'),createBlock('callout')];break;
    case 'figureAndText':slide.blocks=[createBlock('figure'),createBlock('text')];break;
    case 'cards':slide.blocks=Array.from({length:4},(_,i)=>Object.assign(createBlock('callout'),{heading:`Point ${i+1}`,body:'Explain the evidence and its implication.'}));break;
    case 'metrics':slide.blocks=Array.from({length:3},(_,i)=>Object.assign(createBlock('metric'),{heading:String((i+1)*12),body:`Measure ${i+1}`}));break;
    case 'table':slide.blocks=[createBlock('table')];break;
    case 'figure':slide.blocks=[createBlock('figure')];break;
  }
  return slide;
}
export function createDeck() {
  const slide=createSlide('title');slide.blocks=[];
  return {schemaVersion:1,title:'Untitled presentation',author:'',footer:'',theme:'azure',slides:[slide]};
}
export function duplicateSlide(slide) { const result=copy(slide);result.id=uuid();result.blocks=result.blocks.map(block=>({...block,id:uuid()}));return result; }
export function slideSize(deck) {return deck.aspectRatio==='sixByFour'?{width:1296,height:864}:{width:1280,height:720};}
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=message=>{throw new Error(message);};
function text(object,key,fallback='') {if(object[key]===undefined)object[key]=fallback;if(typeof object[key]!=='string')fail(`Invalid text field: ${key}.`);}
function identifier(value,seen) {if(typeof value!=='string'||!uuidPattern.test(value))fail('A slide or block identifier is invalid.');const key=value.toUpperCase();if(seen.has(key))fail('The presentation contains duplicate slide or block identifiers.');seen.add(key);}
function image(holder,required=false) {
  if(holder.imageData!=null) {
    if(typeof holder.imageData!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(holder.imageData))fail('An embedded image contains invalid base64 data.');
  }else if(required)fail('A background image is missing.');
  text(holder,'imageMIME','image/png');
  if(holder.imageFit===undefined)holder.imageFit=true;
  if(typeof holder.imageFit!=='boolean')fail('Image fit must be true or false.');
}
function scale(holder) {if(holder.fontScale!=null&&(typeof holder.fontScale!=='number'||!Number.isFinite(holder.fontScale)))fail('A font scale is invalid.');}
/** Validate a portable native deck and return a normalized independent copy. */
export function validateDeck(source) {
  if(!isObject(source))fail('The presentation must be a JSON object.');
  if(source.schemaVersion!==1)fail(`Unsupported presentation schema version: ${source.schemaVersion}.`);
  const deck=copy(source);
  if(!Array.isArray(deck.slides)||!deck.slides.length)fail('A presentation must contain at least one slide.');
  for(const key of ['title','author','footer'])text(deck,key);
  if(!THEMES.includes(deck.theme))deck.theme='azure';
  if(deck.aspectRatio!=null&&!['sixteenByNine','sixByFour'].includes(deck.aspectRatio))fail('The presentation uses an unsupported aspect ratio.');
  for(const key of ['customCSS','customThemeName'])if(deck[key]!=null&&typeof deck[key]!=='string')fail(`Invalid ${key}.`);
  const slides=new Set(),blocks=new Set();
  for(const slide of deck.slides) {
    if(!isObject(slide))fail('A slide is invalid.');identifier(slide.id,slides);
    if(!LAYOUTS.includes(slide.layout))fail('The presentation uses an unsupported slide layout.');
    for(const key of ['kicker','title','subtitle','notes'])text(slide,key);
    if(slide.split===undefined)slide.split=.5;
    if(typeof slide.split!=='number'||!Number.isFinite(slide.split)||slide.split<.25||slide.split>.75)fail('A slide has an invalid column split (expected 0.25–0.75).');
    if(slide.density===undefined)slide.density='comfortable';
    if(!['comfortable','compact'].includes(slide.density))fail('A slide has unsupported spacing.');
    scale(slide);
    for(const key of ['centerTitleHorizontally','centerTitleVertically'])if(slide[key]!=null&&typeof slide[key]!=='boolean')fail('Title alignment must be true or false.');
    if(!Array.isArray(slide.blocks))fail('A slide has an invalid block list.');
    if(slide.background!=null){if(!isObject(slide.background))fail('A background is invalid.');image(slide.background,true);for(const key of ['overlayColor','textColor'])text(slide.background,key,key==='textColor'?'#FFFFFF':'#102036');if(slide.background.overlayOpacity===undefined)slide.background.overlayOpacity=.45;if(!Number.isFinite(slide.background.overlayOpacity)||slide.background.overlayOpacity<0||slide.background.overlayOpacity>1)fail('A background opacity is invalid.');}
    for(const block of slide.blocks) {
      if(!isObject(block))fail('A content block is invalid.');identifier(block.id,blocks);
      if(!BLOCK_KINDS.includes(block.kind))fail('A slide uses an unsupported content block.');
      for(const key of ['heading','body','caption'])text(block,key);scale(block);image(block);
      if(block.table===undefined)block.table={headers:[],rows:[]};
      if(!isObject(block.table)||!Array.isArray(block.table.headers)||!Array.isArray(block.table.rows)||!block.table.headers.every(v=>typeof v==='string')||!block.table.rows.every(row=>Array.isArray(row)&&row.every(v=>typeof v==='string')))fail('A table contains invalid cell data.');
      if(block.style!=null){if(!isObject(block.style))fail('Block style is invalid.');for(const key of ['background','foreground','accent','headerBackground','headerForeground'])if(block.style[key]!=null&&typeof block.style[key]!=='string')fail('A block colour is invalid.');}
    }
  }
  return deck;
}

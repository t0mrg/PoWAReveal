import hljs from 'highlight.js/lib/common';

const inlineTags = new Set('strong b em i u s del mark sub sup small code br span a kbd samp var'.split(' '));
const blockTags = new Set('p div pre ul ol li blockquote h1 h2 h3 h4 h5 h6 table thead tbody tfoot tr td th hr'.split(' '));
const voidTags = new Set(['br','hr']);
const forbiddenContainers = new Set('script style iframe object embed svg math form button select option textarea video audio picture canvas template noscript frameset frame applet xmp plaintext'.split(' '));
const forbiddenVoid = new Set('img input meta link base source track param area wbr'.split(' '));
export const escapeHTML = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const escapeText = value => String(value).replace(/&(?!(?:[A-Za-z][A-Za-z0-9]*|#[0-9]{1,8}|#[xX][0-9a-fA-F]{1,8});)/g,'&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

function parseTag(source, at) {
  const m = /^<(\/?)([A-Za-z][A-Za-z0-9:-]*)/.exec(source.slice(at));
  if (!m) return null;
  let end=at+m[0].length, quote='';
  for (;end<source.length;end++) {
    const c=source[end];
    if (quote) {if(c===quote) quote='';}
    else if(c==='"'||c==="'") quote=c;
    else if(c==='>') break;
  }
  if(end===source.length) return null;
  const raw=source.slice(at+m[0].length,end);
  return {name:m[2].toLowerCase(),closing:!!m[1],selfClosing:/\/\s*$/.test(raw),raw,end:end+1};
}
function attributes(raw,tag) {
  const seen=new Set(); let out='';
  const re=/([^\s=\/<>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for(const m of raw.matchAll(re)) {
    const name=m[1].toLowerCase(),value=m[2]??m[3]??m[4]??'';
    if(seen.has(name))continue;seen.add(name);
    if(name==='class') {
      const tokens=value.split(/\s+/).filter(t=>/^[A-Za-z0-9_-]{1,80}$/.test(t)).slice(0,12);
      if(tokens.length)out+=' class="'+tokens.join(' ')+'"';
    } else if(name==='title') out+=' title="'+escapeHTML(value.slice(0,500))+'"';
    else if(['td','th'].includes(tag)&&['colspan','rowspan'].includes(name)&&/^\d+$/.test(value)&&+value>=1&&+value<=100)out+=' '+name+'="'+(+value)+'"';
  }
  return out;
}
const aliases={py:'python',python3:'python',rscript:'r',js:'javascript',jsx:'javascript',ts:'typescript',tsx:'typescript',sh:'bash',shell:'bash',zsh:'bash','c++':'cpp','c#':'csharp',cs:'csharp',yml:'yaml',htm:'html',xml:'html',text:'plaintext',txt:'plaintext'};
function highlighted(source,info) {
  const candidate=info.trim().split(/\s/)[0].toLowerCase();
  const language=/^[a-z0-9_+#.-]{0,40}$/.test(candidate)?(aliases[candidate]||candidate):'';
  let result=escapeHTML(source);
  if(language&&hljs.getLanguage(language)) {
    try{result=hljs.highlight(source,{language,ignoreIllegals:true}).value.replace(/class="hljs-([^"]+)"/g,(_,classes)=>{const token=classes.split(/\s/)[0];const kind=({keyword:'keyword',literal:'keyword',selector_tag:'keyword',string:'string',regexp:'string',number:'number',type:'type',built_in:'type',comment:'comment',doctag:'comment',title:'function'})[token];return 'class="'+(kind?'sr-token-'+kind:'hljs-'+classes)+'"';});}catch{}
  }
  return '<pre class="sr-code"><code'+(language?' class="language-'+escapeHTML(language)+'"':'')+'>'+result+'</code></pre>';
}
function markdown(source,depth=0) {
  if(depth>=8)return source;
  let out='',cursor=0;
  while(cursor<source.length){
    if(source[cursor]==='\\'&&'*_~`\\'.includes(source[cursor+1]||'')){out+=source[cursor+1];cursor+=2;continue;}
    let matched=false;
    for(const [token,tag] of [['**','strong'],['__','strong'],['~~','del'],['*','em'],['_','em']]){
      if(!source.startsWith(token,cursor))continue;
      if(token.startsWith('_')&&cursor>0&&/[\p{L}\p{N}]/u.test(source[cursor-1]))continue;
      const end=source.indexOf(token,cursor+token.length);
      if(end<=cursor+token.length)continue;
      out+='<'+tag+'>'+markdown(source.slice(cursor+token.length,end),depth+1)+'</'+tag+'>';
      cursor=end+token.length;matched=true;break;
    }
    if(!matched)out+=source[cursor++];
  }
  return out;
}
function markdownAcrossMarkup(html) {
  let prefix='\uE000\uE001';while(html.includes(prefix))prefix+='\uE001';
  const tokens=[];let out='',cursor=0;
  while(cursor<html.length){
    if(html[cursor]==='<'){
      const tag=parseTag(html,cursor);
      if(tag){
        let end=tag.end;
        if(!tag.closing&&['pre','code'].includes(tag.name)){
          let depth=1,next=tag.end;
          while(next<html.length&&depth>0){
            const t=html[next]==='<'?parseTag(html,next):null;
            if(t){if(t.name===tag.name)depth+=t.closing?-1:1;next=t.end;}else next++;
          }
          end=next;
        }
        out+=prefix+tokens.length+'\uE002';tokens.push(html.slice(cursor,end));cursor=end;continue;
      }
    }
    out+=html[cursor++];
  }
  out=markdown(out);
  tokens.forEach((token,i)=>{out=out.replaceAll(prefix+i+'\uE002',token);});
  return out;
}

/** Reconstruct an HTML allowlist rather than pass through source tags. No URLs or style attrs. */
function sanitize(input,allowBlocks) {
  const source=String(input??'').replace(/\r\n?/g,'\n'),allowed=new Set([...inlineTags,...(allowBlocks?blockTags:[])]);
  let output='',buffer='',cursor=0;const stack=[],suppressed=[];
  const flush=()=>{output+=escapeText(buffer);buffer='';};
  while(cursor<source.length){
    if(allowBlocks&&!suppressed.length&&!stack.includes('pre')&&!stack.includes('code')&&(cursor===0||source[cursor-1]==='\n')){
      const fence=/^ {0,3}(`{3,}|~{3,})([^\n]*)(?:\n|$)/.exec(source.slice(cursor));
      if(fence && !(fence[1][0]==='`'&&fence[2].includes('`'))){
        const marker=fence[1][0],width=fence[1].length,indentation=/^ */.exec(fence[0])[0].length;
        const rest=source.slice(cursor+fence[0].length);
        const closing=new RegExp('^ {0,3}'+(marker==='`'?'`':'~')+'{'+width+',}[ \\t]*(?:\\n|$)','m').exec(rest);
        {
          flush();const para=stack.lastIndexOf('p');
          if(para>=0){output+=stack.splice(para).reverse().map(t=>'</'+t+'>').join('');}
          let code=closing?rest.slice(0,closing.index):rest;
          if(indentation)code=code.split('\n').map(line=>line.replace(new RegExp('^ {0,'+indentation+'}'),'')).join('\n');
          output+=highlighted(code,fence[2])+'\n';cursor+=fence[0].length+(closing?closing.index+closing[0].length:rest.length);continue;
        }
      }
    }
    if(source[cursor]==='<'){
      if(source.startsWith('<!--',cursor)){flush();const end=source.indexOf('-->',cursor+4);cursor=end<0?source.length:end+3;continue;}
      if(/^<!|^<\?/.test(source.slice(cursor))){flush();const end=source.indexOf('>',cursor+2);cursor=end<0?source.length:end+1;continue;}
      const tag=parseTag(source,cursor);
      if(tag){
        flush();cursor=tag.end;
        if(suppressed.length){
          if(!tag.closing&&forbiddenContainers.has(tag.name))suppressed.push(tag.name);
          else if(tag.closing){const i=suppressed.lastIndexOf(tag.name);if(i>=0)suppressed.splice(i);}
          continue;
        }
        if(forbiddenVoid.has(tag.name))continue;
        if(forbiddenContainers.has(tag.name)){if(!tag.closing)suppressed.push(tag.name);continue;}
        if(!allowed.has(tag.name))continue;
        if(tag.closing){
          const i=stack.lastIndexOf(tag.name);if(i>=0)output+=stack.splice(i).reverse().map(t=>'</'+t+'>').join('');
        }else{
          if(blockTags.has(tag.name)){const i=stack.lastIndexOf('p');if(i>=0)output+=stack.splice(i).reverse().map(t=>'</'+t+'>').join('');}
          output+='<'+tag.name+attributes(tag.raw,tag.name)+'>';
          if(!voidTags.has(tag.name)){if(tag.selfClosing)output+='</'+tag.name+'>';else stack.push(tag.name);}
        }
        continue;
      }
    }
    if(suppressed.length){cursor++;continue;}
    if(source[cursor]==='`'&&!stack.includes('pre')&&!stack.includes('code')){
      const end=source.indexOf('`',cursor+1);
      if(end>cursor){flush();output+='<code>'+escapeHTML(source.slice(cursor+1,end))+'</code>';cursor=end+1;continue;}
    }
    buffer+=source[cursor++];
  }
  flush();output+=stack.reverse().map(t=>'</'+t+'>').join('');
  return markdownAcrossMarkup(output);
}
export function renderInline(source){return sanitize(source,false);}
export function renderBody(source){
  const safe=sanitize(source,true);let output='',list=null,depth=0;
  for(const line of safe.split('\n')){
    const trimmed=line.trim();const tags=[...line.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi)].filter(m=>blockTags.has(m[2]));
    if(depth===0&&!tags.length&&trimmed){
      const bullet=/^[-•] /.test(trimmed),ordered=/^\d+[.)] /.exec(trimmed),kind=bullet?'ul':ordered?'ol':null;
      if(kind!==list){if(list)output+='</'+list+'>';if(kind)output+='<'+kind+'>';list=kind;}
      if(kind)output+='<li>'+trimmed.slice(bullet?2:ordered[0].length)+'</li>';else output+='<p>'+line+'</p>';
    }else{
      if(list){output+='</'+list+'>';list=null;}
      if(trimmed||depth>0)output+=line+'\n';
    }
    for(const m of tags)if(!voidTags.has(m[2]))depth=Math.max(0,depth+(m[1]?-1:1));
  }
  if(list)output+='</'+list+'>';return output.trim();
}

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProject } from '../scripts/build.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'dist');
let workerSource, shell, cacheName;
before(async()=>{
  // Exercise the real production build without starting a server or using the network.
  await buildProject();
  workerSource=await readFile(path.join(dist,'sw.js'),'utf8');
  shell=JSON.parse(/const SHELL = (\[[\s\S]*?\]);/.exec(workerSource)[1]);
  cacheName=/const CACHE = '([^']+)';/.exec(workerSource)[1];
});

async function filesUnder(directory,prefix=''){
  const files=[];
  for(const name of (await readdir(directory)).sort()){
    const full=path.join(directory,name),relative=prefix+name;
    if((await stat(full)).isDirectory())files.push(...await filesUnder(full,relative+'/'));
    else files.push(relative);
  }
  return files;
}

function workerHarness({scope='https://example.test/PoWAReveal/',installFailure=false}={}){
  const listeners=new Map(),stores=new Map(),deleted=[],network=[],state={skipWaiting:0,claims:0};
  const response=(url,body='cached '+url)=>({url,body});
  const absolute=value=>new URL(typeof value==='string'?value:value.url,scope).href;
  const caches={
    async open(name){
      if(!stores.has(name))stores.set(name,new Map());
      const store=stores.get(name);
      return {
        async addAll(files){
          for(const [index,file] of files.entries()){
            const url=absolute(file);store.set(url,response(url));
            if(installFailure&&index===0)throw new Error('Offline shell asset failed to download');
          }
        },
        async match(key){return store.get(absolute(key));}
      };
    },
    async keys(){return [...stores.keys()];},
    async delete(name){deleted.push(name);return stores.delete(name);}
  };
  const self={registration:{scope},clients:{async claim(){state.claims++;}},skipWaiting(){state.skipWaiting++;},addEventListener(type,callback){listeners.set(type,callback);}};
  const fetch=async request=>{network.push(request.url);return response(request.url,'network');};
  vm.runInNewContext(workerSource,{self,caches,fetch,URL},{filename:'generated-sw.js'});
  const lifecycle=async type=>{
    let pending;
    listeners.get(type)({waitUntil(promise){pending=promise;}});
    assert.ok(pending,`${type} must keep its transaction alive with waitUntil`);
    return pending;
  };
  const request=async(url,options={})=>{
    let pending,intercepted=false;
    listeners.get('fetch')({request:{url:new URL(url,scope).href,method:'GET',mode:'cors',...options},respondWith(promise){intercepted=true;pending=promise;}});
    return {intercepted,response:intercepted?await pending:undefined};
  };
  return {listeners,stores,deleted,network,state,lifecycle,request,scope};
}

test('production build includes every index and manifest resource with relative Pages paths',async()=>{
  const index=await readFile(path.join(dist,'index.html'),'utf8');
  const references=[...index.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
  assert.ok(references.includes('./app.js'));
  assert.ok(references.includes('./manifest.webmanifest'));
  for(const reference of references){
    assert.ok(reference.startsWith('./'),`Shell reference must be relative for Pages: ${reference}`);
    assert.equal((await stat(path.join(dist,reference))).isFile(),true,`Missing shell resource ${reference}`);
  }
  const manifest=JSON.parse(await readFile(path.join(dist,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');assert.equal(manifest.id,'./');
  assert.equal(manifest.display,'standalone');
  assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'));
  assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'));
  for(const icon of manifest.icons){
    assert.ok(icon.src.startsWith('./'));
    assert.equal((await stat(path.join(dist,icon.src))).isFile(),true);
    const png=await readFile(path.join(dist,icon.src));
    assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  }
});

test('generated precache covers the complete shell and cache identity hashes its content',async()=>{
  const files=(await filesUnder(dist)).filter(file=>file!=='sw.js'&&file!=='sw-template.js');
  assert.deepEqual([...shell].sort(),files.map(file=>'./'+file).sort());
  assert.equal(new Set(shell).size,shell.length);
  assert.ok(shell.includes('./app.js'));assert.ok(shell.includes('./app.css'));
  assert.ok(shell.some(file=>file.endsWith('.swiftreveal')),'Bundled examples must work offline');
  const hash=createHash('sha256');
  for(const file of files)hash.update(await readFile(path.join(dist,file)));
  assert.equal(cacheName,'powareveal-'+hash.digest('hex').slice(0,16));
  assert.doesNotMatch(workerSource,/__CACHE_VERSION__|__PRECACHE_FILES__/);
});

test('service worker installs the entire shell before activation and waits for an explicit update message',async()=>{
  const h=workerHarness();
  await h.lifecycle('install');
  assert.equal(h.stores.get(cacheName).size,shell.length);
  assert.equal(h.state.skipWaiting,0,'Installing an update must not refresh open editors');
  assert.equal(h.state.claims,0);
  h.stores.set('powareveal-old',new Map());h.stores.set('another-app-cache',new Map());
  await h.lifecycle('activate');
  assert.equal(h.state.claims,1);
  assert.ok(h.stores.has(cacheName));assert.ok(h.stores.has('another-app-cache'));assert.ok(!h.stores.has('powareveal-old'));
  assert.equal(h.state.skipWaiting,0);
  h.listeners.get('message')({data:null});h.listeners.get('message')({data:{type:'UNRELATED'}});
  assert.equal(h.state.skipWaiting,0);
  h.listeners.get('message')({data:{type:'SKIP_WAITING'}});
  assert.equal(h.state.skipWaiting,1);
});

test('failed installation removes the incomplete new cache and preserves the working version',async()=>{
  const h=workerHarness({installFailure:true});
  const previous=new Map([['index.html',{body:'previous working shell'}]]);
  h.stores.set('powareveal-previous',previous);
  await assert.rejects(h.lifecycle('install'),/shell asset failed/);
  assert.ok(!h.stores.has(cacheName),'A partial shell must never remain as an installable cache');
  assert.equal(h.stores.get('powareveal-previous'),previous);
  assert.deepEqual(h.deleted,[cacheName]);assert.equal(h.state.skipWaiting,0);assert.equal(h.state.claims,0);
});

test('offline navigations under root and GitHub Pages scope use the cached index',async()=>{
  for(const scope of ['https://example.test/','https://example.test/PoWAReveal/']){
    const h=workerHarness({scope});await h.lifecycle('install');
    for(const suffix of ['', 'deck/local-id', '?presentation=local']){
      const result=await h.request(new URL(suffix,scope).href,{mode:'navigate'});
      assert.equal(result.intercepted,true);
      assert.equal(result.response.url,new URL('index.html',scope).href);
      assert.match(result.response.body,/^cached /);
    }
    const script=await h.request('app.js?cache-bust=1#ignored');
    assert.equal(script.response.url,new URL('app.js',scope).href);
    assert.equal(h.network.length,0,'Offline shell navigation and cached resources must never require fetch');
  }
});

test('service worker ignores foreign origins, out-of-scope routes, and non-GET requests',async()=>{
  const h=workerHarness();await h.lifecycle('install');
  for(const [url,options]of [
    ['https://foreign.test/PoWAReveal/',{mode:'navigate'}],
    ['https://example.test/AnotherApp/',{mode:'navigate'}],
    ['https://example.test/PoWARevealSibling/',{mode:'navigate'}],
    ['https://example.test/PoWAReveal/',{method:'POST',mode:'navigate'}],
    ['https://example.test/PoWAReveal/app.js',{method:'PUT'}]
  ]){
    assert.equal((await h.request(url,options)).intercepted,false);
  }
  assert.equal(h.network.length,0);
});

test('uncached in-scope assets use network fallback instead of receiving HTML',async()=>{
  const h=workerHarness();await h.lifecycle('install');
  const asset=await h.request('missing-image.png');
  assert.equal(asset.intercepted,true);assert.equal(asset.response.body,'network');
  assert.deepEqual(h.network,['https://example.test/PoWAReveal/missing-image.png']);
});

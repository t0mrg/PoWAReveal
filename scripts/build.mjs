import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildProject() {
  const out=path.join(root,'dist');
  await mkdir(out,{recursive:true});
  await cp(path.join(root,'public'),out,{recursive:true});
  await cp(path.join(root,'index.html'),path.join(out,'index.html'));
  for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md'])await cp(path.join(root,name),path.join(out,name));
  await cp(path.join(root,'src/app.css'),path.join(out,'app.css'));
  await build({entryPoints:[path.join(root,'src/app.js')],outfile:path.join(out,'app.js'),bundle:true,format:'esm',platform:'browser',target:['chrome110','edge110','firefox115','safari16.4'],minify:true,legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
  // New cache identity depends on every shell resource, including decoder WASM.
  const files=[];
  async function walk(dir,prefix='') {for(const name of (await readdir(dir)).sort()){if(name==='sw.js'||name==='sw-template.js')continue;const relative=prefix+name,full=path.join(dir,name);if((await stat(full)).isDirectory())await walk(full,relative+'/');else files.push(relative);}}
  await walk(out);
  const hash=createHash('sha256');for(const file of files)hash.update(await readFile(path.join(out,file)));
  const version=hash.digest('hex').slice(0,16);
  const template=await readFile(path.join(root,'scripts/sw-template.js'),'utf8');
  await writeFile(path.join(out,'sw.js'),template.replace('__CACHE_VERSION__',version).replace('__PRECACHE_FILES__',JSON.stringify(files.map(f=>'./'+f))));
  console.log(`Built PoWAReveal ${version} (${files.length} offline assets) → dist/`);
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildProject();

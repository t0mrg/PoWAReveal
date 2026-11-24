// Local browser test fixture server. Never deployed or bundled into the application.
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import http from 'node:http';
import {buildPowerPointRuntime} from './build-powerpoint.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(root,'.cache/powerpoint-qa');
await mkdir(dir,{recursive:true});await buildPowerPointRuntime();
await build({entryPoints:[path.join(root,'tests/browser/powerpoint.js')],outfile:path.join(dir,'qa.js'),bundle:true,platform:'browser',format:'esm',target:'safari16.4',define:{'process.env.NODE_ENV':'"production"'}});
const page='<!doctype html><html lang="en"><meta charset="utf-8"><title>PoWAReveal PowerPoint checks</title><style>body{font:16px system-ui;max-width:960px;margin:35px auto;padding:0 20px}button{padding:15px}.pass{color:#176b44}.fail{color:#a12e27}li{padding:2px}</style><h1>PowerPoint export regression checks</h1><p>Exercises production rendering and export using generated local fixtures. Output stays on this machine.</p><button id="run">Run PowerPoint checks</button><p id="status" role="status">Ready</p><ol id="results"></ol><script type="module" src="./qa.js"></script></html>';
http.createServer(async(req,res)=>{
  try{
    if(req.method==='POST'&&/^\/results\/(sixteenByNine\.pptx|sixByFour\.pptx|results\.json)$/.test(req.url)){
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>20*1024*1024)throw new Error('Fixture too large');chunks.push(chunk);}
      await writeFile(path.join(dir,path.basename(req.url)),Buffer.concat(chunks));res.writeHead(200);res.end('Saved');return;
    }
    if(req.url==='/qa.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(await readFile(path.join(dir,'qa.js')));return;}
    if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(page);return;}
    res.writeHead(404);res.end('Not found');
  }catch(error){res.writeHead(500);res.end(error.message);}
}).listen(4181,'127.0.0.1',()=>console.log('PowerPoint QA: http://localhost:4181/'));

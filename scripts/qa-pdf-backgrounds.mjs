// An opt-in browser regression harness. Never included in the production dist/.
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(root,'.cache/pdf-background-qa');
await mkdir(dir,{recursive:true});
await build({entryPoints:[path.join(root,'tests/browser/pdf-backgrounds.js')],outfile:path.join(dir,'qa.js'),bundle:true,platform:'browser',format:'esm',target:'safari16.4',define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
const page='<!doctype html><html lang="en"><meta charset="utf-8"><title>PoWAReveal PDF background regression</title><style>body{font:15px system-ui;max-width:1000px;margin:35px auto;padding:0 20px;color:#26343b}button{padding:10px;margin:5px;border:1px solid #adc8cb;border-radius:5px;background:#e4f2f2;cursor:pointer}.pass{color:#216b4c}.fail{color:#b32e36}li{padding:3px}#status{background:#eef4f5;padding:15px;font-weight:600}</style><h1>PDF background regression</h1><p>Local test fixtures only. These checks exercise the production renderer and PDF capture. No presentation data is sent to a server.</p><button id="run">Run pixel checks</button><button id="pdf-wide">Export 16:9 PDF</button><button id="pdf-tall">Export 6:4 PDF</button><p id="status" role="status">Ready</p><ol id="results"></ol><script type="module" src="./qa.js"></script></html>';
const server=http.createServer(async(req,res)=>{
  if(req.url==='/qa.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(await readFile(path.join(dir,'qa.js')));}
  else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(page);}
  else {res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.message);process.exit(1);});
server.listen(4180,'127.0.0.1',()=>console.log('PDF background QA: http://localhost:4180/\nOpen in Safari and run the checks. Ctrl+C stops the server.'));

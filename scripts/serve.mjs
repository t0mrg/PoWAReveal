import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {buildProject} from './build.mjs';
if(!process.argv.includes('--dist'))await buildProject();
const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const portArg=process.argv.indexOf('--port');
const port=portArg<0?4173:Number(process.argv[portArg+1]);
const baseArg=process.argv.indexOf('--base');
const base=baseArg<0?'/':`/${process.argv[baseArg+1].replace(/^\/+|\/+$/g,'')}/`;
const types={'.md':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.swiftreveal':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname===base.slice(0,-1)&&base!=='/'){res.writeHead(302,{Location:base});res.end();return;}
    if(!url.pathname.startsWith(base)){res.writeHead(404);res.end('Not found');return;}
    let pathname=decodeURIComponent(url.pathname.slice(base.length));
    if(!pathname||pathname.endsWith('/'))pathname+='index.html';
    const full=path.resolve(root,pathname);
    if(full!==root&&!full.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
    const info=await stat(full);if(!info.isFile())throw new Error('Not found');
    const body=await readFile(full);
    res.writeHead(200,{'Content-Type':types[path.extname(full)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    res.end(body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.on('error',error=>{console.error(error.message);process.exit(1);});
server.listen(port,'127.0.0.1',()=>console.log(`PoWAReveal: http://localhost:${port}${base}\nPress Ctrl+C to stop. Restart npm run dev after changing source.`));

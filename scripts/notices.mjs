import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const parts=['# Third-party notices\n\nPoWAReveal ports SwiftReveal rendering and schema code under its MIT licence. The repository root LICENSE retains SwiftReveal copyright. Vendored runtime and decoder notices are reproduced below.\n'];
for(const name of ['SwiftReveal-LICENSE','reveal-LICENSE','mermaid-LICENSE','mermaid-THIRD-PARTY-NOTICES','LZFSE-LICENSE','LZFSE-NOTICE']){
 try{parts.push(`## ${name}\n\n${await readFile(path.join('src/vendor',name),'utf8')}`);}catch{}
}
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
for(const [relative,meta] of Object.entries(lock.packages)){
 if(!relative||meta.dev)continue;
 const name=relative.split('node_modules/').at(-1);
 const names=await readdir(relative);
 const notice=names.find(n=>/^licen[cs]e(?:\.md|\.txt)?$/i.test(n));
 parts.push(`## ${name} ${meta.version}\n\nLicence: ${meta.license || 'See package licence'}.\n${notice?'\n'+await readFile(path.join(relative,notice),'utf8'):''}`);
}
await writeFile('THIRD_PARTY_NOTICES.md',parts.join('\n\n'));

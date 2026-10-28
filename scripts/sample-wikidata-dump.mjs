/** Operator-only: stream an official Wikidata JSON dump to reviewed-candidate staging. */
import {createGunzip} from 'node:zlib';
import {writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {sampleDump} from '../src/dump-sampler.mjs';
import {validateCatalog} from '../src/core.mjs';
function option(args,key,fallback) {
 const i=args.indexOf(key);
 if(i===-1)return fallback;
 if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing '+key+' value');
 return args[i+1];
}
const args=process.argv.slice(2);
const allowed=new Set(['--gzip','--per-kind','--out']);
for(let i=0;i<args.length;i++) {
 if(!allowed.has(args[i]))throw Error('Unknown option: '+args[i]);
 if(args[i]!=='--gzip')i++;
}
const perKind=Number(option(args,'--per-kind','3000'));
const dest=resolve(option(args,'--out','data/catalog.pending.json'));
const input=args.includes('--gzip')?process.stdin.pipe(createGunzip()):process.stdin;
const {catalog,counts}=await sampleDump(input,{perKind});
validateCatalog(catalog);
const data=JSON.stringify(catalog,null,2)+'\n';
if(Buffer.byteLength(data)>20*1024*1024)throw Error('Catalog exceeds 20 MiB staging cap');
const temp=dest+'.'+randomUUID()+'.tmp';
try{writeFileSync(temp,data,{flag:'wx',mode:0o600});renameSync(temp,dest);}
finally{try{unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
console.log(JSON.stringify({staged:dest,counts,perKind,entries:catalog.entries.length,sha256:createHash('sha256').update(data).digest('hex'),reviewed:false,liveArticleVerified:false},null,2));

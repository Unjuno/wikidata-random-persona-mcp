/** Single-writer, local-filesystem lifecycle for Work/Codex. Sites storage needs its own transaction adapter. */
import {readFileSync,writeFileSync,renameSync,unlinkSync,openSync,closeSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {validateCatalog} from './core.mjs';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function atomicWrite(path,bytes){
 const temp=`${path}.${randomUUID()}.tmp`;
 try{writeFileSync(temp,bytes,{flag:'wx',mode:0o600});renameSync(temp,path);}finally{try{unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
export async function withCatalogLock(dir,fn){
 const path=join(dir,'.catalog-update.lock');let fd;
 try{fd=openSync(path,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw Error('Catalog update already running (check a stale lock manually)');throw e;}
 try{return await fn();}finally{closeSync(fd);unlinkSync(path);}
}
export function promoteCatalog({dir='data',reviewed=false,expectedSha256}={}){
 if(!reviewed)throw Error('Explicit --reviewed approval required');
 const bytes=readFileSync(join(dir,'catalog.pending.json'));
 if(!/^[a-f0-9]{64}$/.test(expectedSha256??'')||sha256(bytes)!==expectedSha256)throw Error('Reviewed candidate digest mismatch');
 const candidate=JSON.parse(bytes);validateCatalog(candidate);
 for(const row of candidate.entries)for(const s of row.sources)if(!s.checked_at)throw Error('Metadata checked_at required before promotion');
 if(!candidate.entries.some(x=>x.kind==='real')||!candidate.entries.some(x=>x.kind==='fictional'))throw Error('Both categories required');
 const previous=readFileSync(join(dir,'catalog.json'));validateCatalog(JSON.parse(previous));
 atomicWrite(join(dir,'catalog.previous.json'),previous);
 const published={...candidate,version:candidate.version.replace(/^candidate-/,'published-')};
 atomicWrite(join(dir,'catalog.json'),JSON.stringify(published,null,2)+'\n');
 return published.version;
}

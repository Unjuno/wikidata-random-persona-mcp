/** Stream official dump (stdin) into a QID-only candidate. No auto-promotion. */
import {createGunzip} from 'node:zlib';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {atomicWrite} from '../src/catalog-files.mjs';
import {sampleDumpQidIndex} from '../src/dump-sampler.mjs';
import {validatePersonaIndex} from '../src/persona-index.mjs';

const args=process.argv.slice(2);
let perKind=50000,out='data/persona-index.pending.json',gzip=false;
for(let i=0;i<args.length;i++){
 const option=args[i];
 if(option==='--gzip'){if(gzip)throw Error('Repeated --gzip');gzip=true;continue;}
 if(!['--per-kind','--out'].includes(option)||!args[i+1])throw Error('Invalid CLI argument: '+option);
 if(option==='--per-kind')perKind=Number(args[++i]);
 else out=args[++i];
}
const input=gzip?process.stdin.pipe(createGunzip()):process.stdin;
const {index,counts}=await sampleDumpQidIndex(input,{perKind});
validatePersonaIndex(index);
const bytes=JSON.stringify(index,null,2)+'\n';
if(Buffer.byteLength(bytes)>12*1024*1024)throw Error('Index exceeds 12 MiB candidate limit');
const destination=resolve(out);
atomicWrite(destination,bytes);
console.log(JSON.stringify({
 candidate:destination,complete_scan:true,version:index.version,
 scanned:counts.seen,eligible_population:index.population,sampled_qids:index.qids.real.length+index.qids.fictional.length,
 sha256:createHash('sha256').update(bytes).digest('hex'),reviewed:false,
 note:'A complete dump scan is required; this is not an approved or deployed index.'
},null,2));

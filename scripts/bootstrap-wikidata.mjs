/** Bounded bootstrap from live Wikidata with metadata-only QID lookup; never automatically publishes. */
import {bootstrapCatalog} from '../src/bootstrap-wikidata.mjs';
import {validateCatalog} from '../src/core.mjs';
import {atomicWrite,sha256} from '../src/catalog-files.mjs';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--per-kind')throw Error('Usage: node scripts/bootstrap-wikidata.mjs --per-kind <1-1000>');
const perKind=Number(args[1]);
const {catalog,counts}=await bootstrapCatalog({perKind});
validateCatalog(catalog);
const bytes=JSON.stringify(catalog,null,2)+'\n';
if(Buffer.byteLength(bytes)>20*1024*1024)throw Error('Candidate too large');
atomicWrite('data/catalog.pending.json',bytes);
console.log(JSON.stringify({path:'data/catalog.pending.json',counts,entries:catalog.entries.length,sha256:sha256(bytes),reviewed:false,globallyUniform:false},null,2));

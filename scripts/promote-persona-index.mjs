/** Operator-only QID index promotion: requires human-reviewed SHA-256. */
import {withCatalogLock,promotePersonaIndex} from '../src/catalog-files.mjs';
const args=process.argv.slice(2);
const shaIndex=args.indexOf('--expected-sha256');
if(args.length!==3||!args.includes('--reviewed')||shaIndex<0||!args[shaIndex+1])
 throw Error('Usage: npm run catalog:index-promote -- --reviewed --expected-sha256 <64 hex chars>');
await withCatalogLock('data',async()=>{
 const index=promotePersonaIndex({reviewed:true,expectedSha256:args[shaIndex+1]});
 console.log(JSON.stringify({approved:index.version,source:index.source,complete_scan:index.complete_scan,
  population:index.population,sample_sizes:{real:index.qids.real.length,fictional:index.qids.fictional.length},
  next:'Commit reviewed data/persona-index.json, run tests, then explicitly republish the existing ChatGPT Site'},null,2));
});

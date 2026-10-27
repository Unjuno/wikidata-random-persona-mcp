/** Manual staging only. Metadata verification failure never modifies the live catalog. */
import {readFileSync} from 'node:fs';
import {refreshCatalog,requestMetadata} from '../src/catalog-update.mjs';
import {atomicWrite,withCatalogLock,sha256} from '../src/catalog-files.mjs';
await withCatalogLock('data',async()=>{
 const seeds=JSON.parse(readFileSync('data/seeds.json','utf8')).entries;
 const request=url=>requestMetadata(url,{userAgent:process.env.WIKIMEDIA_USER_AGENT});
 const {catalog,rejected}=await refreshCatalog(seeds,{request});
 const bytes=JSON.stringify(catalog,null,2)+'\n';
 atomicWrite('data/catalog.pending.json',bytes);
 console.log(JSON.stringify({staged:'data/catalog.pending.json',version:catalog.version,entries:catalog.entries.length,rejected,sha256:sha256(bytes)},null,2));
 console.log('Review the candidate diff, then promote with --reviewed --expected-sha256 <the reviewed digest>. No automatic publishing.');
});

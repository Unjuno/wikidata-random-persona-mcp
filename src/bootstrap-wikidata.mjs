/** Bounded first catalog bootstrap from Wikidata category queries; NOT globally uniform. */
import {secureRandomIndex,validateCatalog,isQid} from './core.mjs';
import {normalizeEntity} from './wikidata.mjs';
export const BOOTSTRAP_CLASSES=Object.freeze([
 {id:'Q5',kind:'real'},
 {id:'Q15632617',kind:'fictional'},
 {id:'Q95074',kind:'fictional'},
 {id:'Q80447738',kind:'fictional'},
 {id:'Q87576284',kind:'fictional'},
 {id:'Q1114461',kind:'fictional'}
]);
const UA='RandomPersonaMCP/0.3 (+https://github.com/Unjuno/wikidata-random-persona-mcp)';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function buildSparql(type,limit) {
 if(!isQid(type)||!Number.isInteger(limit)||limit<1||limit>2000)throw Error('Invalid Wikidata type or limit');
 return 'SELECT ?item WHERE { ?item wdt:P31 wd:'+type+' . } LIMIT '+limit;
}
async function getJson(url,{fetchImpl=fetch,pause=sleep}={}) {
 if(url.protocol!=='https:'||!['www.wikidata.org','query.wikidata.org'].includes(url.hostname))throw Error('Host forbidden');
 for(let attempt=0;attempt<3;attempt++) {
  const response=await fetchImpl(url,{headers:{'User-Agent':UA,Accept:'application/json'},signal:AbortSignal.timeout(30000),redirect:'error'});
  if(response.ok) {
   if(Number(response.headers.get('content-length')||0)>4*1024*1024)throw Error('Metadata response too large');
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes.byteLength>4*1024*1024)throw Error('Metadata response too large');
   const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(!data.error)return data;
   if(data.error.code!=='maxlag')throw Error('Wikidata API error: '+data.error.code);
  }else if(response.status!==429&&response.status<500)throw Error('Wikidata HTTP '+response.status);
  if(attempt===2)break;
  const retry=response.headers.get('retry-after');
  const seconds=retry&&/^\d+$/.test(retry)?Number(retry):Math.max(2,attempt*3+2);
  if(seconds>30)throw Error('Rate limit wait exceeds budget; retry the job later');
  await pause(seconds*1000);
 }
 throw Error('Wikidata request retries exhausted');
}
export async function listByType(type,limit=500,opts={}) {
 const url=new URL('https://query.wikidata.org/sparql');
 url.search=new URLSearchParams({query:buildSparql(type,limit),format:'json'});
 const data=await getJson(url,opts);
 const bindings=data?.results?.bindings;
 if(!Array.isArray(bindings))throw Error('Invalid query result');
 return bindings.map(row=>row?.item?.value?.match(/\/entity\/(Q[1-9][0-9]{0,11})$/)?.[1]).filter(Boolean);
}
export async function lookupItems(ids,opts={}) {
 if(!Array.isArray(ids)||ids.length>20||!ids.every(isQid))throw Error('Invalid QID batch');
 const url=new URL('https://www.wikidata.org/w/api.php');
 url.search=new URLSearchParams({action:'wbgetentities',ids:ids.join('|'),props:'labels|descriptions|sitelinks',languages:'ja|en',format:'json',maxlag:'5'});
 const data=await getJson(url,opts);
 if(!data?.entities||typeof data.entities!=='object')throw Error('Invalid Wikidata entity response');
 return data.entities;
}
export async function bootstrapCatalog({perKind=150,queryLimit=800,classes=BOOTSTRAP_CLASSES,queryIds=listByType,getEntities=lookupItems,randomIndex=secureRandomIndex,sleep:wait=sleep}={}) {
 if(!Number.isSafeInteger(perKind)||perKind<1||perKind>1000)throw Error('perKind must be 1..1000');
 const pools={real:new Map(),fictional:new Map()};
 const seen=new Set();
 for(const category of classes) {
  if(!isQid(category.id)||!['real','fictional'].includes(category.kind))throw Error('Invalid class');
  const ids=await queryIds(category.id,queryLimit);
  if(!Array.isArray(ids))throw Error('Invalid category QID list');
  for(let i=0;i<ids.length;i+=20) {
   const batch=ids.slice(i,i+20).filter(qid=>isQid(qid)&&!seen.has(qid));
   if(!batch.length)continue;
   const entities=await getEntities(batch);
   for(const qid of batch) {
    seen.add(qid);
    const base=entities[qid];
    // WDQS P31 membership is authoritative for metadata-only API queries.
    const verified=base && !base.claims ? {...base,claims:{P31:[{mainsnak:{datavalue:{value:{id:category.id}}},rank:'normal'}]}} : base;
    const row=normalizeEntity(verified,{qid,kind:category.kind});
    if(row)pools[category.kind].set(qid,row);
   }
   await wait(250);
  }
  await wait(1500);
 }
 for(const kind of ['real','fictional'])if(!pools[kind].size)throw Error('both real and fictional categories required');
 const entries=[];
 for(const kind of ['real','fictional']) {
  const rows=[...pools[kind].values()];
  for(let i=rows.length-1;i>0;i--) {
   const j=randomIndex(i+1);const t=rows[i];rows[i]=rows[j];rows[j]=t;
  }
  entries.push(...rows.slice(0,perKind));
 }
 const catalog={version:'candidate-bootstrap-'+new Date().toISOString(),source:'Wikidata direct P31 category query; bounded bootstrap, not uniform across all Wikidata; sitelinks not live verified',entries};
 validateCatalog(catalog);
 return {catalog,counts:{real:pools.real.size,fictional:pools.fictional.size}};
}

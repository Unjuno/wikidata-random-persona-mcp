/** Operator-only metadata access; never imported by the MCP runtime. */
import {isQid,isAllowedSourceUrl,validateCatalog} from './core.mjs';
import {normalizeEntity} from './wikidata.mjs';
import {readBoundedBody} from './http.mjs';
const HOSTS=new Set(['www.wikidata.org','en.wikipedia.org','ja.wikipedia.org']);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const UA='RandomPersonaMCP/0.2 (+https://github.com/Unjuno/wikidata-random-persona-mcp)';
export async function requestMetadata(url,{fetchImpl=fetch,sleep=pause,now=()=>Date.now(),userAgent=UA}={}){
 if(!(url instanceof URL)||url.protocol!=='https:'||!HOSTS.has(url.hostname)||url.pathname!=='/w/api.php'||url.username||url.password||url.port||url.hash)throw Error('Unapproved metadata endpoint');
 for(let attempt=0;attempt<3;attempt++){
  let response;
  try{response=await fetchImpl(url,{headers:{'User-Agent':userAgent,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});}
  catch(error){if(attempt===2)throw error;await sleep(1000*(attempt+1));continue;}
  let data;
  if(response.ok)data=JSON.parse(new TextDecoder().decode(await readBoundedBody(response,2097152)));
  const lag=data?.error?.code==='maxlag';
  if(response.ok && !data?.error)return data;
  if(!(response.status===429||response.status>=500||lag))throw Error(`Metadata request failed: ${data?.error?.code??response.status}`);
  if(attempt===2)throw Error('Metadata retries exhausted');
  const retry=response.headers.get('retry-after');
  let delay=lag?5000:1000*(attempt+1);
  if(retry!==null){const ms=/^\d+$/.test(retry)?Number(retry)*1000:Date.parse(retry)-now();if(Number.isFinite(ms))delay=Math.max(delay,ms);}
  // Do not shorten the server's minimum wait to fit our bounded interactive job.
  if(delay>30000){void response.body?.cancel().catch(()=>{});throw Error('Retry-After exceeds this run budget; retry the job later');}
  if(!response.ok)await response.body?.cancel();
  await sleep(delay);
 }
 throw Error('Metadata retries exhausted');
}
export async function verifyArticle(source,qid,{request=requestMetadata,now=()=>new Date()}={}){
 if(source.purpose!=='article'||!isAllowedSourceUrl(source.url,qid,'article'))return null;
 const article=new URL(source.url);if(article.hostname!==`${source.language}.wikipedia.org`)return null;
 const url=new URL('/w/api.php',article);
 url.search=new URLSearchParams({action:'query',titles:decodeURIComponent(article.pathname.slice(6)).replaceAll('_',' '),prop:'info|pageprops',ppprop:'disambiguation|wikibase_item',inprop:'url',redirects:'1',format:'json',formatversion:'2',maxlag:'5'});
 const data=await request(url);
 if(data?.query?.redirects?.some(r=>r.tofragment))return null;
 const pages=data?.query?.pages;
 if(!Array.isArray(pages)||pages.length!==1)return null;
 const page=pages[0];const props=page.pageprops??{};
 if(page.missing!==undefined||page.invalid!==undefined||page.ns!==0||'disambiguation' in props||props.wikibase_item!==qid)return null;
 if(!isAllowedSourceUrl(page.fullurl,qid,'article')||new URL(page.fullurl).hostname!==article.hostname)return null;
 return {url:page.fullurl,language:source.language,purpose:'article',checked_at:now().toISOString()};
}
export async function refreshCatalog(seeds,{request=requestMetadata,sleep=pause,now=()=>new Date()}={}){
 if(!Array.isArray(seeds)||!seeds.length||seeds.length>100)throw Error('seed count must be 1-100 per reviewed batch');
 const seen=new Set();for(const seed of seeds){if(!seed||!isQid(seed.qid)||!['real','fictional'].includes(seed.kind)||seen.has(seed.qid))throw Error('invalid or duplicate seed');seen.add(seed.qid);}
 const entries=[];const rejected=[];
 for(let i=0;i<seeds.length;i+=10){
  const batch=seeds.slice(i,i+10);const url=new URL('https://www.wikidata.org/w/api.php');
  url.search=new URLSearchParams({action:'wbgetentities',ids:batch.map(s=>s.qid).join('|'),props:'labels|descriptions|sitelinks|claims',languages:'ja|en',format:'json',formatversion:'1',maxlag:'5'});
  const data=await request(url);if(!data?.entities||typeof data.entities!=='object')throw Error('Invalid Wikidata response');
  for(const seed of batch){
   const row=normalizeEntity(data.entities[seed.qid],seed);if(!row){rejected.push({qid:seed.qid,reason:'identity/classification/sitelink'});continue;}
   const sources=[];
   for(const s of row.sources.filter(s=>s.purpose==='article')){await sleep(1000);const verified=await verifyArticle(s,row.qid,{request,now});if(verified)sources.push(verified);}
   if(!sources.length){rejected.push({qid:seed.qid,reason:'no verified article'});continue;}
   sources.push({url:`https://www.wikidata.org/wiki/${row.qid}`,language:'mul',purpose:'identity',checked_at:now().toISOString()});
   entries.push({...row,sources});
  }
  if(i+10<seeds.length)await sleep(1000);
 }
 const catalog={version:`candidate-${now().toISOString().replace(/[:.]/g,'-')}`,source:'Wikidata structured metadata; no article bodies',entries};
 validateCatalog(catalog);
 if(!entries.some(e=>e.kind==='real')||!entries.some(e=>e.kind==='fictional'))throw Error('Both categories required before staging');
 return {catalog,rejected};
}

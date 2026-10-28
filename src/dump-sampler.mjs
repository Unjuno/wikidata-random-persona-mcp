/** Offline streaming reservoir sample from an official Wikidata JSON dump.
 * Contains Wikidata/Wikipedia references, no article bodies or model calls.
 */
import { randomInt as secureRandomInt } from 'node:crypto';
import { createInterface } from 'node:readline';
import { isAllowedSourceUrl, isQid } from './core.mjs';

// Explicit recognized P31 types; does NOT implement transitive P279 closure.
export const CHARACTER_CLASSES = new Set([
 'Q95074','Q15632617','Q15711870','Q1114461','Q80447738',
 'Q87576284','Q3658341','Q15773347','Q2593744','Q3542731',
 'Q28020127','Q30061312','Q89050913'
]);
const BAD_NS=/^(?:Special|Category|Template|Help|File|Image|Wikipedia|Portal|Draft|Module|Talk|User|特別|カテゴリ|カテゴリー|ファイル|画像|テンプレート|利用者|ノート)[:：]/i;

export function parseDumpRecord(raw) {
 if(typeof raw!=='string')throw new TypeError('dump line must be string');
 const line=raw.trim();
 if(!line||line==='['||line===']')return null;
 return JSON.parse(line.endsWith(',')?line.slice(0,-1):line);
}
function classIds(item) {
 const claims=Array.isArray(item?.claims?.P31)?item.claims.P31:[];
 const active=claims.filter(x=>x&&x.rank!=='deprecated');
 const preferred=active.filter(x=>x.rank==='preferred');
 return new Set((preferred.length?preferred:active).map(x=>x?.mainsnak?.datavalue?.value?.id).filter(x=>typeof x==='string'));
}
function text(value,max) {
 return typeof value==='string'?value.replace(/[\u0000-\u001F\u007F]/g,' ').trim().slice(0,max):'';
}
export function eligibleDumpEntity(entity) {
 if(!entity||entity.type!=='item'||!isQid(entity.id))return null;
 const classes=classIds(entity);
 const real=classes.has('Q5');
 const fictional=[...classes].some(id=>CHARACTER_CLASSES.has(id));
 if(real===fictional)return null;
 const sources=[];
 for(const language of ['ja','en']) {
  const title=entity.sitelinks?.[language+'wiki']?.title;
  if(typeof title!=='string'||title.length>250||title.includes('#')||BAD_NS.test(title))continue;
  const url='https://'+language+'.wikipedia.org/wiki/'+encodeURIComponent(title.replaceAll(' ','_'));
  if(!isAllowedSourceUrl(url,entity.id,'article'))continue;
  sources.push({url,language,purpose:'article'});
 }
 if(!sources.length)return null;
 const name=text(entity.labels?.ja?.value||entity.labels?.en?.value||entity.sitelinks?.jawiki?.title||entity.sitelinks?.enwiki?.title,160);
 if(!name)return null;
 sources.push({url:'https://www.wikidata.org/wiki/'+entity.id,language:'mul',purpose:'identity'});
 return {qid:entity.id,kind:real?'real':'fictional',name,description:text(entity.descriptions?.ja?.value||entity.descriptions?.en?.value,280),sources};
}
export async function sampleDump(input,{perKind=3000,randomInt=secureRandomInt,version='candidate-dump-'+new Date().toISOString()}={}) {
 if(!Number.isSafeInteger(perKind)||perKind<1||perKind>20000)throw new RangeError('perKind must be 1..20000');
 const chosen={real:[],fictional:[]};
 const counts={seen:0,real:0,fictional:0};
 let started=false,ended=false;
 const lines=createInterface({input,crlfDelay:Infinity});
 for await (const raw of lines) {
  const line=raw.trim();
  if(!line)continue;
  if(!started){if(line!=='[')throw Error('Wikidata dump must start with array bracket');started=true;continue;}
  if(line===']'){ended=true;continue;}
  if(ended)throw Error('Trailing data after terminating bracket');
  if(line.length>8*1024*1024)throw Error('Wikidata dump line too large');
  const entity=parseDumpRecord(line);counts.seen++;
  const entry=eligibleDumpEntity(entity);
  if(!entry)continue;
  const kind=entry.kind;
  counts[kind]++;
  const pool=chosen[kind];
  if(pool.length<perKind)pool.push(entry);
  else {
   const j=randomInt(counts[kind]);
   if(!Number.isSafeInteger(j)||j<0||j>=counts[kind])throw Error('Invalid random index');
   if(j<perKind)pool[j]=entry;
  }
 }
 if(!started||!ended)throw Error('Wikidata JSON dump must have terminating bracket');
 if(!chosen.real.length||!chosen.fictional.length)throw Error('both real and fictional entries required');
 const catalog={version,source:'Wikidata JSON dump; sampled; P31 types and Wikipedia sitelinks only; NOT live article verified',entries:[...chosen.real,...chosen.fictional]};
 return {catalog,counts};
}


/** Build a compact QID-only index; a complete dump scan is REQUIRED.
 * The same eligibility criteria as the full-row reservoir are applied.
 * Population counts are used to weight real/fictional draws correctly.
 */
export async function sampleDumpQidIndex(input,{perKind=50000,randomInt=secureRandomInt,version='dump-'+new Date().toISOString()}={}){
 if(!Number.isSafeInteger(perKind)||perKind<1||perKind>250000)throw new RangeError('perKind must be 1..250000');
 const qids={real:[],fictional:[]};
 const counts={seen:0,real:0,fictional:0};
 let started=false,ended=false;
 const lines=createInterface({input,crlfDelay:Infinity});
 for await(const raw of lines){
  const line=raw.trim();
  if(!line)continue;
  if(!started){if(line!=='[')throw Error('Wikidata dump must start with array bracket');started=true;continue;}
  if(line===']'){ended=true;continue;}
  if(ended)throw Error('Trailing records after dump closing bracket');
  if(line.length>8*1024*1024)throw Error('Wikidata dump line too large');
  const entity=parseDumpRecord(line);
  counts.seen++;
  const entry=eligibleDumpEntity(entity);
  if(!entry)continue;
  const pool=qids[entry.kind],count=++counts[entry.kind];
  if(pool.length<perKind)pool.push(entry.qid);
  else{
   const j=randomInt(count);
   if(!Number.isSafeInteger(j)||j<0||j>=count)throw Error('Invalid random sample index');
   if(j<perKind)pool[j]=entry.qid;
  }
 }
 if(!started||!ended)throw Error('Wikidata JSON dump requires a terminating bracket');
 if(!qids.real.length||!qids.fictional.length)throw Error('Both real and fictional subjects are required');
 const index={version,source:'Wikidata JSON dump',complete_scan:true,
  population:{real:counts.real,fictional:counts.fictional},qids};
 return {index,counts};
}

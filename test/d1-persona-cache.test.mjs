import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1PersonaCache} from '../src/d1-persona-cache.mjs';

const sources = [
 {url:'https://en.wikipedia.org/wiki/Douglas_Adams',language:'en',purpose:'article'},
 {url:'https://www.wikidata.org/wiki/Q42',language:'mul',purpose:'identity'}
];
const stored=(qid='Q42',kind='real',key=42)=>({
 qid,kind,name:'ダグラス・アダムズ',description:'作家',
 sources_json:JSON.stringify(sources.map(x=>x.purpose==='identity'?{...x,url:'https://www.wikidata.org/wiki/'+qid}:x)),
 random_key:key,checked_at_ms:Date.parse('2026-10-29T00:00:00.000Z')
});
function fixture(rows=[]){
 const statements=[];
 return {
  statements,
  prepare(sql){
   const request={sql,args:[]};statements.push(request);
   return {bind(...args){
    request.args=args;
    return {
     async first(){
      if(sql.includes('WHERE qid = ?'))return rows.find(x=>x.qid===args[0])??null;
      throw Error('Unexpected D1 first SQL '+sql);
     },
     async all(){
      if(!sql.includes('random_key'))throw Error('Unexpected D1 all SQL');
      const [kind,threshold]=args;
      return {results:rows.filter(x=>x.kind===kind && (sql.includes('random_key >= ?')?x.random_key>=threshold:x.random_key<threshold))
       .sort((a,b)=>a.random_key-b.random_key||a.qid.localeCompare(b.qid)).slice(0,32)};
     },
     async run(){return {success:true,meta:{changes:1}};}
    };
   }};
  }
 };
}
test('D1 cache retrieves a stored QID as valid, sourced, explicitly stale-capable metadata',async()=>{
 const db=fixture([stored()]);
 const cache=createD1PersonaCache(db,{randomIndex:()=>0});
 const value=await cache.get({qid:'Q42',language:'ja'});
 assert.equal(value.status,'ok');
 assert.equal(value.persona.qid,'Q42');
 assert.equal(value.persona.sources.at(-1).purpose,'identity');
 assert.equal(value.source_mode,'d1_cache_fallback');
 assert.equal(value.cache_checked_at,'2026-10-29T00:00:00.000Z');
 assert.equal(value.catalog_version,'d1-prefetch-cache');
 assert.ok(value.roleplay_prompt.includes('仮想対話'));
 assert.equal(db.statements.length,1);
 assert.match(db.statements[0].sql,/WHERE qid = \?/);
});
test('D1 random chooses an indexed seek, not an expensive full-table random sort',async()=>{
 const db=fixture([stored('Q42','real',5),stored('Q501','real',15)]);
 const cache=createD1PersonaCache(db,{randomIndex:()=>10});
 const value=await cache.random({kind:'real',language:'ja'});
 assert.equal(value.status,'ok');
 assert.equal(value.persona.qid,'Q501');
 assert.equal(value.source_mode,'d1_cache_fallback');
 assert.ok(db.statements.some(x=>/random_key >= \?/.test(x.sql)));
 assert.ok(db.statements.every(x=>!x.sql.includes('ORDER BY RANDOM()')));
});
test('D1 random excludes selected and blocked QIDs and wraps at the random-key boundary',async()=>{
 const db=fixture([stored('Q42','real',10),stored('Q501','real',15)]);
 const cache=createD1PersonaCache(db,{randomIndex:()=>100});
 const selected=await cache.random({kind:'real',exclude_qids:['Q42']},{blockedQids:[]});
 assert.equal(selected.persona.qid,'Q501');
 const none=await cache.random({kind:'real',exclude_qids:['Q42','Q501']});
 assert.equal(none.status,'no_match');
 const blocked=await cache.random({kind:'real',exclude_qids:['Q42']},{blockedQids:['Q501']});
 assert.equal(blocked.status,'no_match');
});
test('D1 cache rejects poisoned source URLs instead of forwarding them into roleplay',async()=>{
 const entry=stored();
 entry.sources_json=JSON.stringify([{url:'https://evil.example/secret',language:'ja',purpose:'article'},{url:'https://www.wikidata.org/wiki/Q42',language:'mul',purpose:'identity'}]);
 const cache=createD1PersonaCache(fixture([entry]));
 const value=await cache.get({qid:'Q42'});
 assert.equal(value.status,'not_found');
});
test('D1 writes validated live metadata with parameter binding, never article bodies',async()=>{
 const db=fixture([]);
 const cache=createD1PersonaCache(db,{randomIndex:()=>22,now:()=>Date.parse('2026-10-31T00:00:00Z')});
 const written=await cache.put({qid:'Q42',kind:'real',name:'ダグラス・アダムズ',description:'作家',sources});
 assert.equal(written,true);
 const stmt=db.statements[0];
 assert.match(stmt.sql,/INSERT INTO persona_cache/);
 assert.ok(stmt.sql.includes('ON CONFLICT'));
 assert.ok(stmt.args.includes('Q42'));
 assert.ok(stmt.args.some(x=>typeof x==='string'&&x.includes('https://en.wikipedia.org/wiki/Douglas_Adams')));
 assert.ok(!stmt.args.some(x=>typeof x==='string'&&x.includes('article_body')));
});
test('D1 schema uses bounded indexed lookup, no stored conversation or Wikipedia body',()=>{
 const sql=readFileSync(new URL('../migrations/0001_persona_cache.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS persona_cache/);
 assert.match(sql,/CREATE INDEX IF NOT EXISTS idx_persona_cache_kind_random/);
 assert.ok(!/\barticle_body\b|\bconversation\b/i.test(sql));
});

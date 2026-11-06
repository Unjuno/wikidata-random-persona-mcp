import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorker} from '../dist/server/index.js';
const worker=createWorker();
const base='https://random-persona-mcp.unjuno.chatgpt.site';
const get=(path,opts)=>worker.fetch(new Request(base+path,opts));
test('LP has Japanese copy, accessible controls, SEO and no missing references',async()=>{
 const response=await get('/'),html=await response.text();
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
 assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
 assert.match(html,/<html lang="ja">/);assert.match(html,/rel="canonical"/);assert.equal((html.match(/<h1 /g)||[]).length,1);
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 for(const [,anchor]of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.has(anchor),'Missing anchor '+anchor);
 for(const image of html.matchAll(/<img\b[^>]*>/g))assert.match(image[0],/\balt="/);
 const paths=new Set(html.match(/\/assets\/[a-z0-9.-]+/g));
 for(const path of paths){
  const asset=await get(path);assert.equal(asset.status,200,path);
  const bytes=new Uint8Array(await asset.arrayBuffer());
  assert.deepEqual(bytes,new Uint8Array(await readFile(new URL('../public'+path,import.meta.url))),path);
  assert.ok(bytes.length>0&&bytes.length<400000,path+' must be nonempty');
  if(path.endsWith('.webp')){assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');assert.equal(new TextDecoder().decode(bytes.slice(8,12)),'WEBP');}
 }
 assert.match(html,/MCP実データのプレビュー/);
 assert.match(html,/MCPで実際に人物を抽選/);
 assert.match(html,/id="persona-source"/);
 assert.match(html,/type="module" src="\/assets\/site.js"/);
 assert.doesNotMatch(html,/創作した5人/);
 assert.match(html,/一様抽選ではありません/);
 const previewAsset=await get('/assets/preview-state.js');
 assert.equal(previewAsset.status,200);
 assert.match(await previewAsset.text(),/transitionPreview/);
 const appAsset=await get('/assets/site.js');
 assert.equal(appAsset.status,200);
 const app=await appAsset.text();
 assert.match(app,/method:'tools\/call'/);
 assert.match(app,/readPersonaReference/);
 assert.doesNotMatch(app,/demoPeople/);
 assert.match(html,/300件は.*上限ではありません/);
});
test('static caching, HEAD, routing and security remain separate from JSON-RPC',async()=>{
 const a=await get('/assets/site.css');
 const b=await get('/assets/site.css',{headers:{'if-none-match':a.headers.get('etag')}});assert.equal(b.status,304);
 assert.equal((await get('/assets/site.css',{method:'HEAD'})).body,null);
 assert.equal((await get('/assets/absent.webp')).status,404);
 assert.equal((await get('/',{method:'POST'})).status,405);
 assert.equal((await get('/mcp')).status,405);
 const status=(await (await get('/healthz')).json());
 assert.equal(status.mode,'wikidata_live_with_catalog_fallback');
 assert.equal(status.entries,undefined,'unqualified entries is misleading');
 assert.equal(status.fallback_catalog.entries,300);
 assert.equal(status.sampling_method,'bounded_wdqs_offset');
 assert.equal((await get('/assets/site.css',{headers:{origin:'https://evil.example'}})).status,403);
});

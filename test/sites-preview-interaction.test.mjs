import test from 'node:test';
import assert from 'node:assert/strict';

test('website button calls the actual read-only MCP and differentiates server statuses',async()=>{
 const selectors=['#draw','#encounter-stage','#persona-card','#draw-status',
 '#demo-kind','#demo-name','#demo-line','#persona-source','#persona-qid',
 '#copy-prompt','#copy-status'];
 function element(){
  return {
   disabled:false,hidden:false,href:'',textContent:'',dataset:{},attributes:{},handlers:{},
   classList:{toggle(_name,_value){},add(){},remove(){}},
   setAttribute(name,value){this.attributes[name]=value;},
   addEventListener(name,handler){this.handlers[name]=handler;}
  };
 }
 const els=new Map(selectors.map(key=>[key,element()]));
 globalThis.document={querySelector(key){
  const found=els.get(key);if(!found)throw Error('No mock element '+key);return found;
 }};
 let mode='ok',requests=0;
 globalThis.fetch=async(path,options)=>{
  requests++;
  assert.equal(path,'/mcp');
  assert.equal(options.method,'POST');
  assert.equal(options.credentials,'omit');
  const req=JSON.parse(options.body);
  assert.equal(req.method,'tools/call');
  assert.equal(req.params.name,'random_persona');
  if(mode==='denied')return new Response(null,{status:401});
  if(mode==='throttled')return new Response(null,{status:429});
  if(mode==='fail')return new Response(null,{status:500});
  return Response.json({jsonrpc:'2.0',id:1,result:{structuredContent:{
   status:'ok',source_mode:'wikidata_live',
   persona:{qid:'Q42',name:'Douglas Adams',kind:'real',description:'British writer',
    sources:[{purpose:'article',url:'https://en.wikipedia.org/wiki/Douglas_Adams'}]}
  }}});
 };
 await import('../public/assets/site.js');
 const click=()=>els.get('#draw').handlers.click();
 assert.equal(els.get('#encounter-stage').dataset.previewState,'idle');
 await click();
 assert.equal(els.get('#encounter-stage').dataset.previewState,'reference_ready');
 assert.equal(els.get('#demo-name').textContent,'Douglas Adams');
 assert.equal(els.get('#persona-qid').textContent,'Q42');
 assert.equal(els.get('#persona-source').hidden,false);
 assert.equal(els.get('#persona-source').href,'https://en.wikipedia.org/wiki/Douglas_Adams');
 assert.match(els.get('#draw-status').textContent,/人格への切替は接続したAI側/);
 mode='denied';
 await click();
 assert.equal(els.get('#encounter-stage').dataset.previewState,'access_denied');
 assert.equal(els.get('#persona-source').hidden,true);
 mode='throttled';await click();
 assert.equal(els.get('#encounter-stage').dataset.previewState,'rate_limited');
 mode='fail';await click();
 assert.equal(els.get('#encounter-stage').dataset.previewState,'error');
 assert.equal(els.get('#draw').disabled,false);
 assert.equal(requests,4);
});

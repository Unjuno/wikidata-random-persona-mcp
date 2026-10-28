import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/catalog.json' with {type:'json'};
const knownQid=catalog.entries[0].qid;
const {createWorker} = await import('../dist/server/index.js');
// Existing protocol tests use a deterministic offline fixture; separate tests verify Wikidata-live preference.
const worker=createWorker({liveSource:{random:async()=>{throw Error('test upstream offline');},get:async()=>{throw Error('test upstream offline');}}});
const url = 'https://random-persona-mcp.unjuno.chatgpt.site/mcp';
const post = body => worker.fetch(new Request(url, {method:'POST',headers:{host:'random-persona-mcp.unjuno.chatgpt.site','content-type':'application/json'},body:JSON.stringify(body)}));
const rpc = (method, params = {}, id = 1) => ({jsonrpc:'2.0',method,params,id});

test('Sites MCP discovery and exactly two tools', async () => {
  const discover = await (await post(rpc('server/discover'))).json();
  assert.deepEqual(discover.result.supportedVersions, ['2026-07-28']);
  const listed = await (await post(rpc('tools/list'))).json();
  assert.deepEqual(listed.result.tools.map(tool => tool.name), ['random_persona','get_persona']);
});
test('Sites MCP calls real and fictional selection and QID lookup', async () => {
  for (const kind of ['real','fictional']) {
    const response = await post(rpc('tools/call', {name:'random_persona',arguments:{kind,language:'ja'}}));
    const result = (await response.json()).result.structuredContent;
    assert.equal(result.status, 'ok');
    assert.equal(result.persona.kind, kind);
    assert.ok(result.persona.sources.some(source => source.purpose === 'article'));
  }
  const found = await (await post(rpc('tools/call', {name:'get_persona',arguments:{qid:knownQid}}))).json();
  assert.equal(found.result.structuredContent.persona.qid, knownQid);
});
test('Sites MCP rejects malformed arguments and reports missing IDs', async () => {
  const invalid = await (await post(rpc('tools/call', {name:'get_persona',arguments:{qid:knownQid,url:'https://evil.example'}}))).json();
  assert.equal(invalid.result.isError, true);
  const absent = await (await post(rpc('tools/call', {name:'get_persona',arguments:{qid:'Q999999999'}}))).json();
  assert.equal(absent.result.structuredContent.status, 'not_found');
});
test('Sites edge guards host, origin, methods, content, and streamed body size', async () => {
  let response = await worker.fetch(new Request(url,{method:'POST',headers:{host:'evil.example','content-type':'application/json'},body:'{}'}));
  assert.equal(response.status,403);
  response = await worker.fetch(new Request(url,{method:'POST',headers:{host:'random-persona-mcp.unjuno.chatgpt.site',origin:'https://evil.example','content-type':'application/json'},body:'{}'}));
  assert.equal(response.status,403);
  response = await worker.fetch(new Request(url,{method:'POST',headers:{host:'random-persona-mcp.unjuno.chatgpt.site'},body:'{}'}));
  assert.equal(response.status,415);
  const body = new ReadableStream({start(controller){controller.enqueue(new Uint8Array(131073));controller.close();}});
  response = await worker.fetch(new Request(url,{method:'POST',headers:{host:'random-persona-mcp.unjuno.chatgpt.site','content-type':'application/json'},body,duplex:'half'}));
  assert.equal(response.status,413);
});

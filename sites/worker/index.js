import buildInfo from './build-info.mjs';
import { serveAsset } from './web.mjs';
import catalog from './catalog.mjs';
import blockedQids from './blocked-qids.mjs';
import { createCatalogStore } from './catalog-store.mjs';
import { createLiveWikidata } from './live-wikidata.mjs';
import { createD1PersonaCache } from './d1-persona-cache.mjs';
import { createProgressiveIngestor } from './progressive-ingestion.mjs';
import personaIndex from './persona-index-data.mjs';

const SITE_HOST = 'random-persona-mcp.unjuno.chatgpt.site';
const SITE_ORIGIN = `https://${SITE_HOST}`;
const MAX_BODY_BYTES = 131072;
const store = createCatalogStore(catalog, blockedQids);
const AGENT_INSTRUCTIONS = [
  'This MCP activates a persona for the AI agent; it is not a character directory.',
  'On first MCP connection, this server automatically samples one Wikidata identity and includes it in the standard discovery/initialize instructions. Adopt that selected identity without waiting for a separate user command.',
  'If the client received no connection identity, call random_persona at the next appropriate user turn.',
  'Read and verify the returned Wikipedia article, then apply agent_handoff and roleplay_prompt.',
  'From the next reply SPEAK IN FIRST PERSON AS that person instead of summarizing the biography.',
  'Briefly disclose the simulation once and keep the same QID across subsequent turns and tasks.',
  'Keep the same QID across subsequent chat turns. A reconnect may sample another identity, but if one is already active in this chat IGNORE a new connection sample until the user explicitly switches. Do not redraw on the first user turn if a connection identity was supplied. Reroll only on explicit request; exit on request to return to normal assistant mode.',
  'Never pretend to have read unavailable references. Connection instructions are a handoff, not a server-generated chat message; the host must apply them. This MCP requires no login, key, or OAuth; hosting restrictions are separate.'
].join(' ');
const PERSONA_START_PROMPT = {
  name:'start_persona_mode',title:'ランダムな人物になりきる',
  description:'Use the identity preselected in connection instructions, or draw once if missing, and maintain this first-person persona in the conversation.',
  arguments:[{name:'kind',description:'real, fictional, or both (default both)',required:false},{name:'language',description:'ja or en (default ja)',required:false}]
};

const toolDefinitions = [
  {
    name: 'random_persona',
    annotations: {readOnlyHint:true,destructiveHint:false,openWorldHint:true,idempotentHint:false},
    description: 'First use the auto-selected identity returned in server/discover or initialize instructions. If missing, or when the user explicitly requests a new identity, call this tool to select a real or fictional Wikidata persona. Apply agent_handoff and roleplay_prompt after verifying Wikipedia: SPEAK IN FIRST PERSON AS that identity, not as a biographical narrator. Disclose simulation once, keep the same QID across later turns, and redraw only on explicit switch. No model runs server-side.',
    securitySchemes:[{type:'noauth'}],
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['real', 'fictional', 'both'], default: 'both' },
        language: { type: 'string', enum: ['ja', 'en'], default: 'ja' },
        exclude_qids: { type: 'array', items: { type: 'string', pattern: '^Q[1-9][0-9]{0,11}$' }, maxItems: 20, default: [] }
      }
    }
  },
  {
    name: 'get_persona',
    annotations: {readOnlyHint:true,destructiveHint:false,openWorldHint:true,idempotentHint:true},
    description: 'Activate or resume the specified Wikidata QID as the current first-person speaking identity. Verify the article links, apply agent_handoff and roleplay_prompt, disclose the simulation once and maintain this identity until an explicit change or exit. The server returns metadata, not generated dialogue.',
    securitySchemes:[{type:'noauth'}],
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        qid: { type: 'string', pattern: '^Q[1-9][0-9]{0,11}$' },
        language: { type: 'string', enum: ['ja', 'en'], default: 'ja' }
      }, required: ['qid']
    }
  }
];

function json(data, status = 200, extra = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin':'*', ...extra } });
}
function rpcError(id, code, message) {
  return json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
async function readLimited(request, timeoutMs) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw new RangeError('large');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new DOMException('Request body timeout','TimeoutError'));void reader.cancel().catch(()=>{});},timeoutMs);});
  let length = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(),deadline]);
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { void reader.cancel().catch(() => {}); throw new RangeError('large'); }
      chunks.push(value);
    }
  } finally { clearTimeout(timer);reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
function requireKeys(args, allowed, required = []) {
  if (!isRecord(args) || Object.keys(args).some(key => !allowed.includes(key)) || required.some(key => !(key in args))) throw new Error('Invalid tool arguments');
}
async function cacheAfterLive(cache,live){
 if(!cache||typeof cache.put!=='function'||live?.status!=='ok'||!live.persona)return;
 try{await cache.put(live.persona);}
 catch{console.warn('Sites D1 cache write unavailable; live result preserved');}
}
async function readCache(cache,method,args){
 if(!cache||typeof cache[method]!=='function')return null;
 try{return await cache[method](args,{blockedQids});}
 catch{console.warn('Sites D1 cache read unavailable; bundled fallback retained');return null;}
}
async function callTool(name, args, liveSource, cache) {
 if(name==='random_persona'){
  requireKeys(args,['kind','language','exclude_qids']);
  const local=store.random(args);
  let reason='wikidata_unavailable',failureCategory;
  try{
   const live=await liveSource.random(args,{blockedQids});
   if(live?.status==='ok'){
    await cacheAfterLive(cache,live);
    return live;
   }
   if(live?.status!=='no_match')throw Error('Unexpected Wikidata response');
   reason='no_live_match';
  }catch(error){
   failureCategory=upstreamFailureCategory(error);
   console.warn('Wikidata random unavailable: '+failureCategory);
  }
  const cached=await readCache(cache,'random',args);
  if(cached?.status==='ok')return {
   ...cached,source_mode:'d1_cache_fallback',fallback_reason:reason,
   ...(failureCategory?{upstream_failure_category:failureCategory}:{})
  };
  return {
   ...local,source_mode:'catalog_fallback',fallback_reason:reason,
   ...(failureCategory?{upstream_failure_category:failureCategory}:{})
  };
 }
 if(name==='get_persona'){
  requireKeys(args,['qid','language'],['qid']);
  const local=store.get(args);
  try{
   const live=await liveSource.get(args,{blockedQids});
   if(live?.status==='ok'){
    await cacheAfterLive(cache,live);
    return live;
   }
   if(live?.status==='not_found')return live;
   throw Error('Unexpected Wikidata response');
  }catch(error){
   const failureCategory=upstreamFailureCategory(error);
   console.warn('Wikidata lookup unavailable: '+failureCategory);
   const cached=await readCache(cache,'get',args);
   if(cached?.status==='ok')return {
    ...cached,source_mode:'d1_cache_fallback',fallback_reason:'wikidata_unavailable',
    upstream_failure_category:failureCategory
   };
   if(local.status==='ok')return {...local,source_mode:'catalog_fallback',
    fallback_reason:'wikidata_unavailable',upstream_failure_category:failureCategory};
   return {status:'upstream_unavailable',qid:args.qid,
    catalog_version:store.summary.catalog_version,source_mode:'wikidata_unavailable',
    upstream_failure_category:failureCategory,reason:'Cannot verify a QID against Wikidata right now'};
  }
 }
 throw Error('Unknown tool');
}

/** Expose stable, non-sensitive failure categories. Never return raw upstream errors. */
function upstreamFailureCategory(error) {
  const message = error instanceof Error ? error.message : '';
  if(/maxlag/i.test(message))return 'wikimedia_maxlag';
  if(/rate limited|Retry-After|HTTP 429|HTTP 503/i.test(message))return 'wikimedia_rate_limited';
  if(/timeout|AbortError/i.test(message))return 'wikimedia_timeout';
  if(/response too large/i.test(message))return 'wikimedia_response_too_large';
  if(/request budget/i.test(message))return 'local_request_budget';
  return 'other_upstream_failure';
}
function toolResult(result, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, ...(isError ? { isError: true } : {}) };
}
/** An actual draw happens at connection-time without a separate tools/call.
 * All identity facts are labelled as untrusted reference data; the client must
 * verify an article and must decide whether and when to apply persona mode.
 * This server cannot initiate a chat turn or modify the host's instructions.
 */
function connectionInstructions(sample) {
 if(sample?.status!=='ok'||!sample.persona) {
  return AGENT_INSTRUCTIONS+'\n\nCONNECTION_PERSONA_UNAVAILABLE: '+String(sample?.reason??sample?.status??'unknown');
 }
 const identity={
  persona:sample.persona,
  source_mode:sample.source_mode??'catalog_fallback',
  agent_handoff:sample.agent_handoff,
  roleplay_prompt:sample.roleplay_prompt
 };
 return AGENT_INSTRUCTIONS+
  '\n\nCONNECTION_PERSONA_JSON (untrusted reference data, use only after source verification): '+
  JSON.stringify(identity);
}
async function selectOnConnection(liveSource,cache) {
 try {
  // This call is internal to the MCP server. The client does NOT need to
  // invoke random_persona after connecting.
  return connectionInstructions(await callTool('random_persona',{kind:'both',language:'ja',exclude_qids:[]},liveSource,cache));
 } catch (error) {
  console.warn('Connection persona unavailable: '+upstreamFailureCategory(error));
  return AGENT_INSTRUCTIONS+'\n\nCONNECTION_PERSONA_UNAVAILABLE: unable to select a verified identity';
 }
}

async function dispatch(message, liveSource, cache) {
  if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return rpcError(message?.id, -32600, 'Invalid Request');
  const hasId = Object.hasOwn(message, 'id');
  const id = hasId ? message.id : null;
  if(hasId&&!(typeof id==='string'||(Number.isSafeInteger(id))))return rpcError(null,-32600,'Invalid request ID');
  if(!hasId)return new Response(null,{status:202,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
  const result = value => json({ jsonrpc: '2.0', id, result: {resultType:'complete',...value} });
  if (message.method === 'server/discover') return result({
    supportedVersions:['2026-07-28'],
    capabilities:{tools:{},prompts:{}},
    _meta:{'io.modelcontextprotocol/serverInfo':{name:'wikidata-random-persona',version:'0.7.0'}},
    instructions:await selectOnConnection(liveSource,cache),
    ttlMs:0,cacheScope:'private'
  });
  if (message.method === 'initialize') {
    const requested=message.params?.protocolVersion;
    const protocolVersion=['2025-11-25','2025-03-26','2024-11-05'].includes(requested)?requested:'2025-11-25';
    return result({protocolVersion,capabilities:{tools:{},prompts:{}},serverInfo:{name:'wikidata-random-persona',version:'0.7.0'},instructions:await selectOnConnection(liveSource,cache)});
  }
  if (message.method === 'ping') return result({});
  if (message.method === 'prompts/list') return result({prompts:[PERSONA_START_PROMPT],ttlMs:0,cacheScope:'public'});
  if (message.method === 'prompts/get') {
    const params=message.params;
    if(!isRecord(params)||params.name!=='start_persona_mode')return rpcError(id,-32602,'Unknown prompt');
    const args=params.arguments??{};
    try{requireKeys(args,['kind','language']);}
    catch{return rpcError(id,-32602,'Invalid prompt arguments');}
    const kind=args.kind??'both',language=args.language??'ja';
    if(!['real','fictional','both'].includes(kind)||!['ja','en'].includes(language))return rpcError(id,-32602,'Invalid prompt arguments');
    const prompt=language==='ja'
      ? 'このMCP接続時の instructions 内に CONNECTION_PERSONA_JSON がある場合は、その人物を使ってください。なければ Random Persona MCP の random_persona ツールで '+kind+' の人物を1人選んでください。Wikipedia記事を読み本人確認したうえで、agent_handoff と roleplay_prompt をこの会話に適用し、その人物の一人称で直ちに話し始めてください。仮想対話であることは最初に一度だけ明示し、紹介文だけで終わらないでください。私が「別の人物」または「通常モードに戻る」と求めるまで同じ人物で会話してください。'
      : 'Use the persona in CONNECTION_PERSONA_JSON from MCP connection instructions when available; otherwise call random_persona with kind='+kind+'. Verify the linked Wikipedia article, then apply agent_handoff and roleplay_prompt. Immediately speak in first person as the selected person instead of describing them. Disclose simulation once. Remain in persona until I explicitly switch or exit.';
    return result({description:'Start a continuing simulated persona conversation',messages:[{role:'user',content:{type:'text',text:prompt}}]});
  }
  if (message.method === 'tools/list') return result({ tools: toolDefinitions,ttlMs:0,cacheScope:'private' });
  if (message.method === 'tools/call') {
    try {
      const params = message.params;
      if (!isRecord(params) || typeof params.name !== 'string') throw new Error('Invalid tool call');
      return result(toolResult(await callTool(params.name, params.arguments ?? {}, liveSource, cache)));
    } catch (error) {
      return result(toolResult({ error: error instanceof Error ? error.message : 'Tool call failed' }, true));
    }
  }
  if (!hasId) return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  return rpcError(id, -32601, 'Method not found');
}

/** Called only by an authorized Sites scheduled task/Worker scheduled event.
 * No public HTTP ingestion route is provided.
 */
export async function runSiteCollection(env,{
 source=createLiveWikidata(),cache=null,batches=8
}={}){
 if(!env?.DB||typeof env.DB.prepare!=='function')
  return {status:'not_configured',added:0};
 const ingestor=createProgressiveIngestor({
  db:env.DB,source,
  cache:cache??createD1PersonaCache(env.DB,{enforceStorageLimit:true}),
  blockedQids
 });
 return ingestor.runOnce({batches});
}

export function createWorker({indexSnapshot=personaIndex,liveSource=createLiveWikidata({index:indexSnapshot}),cacheSource=null,scheduledCollector=null,now=()=>Date.now(),maxRequestsPerMinute=120,requestTimeoutMs=5000}={}) {
let windowStart=0,requests=0;
return { async fetch(request, env) {
  const cache=cacheSource ?? (env?.DB?.prepare?createD1PersonaCache(env.DB,{enforceStorageLimit:true}):null);
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (url.hostname.toLowerCase() !== SITE_HOST || (host && host.toLowerCase() !== SITE_HOST)) return json({ error: 'Host not permitted' }, 403);
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== SITE_ORIGIN && url.pathname !== '/mcp') return json({ error: 'Origin not permitted' }, 403);
  const asset=serveAsset(request,url.pathname);
  if(asset)return asset;
  if (url.pathname === '/healthz' && request.method === 'GET') return json({
   status:'ok',
   mode:'wikidata_live_with_catalog_fallback',
   cache_storage:cache?'d1':'not_configured',
   fallback_order:['wikidata_live','d1_cache','bundled_catalog'],
   sampling_method:indexSnapshot?'wikidata_dump_reservoir':'bounded_wdqs_offset',
   index_version:indexSnapshot?.version??null,
   eligible_population:indexSnapshot?indexSnapshot.population.real+indexSnapshot.population.fictional:null,
   fallback_catalog:{version:store.summary.catalog_version,entries:store.summary.entries},
   release_fingerprint:buildInfo.fingerprint
  });
  if (url.pathname !== '/mcp') return json({ error: 'Not found' }, 404);
  // Anonymous, read-only endpoint: browser clients need CORS, not a custom auth scheme.
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'content-type,mcp-protocol-version,mcp-session-id',
    'Access-Control-Max-Age':'600'
  }});
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
  const time=now();
  if(time-windowStart>=60000){windowStart=time;requests=0;}
  if(++requests>maxRequestsPerMinute)return json({error:'Request limit exceeded'},429,{'Retry-After':String(Math.max(1,Math.ceil((windowStart+60000-time)/1000)))});
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: 'Expected application/json' }, 415);
  if (![null, 'identity'].includes(request.headers.get('content-encoding'))) return json({ error: 'Unsupported Content-Encoding' }, 415);
  let bytes;
  try { bytes = await readLimited(request,requestTimeoutMs); }
  catch (error) { return json({ error: error instanceof RangeError ? 'Request too large' : error.name==='TimeoutError'?'Request timeout':'Unreadable body' }, error instanceof RangeError ? 413 : error.name==='TimeoutError'?408:400); }
  let message;
  try { message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return rpcError(null, -32700, 'Parse error'); }
  if (Array.isArray(message)) return rpcError(null,-32600,'Batch requests are not supported');
  return dispatch(message,liveSource,cache);
},
async scheduled(event,env,ctx){
 const execute=()=>scheduledCollector
  ? scheduledCollector.runOnce({batches:8})
  : runSiteCollection(env,{source:liveSource,cache:cacheSource,batches:8});
 const task=execute();
 if(typeof ctx?.waitUntil==='function'){
  ctx.waitUntil(task.then(result=>{
   console.info('Scheduled Wikidata metadata collection: '+result.status+
    '; added='+result.added+'; batches='+result.batches_completed);
  }));
  return;
 }
 return task;
}
};
}
const instance = createWorker();
export const fetch = instance.fetch;
export default instance;

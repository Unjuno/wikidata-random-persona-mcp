import buildInfo from './build-info.mjs';
import { serveAsset } from './web.mjs';
import catalog from './catalog.mjs';
import blockedQids from './blocked-qids.mjs';
import { createCatalogStore } from './catalog-store.mjs';
import { createLiveWikidata } from './live-wikidata.mjs';
import personaIndex from './persona-index-data.mjs';

const SITE_HOST = 'random-persona-mcp.unjuno.chatgpt.site';
const SITE_ORIGIN = `https://${SITE_HOST}`;
const MAX_BODY_BYTES = 131072;
const store = createCatalogStore(catalog, blockedQids);

const toolDefinitions = [
  {
    name: 'random_persona',
    annotations: {readOnlyHint:true,destructiveHint:false,openWorldHint:true,idempotentHint:false},
    description: 'Use when the user asks to talk with a random person/character or asks for a different one. Select a live Wikidata identity; when Wikidata is unavailable, fall back to the reviewed catalog with an explicit source_mode. Return reference links; then use your available browser to read the first Wikipedia article before beginning. If read, disclose that dialogue is simulated, separate sourced facts from interpretation and invented dialogue, and keep this QID for the rest of the chat. Never claim to have read an unavailable source. On “another person,” call again and exclude recent QIDs. This tool does not generate a persona.',
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
    description: 'Retrieve up-to-date structured metadata and article links for any eligible Wikidata QID. On Wikimedia outage, a known QID may use the catalog as explicitly labeled fallback. Use your available browser to read the article before simulating dialogue. Disclose simulation, distinguish sourced facts from interpretation and invention, and never claim to have read an unavailable source. Does not retrieve arbitrary URLs or article text.',
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
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
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
async function callTool(name, args, liveSource) {
  if (name === 'random_persona') {
    requireKeys(args, ['kind', 'language', 'exclude_qids']);
    // Validate before network. Keep a real random fallback, not a hard-coded index.
    const local = store.random(args);
    try {
      const live = await liveSource.random(args, {blockedQids});
      if (live?.status === 'ok') return live;
      return {...local, source_mode: 'catalog_fallback', fallback_reason:'no_live_match'};
    } catch (error) {
      console.warn('Wikidata random unavailable:',String(error?.message??'unknown').slice(0,180));
      return {...local, source_mode: 'catalog_fallback', fallback_reason:'wikidata_unavailable'};
    }
  }
  if (name === 'get_persona') {
    requireKeys(args, ['qid', 'language'], ['qid']);
    // This call also validates QID/language and observes the independent block list.
    const local = store.get(args);
    try {
      const live = await liveSource.get(args, {blockedQids});
      if (live?.status === 'ok' || live?.status === 'not_found') return live;
      throw Error('Unexpected Wikidata response');
    } catch (error) {
      console.warn('Wikidata lookup unavailable:',String(error?.message??'unknown').slice(0,180));
      if (local.status === 'ok') return {...local, source_mode:'catalog_fallback', fallback_reason:'wikidata_unavailable'};
      return {status:'upstream_unavailable', qid:args.qid, catalog_version:store.summary.catalog_version,
        source_mode:'wikidata_unavailable', reason:'Cannot verify a QID against Wikidata right now'};
    }
  }
  throw new Error('Unknown tool');
}

function toolResult(result, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, ...(isError ? { isError: true } : {}) };
}
async function dispatch(message, liveSource) {
  if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return rpcError(message?.id, -32600, 'Invalid Request');
  const hasId = Object.hasOwn(message, 'id');
  const id = hasId ? message.id : null;
  if(hasId&&!(typeof id==='string'||(Number.isSafeInteger(id))))return rpcError(null,-32600,'Invalid request ID');
  if(!hasId)return new Response(null,{status:202,headers:{'Cache-Control':'no-store'}});
  const result = value => json({ jsonrpc: '2.0', id, result: {resultType:'complete',...value} });
  if (message.method === 'server/discover') return result({ supportedVersions: ['2026-07-28'], capabilities: { tools: {} } });
  if (message.method === 'initialize') {
    const requested=message.params?.protocolVersion;
    const protocolVersion=['2025-11-25','2025-03-26','2024-11-05'].includes(requested)?requested:'2025-11-25';
    return result({protocolVersion,capabilities:{tools:{}},serverInfo:{name:'wikidata-random-persona',version:'0.5.0'}});
  }
  if (message.method === 'ping') return result({});
  if (message.method === 'tools/list') return result({ tools: toolDefinitions,ttlMs:0,cacheScope:'private' });
  if (message.method === 'tools/call') {
    try {
      const params = message.params;
      if (!isRecord(params) || typeof params.name !== 'string') throw new Error('Invalid tool call');
      return result(toolResult(await callTool(params.name, params.arguments ?? {}, liveSource)));
    } catch (error) {
      return result(toolResult({ error: error instanceof Error ? error.message : 'Tool call failed' }, true));
    }
  }
  if (!hasId) return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  return rpcError(id, -32601, 'Method not found');
}

export function createWorker({indexSnapshot=personaIndex,liveSource=createLiveWikidata({index:indexSnapshot}),now=()=>Date.now(),maxRequestsPerMinute=120,requestTimeoutMs=5000}={}) {
let windowStart=0,requests=0;
return { async fetch(request) {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (url.hostname.toLowerCase() !== SITE_HOST || (host && host.toLowerCase() !== SITE_HOST)) return json({ error: 'Host not permitted' }, 403);
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== SITE_ORIGIN) return json({ error: 'Origin not permitted' }, 403);
  const asset=serveAsset(request,url.pathname);
  if(asset)return asset;
  if (url.pathname === '/healthz' && request.method === 'GET') return json({
   status:'ok',
   mode:'wikidata_live_with_catalog_fallback',
   sampling_method:indexSnapshot?'wikidata_dump_reservoir':'bounded_wdqs_offset',
   index_version:indexSnapshot?.version??null,
   eligible_population:indexSnapshot?indexSnapshot.population.real+indexSnapshot.population.fictional:null,
   fallback_catalog:{version:store.summary.catalog_version,entries:store.summary.entries},
   release_fingerprint:buildInfo.fingerprint
  });
  if (url.pathname !== '/mcp') return json({ error: 'Not found' }, 404);
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
  return dispatch(message,liveSource);
}};
}
const instance = createWorker();
export const fetch = instance.fetch;
export default instance;

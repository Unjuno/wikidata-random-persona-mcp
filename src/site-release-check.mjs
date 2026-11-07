/** Public, side-effect-free release acceptance probe for the EXISTING ChatGPT Site.
 * Separate source CI from actual deployed bits and platform-managed access.
 * No credentials, private endpoints, or deployment mutations.
 */
export const SITE_ORIGIN='https://random-persona-mcp.unjuno.chatgpt.site';
export const PREVIEW_MARKER='data-preview-implementation="real-mcp-v1"';
const HASH=/^[a-f0-9]{64}$/;
const QID=/^Q[1-9][0-9]{0,11}$/;
const CONNECTION_MARKER='CONNECTION_PERSONA_JSON (untrusted reference data, use only after source verification): ';
const validQid=value=>typeof value==='string'&&QID.exec(value)?.[0]===value;
async function probe(fetchImpl,path,init={}){
 const url=SITE_ORIGIN+path;
 try{
  const response=await fetchImpl(url,{
   method:init.method??'GET',
   headers:{Accept:'application/json',...init.headers},
   ...(init.body===undefined?{}:{body:init.body}),
   cache:'no-store',
   signal:AbortSignal.timeout(10000)
  });
  const text=await response.text();
  return {status:response.status,text};
 }catch(error){
  return {status:null,error:error instanceof Error?error.name:'unknown_error',text:''};
 }
}
const verdict=(status,reason)=>Object.freeze({status,reason});
function parseJSON(text){
 try{return JSON.parse(text);}
 catch{return null;}
}
/** Verify public deployment freshness and anonymous protocol reachability.
 * A successful ping is NOT evidence that ChatGPT can install/share the plugin
 * or adopt a persona; those require separate real-host tests.
 */
export async function verifyPublishedSite({expectedFingerprint,fetchImpl=fetch}={}){
 if(typeof expectedFingerprint!=='string'||!HASH.test(expectedFingerprint))
  throw new TypeError('Expected current build SHA-256 fingerprint');
 if(typeof fetchImpl!=='function')throw new TypeError('fetchImpl required');
 const [health,page,ping,discovery]=await Promise.all([
  probe(fetchImpl,'/healthz'),
  probe(fetchImpl,'/'),
  probe(fetchImpl,'/mcp',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'ping'})
  }),
  probe(fetchImpl,'/mcp',{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:2,method:'server/discover'})
  })
 ]);
 const state=parseJSON(health.text);
 const deployedFingerprint=typeof state?.release_fingerprint==='string'
  ?state.release_fingerprint:null;
 const hasCurrentHTML=page.status===200&&page.text.includes(PREVIEW_MARKER);
 let deployment;
 if(health.status===null||page.status===null||
    [401,403].includes(health.status)||[401,403].includes(page.status)){
  deployment=verdict('UNCERTAIN','public_site_inaccessible');
 }else if(health.status!==200||page.status!==200||
     state?.status!=='ok'||!deployedFingerprint){
  deployment=verdict('FAIL','public_site_unhealthy');
 }else if(deployedFingerprint!==expectedFingerprint){
  deployment=verdict('FAIL','stale_worker_fingerprint');
 }else if(!hasCurrentHTML){
  deployment=verdict('FAIL','stale_or_mismatched_landing_page');
 }else{
  deployment=verdict('PASS','worker_and_landing_page_match_build');
 }
 const rpc=parseJSON(ping.text);
 let anonymous;
 if([401,403].includes(ping.status)){
  anonymous=verdict('FAIL','anonymous_mcp_access_denied');
 }else if(ping.status===200&&rpc?.jsonrpc==='2.0'&&
    rpc.id===1&&rpc.result&&typeof rpc.result==='object'){
  anonymous=verdict('PASS','anonymous_ping_succeeded');
 }else if(ping.status===null){
  anonymous=verdict('UNCERTAIN','mcp_unreachable');
 }else{
  anonymous=verdict('FAIL','unexpected_anonymous_mcp_response');
 }
 const discovered=parseJSON(discovery.text);
 const handoff=discovered?.result;
 const instructions=typeof handoff?.instructions==='string'?handoff.instructions:'';
 let connection;
 let selectedQid=null,sourceMode=null;
 if([401,403].includes(discovery.status)){
  connection=verdict('FAIL','anonymous_discovery_access_denied');
 }else if(discovery.status===null){
  connection=verdict('UNCERTAIN','discovery_unreachable');
 }else if(discovery.status!==200||discovered?.jsonrpc!=='2.0'||discovered.id!==2){
  connection=verdict('FAIL','unexpected_discovery_response');
 }else if(instructions.includes('CONNECTION_PERSONA_UNAVAILABLE')){
  connection=verdict('UNCERTAIN','connection_selection_unavailable');
 }else{
  try{
   const markerIndex=instructions.indexOf(CONNECTION_MARKER);
   if(markerIndex<0)throw Error('No persona handoff marker');
   const data=JSON.parse(instructions.slice(markerIndex+CONNECTION_MARKER.length));
   const p=data.persona;
   if(!validQid(p?.qid)||typeof p.name!=='string'||!p.name.trim()||
      !['real','fictional'].includes(p.kind)||
      !Array.isArray(p.sources)||!p.sources.some(x=>x?.purpose==='article')||
      data.agent_handoff?.subject_qid!==p.qid||
      data.agent_handoff?.state_machine?.phase!=='awaiting_verification'||
      !['wikidata_live','d1_cache_fallback','catalog_fallback'].includes(data.source_mode)||
      handoff.ttlMs!==0||handoff.cacheScope!=='private'){
    throw Error('Invalid connection persona contract');
   }
   selectedQid=p.qid;
   sourceMode=data.source_mode;
   connection=verdict('PASS','initial_connection_has_unverified_persona_handoff');
  }catch{
   connection=verdict('FAIL','missing_or_invalid_connection_handoff');
  }
 }
 return Object.freeze({
  site:SITE_ORIGIN,
  expected_fingerprint:expectedFingerprint,
  published_fingerprint:deployedFingerprint,
  published_preview_marker:hasCurrentHTML,
  deployment,
  anonymous_mcp:{...anonymous,http_status:ping.status},
  connection_persona:{...connection,http_status:discovery.status,
   selected_qid:selectedQid,source_mode:sourceMode},
  host_persona:verdict('UNCERTAIN','requires_real_chatgpt_client_and_five_turn_test')
 });
}

/** URL-only MCP tools. Raw SDK handler must be mounted behind src/http.mjs guards. */
import {McpServer,createMcpHandler} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import catalog from '../data/catalog.json' with {type:'json'};
import blocked from '../data/blocked-qids.json' with {type:'json'};
import {createCatalogStore} from './catalog-store.mjs';
import {MAX_BODY_BYTES} from './http.mjs';
const qid=z.string().regex(/^Q[1-9][0-9]{0,11}$/);
const language=z.enum(['ja','en']).default('ja');
const wrap=data=>({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data});
function serverFor(store){
 const server=new McpServer({name:'wikidata-random-persona',version:'0.2.0'});
 server.registerTool('random_persona',{
  description:'Select one real person or fictional character from a reviewed URL catalog. Returns identity, sources and shared browsing guidance, not a generated persona. The caller must fetch sources before simulating dialogue.',
  inputSchema:z.strictObject({kind:z.enum(['real','fictional','both']).default('both'),language,exclude_qids:z.array(qid).max(20).default([])}),
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:false}
 },async params=>wrap(store.random(params)));
 server.registerTool('get_persona',{
  description:'Return stored reference links for a cataloged QID. Suspended/missing identities return not_found. Never fetches arbitrary URLs or article text.',
  inputSchema:z.strictObject({qid,language}),
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async params=>wrap(store.get(params)));
 return server;
}
export function createPersonaServer(data=catalog,blockedQids=blocked){return serverFor(createCatalogStore(data,blockedQids));}
export function createPersonaHandler(data=catalog,blockedQids=blocked){
 const store=createCatalogStore(data,blockedQids);
 return {mcp:createMcpHandler(()=>serverFor(store),{responseMode:'json',maxRequestBodySize:MAX_BODY_BYTES}),summary:store.summary};
}
// Kept for integrations that explicitly provide their own security boundary.
export const {mcp:handler}=createPersonaHandler();
export default handler;

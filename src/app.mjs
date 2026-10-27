/** Mount this Fetch-compatible application in Sites; supply the actual site's hosts. */
import {createPersonaHandler} from './mcp.mjs';
import {createHttpApp} from './http.mjs';
export function createApp({allowedHosts,allowedOrigins=[],catalog,blockedQids}={}){
 const {mcp,summary}=createPersonaHandler(catalog,blockedQids);
 return createHttpApp({mcp,summary,allowedHosts,allowedOrigins});
}

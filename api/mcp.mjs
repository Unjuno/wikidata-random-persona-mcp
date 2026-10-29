/** Anonymous, standard MCP endpoint on an independent public host.
 * The ChatGPT Sites landing page is not deployed here.
 */
import {createPublicMcpApp} from '../src/public-mcp.mjs';

const domains=[
 'localhost','127.0.0.1',
 ...(process.env.PUBLIC_MCP_HOSTS??'random-persona-open-mcp.vercel.app').split(','),
 process.env.VERCEL_URL,
 process.env.VERCEL_PROJECT_PRODUCTION_URL
].filter(Boolean).map(x=>x.trim().toLowerCase());
const origins=(process.env.PUBLIC_MCP_ORIGINS??'https://chatgpt.com,https://claude.ai,https://claude.com')
 .split(',').map(x=>x.trim()).filter(Boolean);
export const publicApp=createPublicMcpApp({allowedHosts:[...new Set(domains)],
 allowedOrigins:origins,maxCallsPerMinute:60});

/** The Vercel rewrite maps /mcp to /api/mcp; normalize internally. */
export function routeRequest(request,pathname){
 const url=new URL(request.url);
 url.pathname=pathname;
 url.search='';
 const options={method:request.method,headers:request.headers,signal:request.signal};
 if(!['GET','HEAD'].includes(request.method)&&request.body){
  options.body=request.body;
  options.duplex='half';
 }
 return new Request(url,options);
}
export default {fetch(request){
 return publicApp.fetch(routeRequest(request,'/mcp'));
}};

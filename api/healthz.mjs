/** Public, unauthenticated health probe. No account or token required. */
import {publicApp,routeRequest} from './mcp.mjs';
export default {fetch(request){
 return publicApp.fetch(routeRequest(request,'/healthz'));
}};

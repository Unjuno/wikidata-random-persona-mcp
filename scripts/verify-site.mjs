/** Operator-side verification for the existing ChatGPT Site.
 * npm run verify:site rebuilds dist before loading this module.
 * Exit nonzero if the published Site is stale or anonymous MCP access fails.
 * Does not publish, authenticate, or change any Site configuration.
 */
import buildInfo from '../dist/server/build-info.mjs';
import {verifyPublishedSite} from '../src/site-release-check.mjs';

const report=await verifyPublishedSite({expectedFingerprint:buildInfo.fingerprint});
console.log(JSON.stringify(report,null,2));
if(report.deployment.status!=='PASS'||report.anonymous_mcp.status!=='PASS'){
 console.error('Site release is NOT fully accepted. Publish the EXISTING Site and investigate public access; never bypass platform restrictions.');
 process.exitCode=1;
}

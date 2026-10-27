/** Optional Node adapter. Sites should mount createApp().fetch in its actual runtime. */
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {toNodeHandler} from '@modelcontextprotocol/node';
import {createApp} from './app.mjs';
import {MAX_BODY_BYTES} from './http.mjs';
export function createNodeApp(options={}){
 const app=createApp(options);
 const handle=toNodeHandler(app,{maxRequestBodySize:MAX_BODY_BYTES});
 const server=createServer((req,res)=>{void handle(req,res).catch(()=>{
  if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end('{"error":"Internal error"}');
 });});
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 return {server,async close(){
  server.closeIdleConnections();
  const closing=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await closing;await app.close();
 }};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const port=Number(process.env.PORT??3000);const host=process.env.HOST??'127.0.0.1';
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid PORT');
 const split=s=>s.split(',').map(x=>x.trim()).filter(Boolean);
 const {server,close}=createNodeApp({allowedHosts:split(process.env.ALLOWED_HOSTS??'127.0.0.1,localhost'),allowedOrigins:split(process.env.ALLOWED_ORIGINS??'')});
 server.listen(port,host,()=>console.error(`MCP listening on http://${host}:${server.address().port}/mcp`));
 process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
}

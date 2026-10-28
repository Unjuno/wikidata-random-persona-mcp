// Static LP preview only; production always uses sites/worker/index.js.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(import.meta.dirname,'../public');
const portIndex=process.argv.indexOf('--port');
const previewPort=Number(process.env.PORT??(portIndex<0?3000:process.argv[portIndex+1]));
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml'};
createServer(async(req,res)=>{
 try{
  if(req.url==='/__qa/mobile'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html><head><title>Mobile 390 × 844 QA</title></head><body style="margin:0;background:#25283a;display:flex;justify-content:center"><iframe title="390px mobile viewport" src="/" style="border:0;width:390px;height:844px"></iframe></body></html>');return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+'/'))throw Error('Invalid path');
  const body=await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(previewPort,'0.0.0.0');

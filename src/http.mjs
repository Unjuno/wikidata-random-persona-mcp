/** Framework-neutral deployment boundary. Does not fetch sources or authenticate users. */
export const MAX_BODY_BYTES=131072;
function reply(status,error,headers={}) {return Response.json({error},{status,headers:{'Cache-Control':'no-store',...headers}});}
export async function readBoundedBody(request,maxBytes=MAX_BODY_BYTES) {
  const header=request.headers.get('content-length');
  if(header!==null && (!/^\d+$/.test(header)||Number(header)>maxBytes)) throw Object.assign(Error('Request too large'),{status:413});
  if(!request.body) return new Uint8Array();
  const reader=request.body.getReader();const chunks=[];let length=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
      if(length>maxBytes){void reader.cancel().catch(()=>{});throw Object.assign(Error('Request too large'),{status:413});}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export function createHttpApp({mcp,summary,allowedHosts=['localhost','127.0.0.1'],allowedOrigins=[],maxBodyBytes=MAX_BODY_BYTES}) {
  if(!Number.isSafeInteger(maxBodyBytes)||maxBodyBytes<1)throw Error('Invalid body limit');
  const hosts=new Set(allowedHosts.map(s=>s.toLowerCase()));const origins=new Set(allowedOrigins);
  if(!hosts.size || hosts.has('*') || origins.has('*'))throw Error('Explicit Host/Origin allowlists required');
  return {close:()=>mcp.close?.(),async fetch(request){
    const url=new URL(request.url);const rawHost=request.headers.get('host');
    if(!hosts.has(url.hostname.toLowerCase()))return reply(403,'Host not permitted');
    if(rawHost!==null){
      if(/[@/\\\s?#]/.test(rawHost))return reply(403,'Host not permitted');
      try{if(new URL(`http://${rawHost}`).hostname.toLowerCase()!==url.hostname.toLowerCase())return reply(403,'Host not permitted');}catch{return reply(403,'Host not permitted');}
    }
    const origin=request.headers.get('origin');if(origin!==null && !origins.has(origin))return reply(403,'Origin not permitted');
    if(url.pathname==='/healthz' && request.method==='GET')return Response.json({status:'ok',...summary},{headers:{'Cache-Control':'no-store'}});
    if(url.pathname!=='/mcp')return reply(404,'Not found');
    if(request.method!=='POST')return reply(405,'Method not allowed',{Allow:'POST'});
    if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply(415,'Expected application/json');
    if(![null,'identity'].includes(request.headers.get('content-encoding')))return reply(415,'Unsupported Content-Encoding');
    let bytes;
    try{bytes=await readBoundedBody(request,maxBodyBytes);}catch(error){return reply(error.status===413?413:400,error.status===413?'Request too large':'Unreadable body');}
    try{
      const headers=new Headers(request.headers);headers.delete('content-length');
      const response=await mcp.fetch(new Request(request.url,{method:'POST',headers,body:bytes,signal:request.signal}));
      const out=new Headers(response.headers);out.set('Cache-Control','no-store');out.set('X-Content-Type-Options','nosniff');
      return new Response(response.body,{status:response.status,headers:out});
    }catch{return reply(500,'Internal error');}
  }};
}

import assets from './site-assets.mjs';
const SECURITY = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY'
};
export function serveAsset(request, path) {
  const asset=assets[path==='/'?'/index.html':path];
  if(!asset)return null;
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...SECURITY,Allow:'GET, HEAD'}});
  const headers={...SECURITY,'Content-Type':asset.type,'Content-Length':String(asset.size),'ETag':asset.etag,'Cache-Control':path.startsWith('/assets/')?'public, max-age=3600, must-revalidate':'public, max-age=0, must-revalidate'};
  if(request.headers.get('if-none-match')===asset.etag)return new Response(null,{status:304,headers});
  const body=request.method==='HEAD'?null:Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
  return new Response(body,{headers});
}

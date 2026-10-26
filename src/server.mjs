/** Optional standalone Node HTTP adapter, not required by ChatGPT Sites. */
import { createServer } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import catalog from '../data/catalog.json' with { type: 'json' };
import { handler } from './mcp.mjs';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
const hosts = new Set((process.env.ALLOWED_HOSTS ?? '127.0.0.1,localhost').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
const origins = new Set((process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000').split(',').map(x => x.trim()).filter(Boolean));
const mcpNodeHandler = toNodeHandler(handler);

function end(res, code, message) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: message }));
}

function isPermittedRequest(req) {
  try {
    const header = req.headers.host;
    if (typeof header !== 'string' || /[@\/\\\s?#]/.test(header)) return false;
    const parsedHost = new URL(`http://${header}`);
    if (parsedHost.username || parsedHost.password || !hosts.has(parsedHost.hostname.toLowerCase())) return false;
    const origin = req.headers.origin;
    if (origin) {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.origin !== origin || !origins.has(origin)) return false;
    }
    return true;
  } catch { return false; }
}

const app = createServer((req, res) => {
  if (!isPermittedRequest(req)) return end(res, 403, 'Host or Origin not permitted');
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (req.method === 'GET' && pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ status: 'ok', catalog_version: catalog.version, entries: catalog.entries.length }));
  }
  if (pathname !== '/mcp') return end(res, 404, 'Not found');
  if (Number(req.headers['content-length'] ?? '0') > 131072) return end(res, 413, 'Request too large');
  if (!['GET', 'POST', 'DELETE'].includes(req.method ?? '')) return end(res, 405, 'Method not allowed');
  void mcpNodeHandler(req, res).catch((error) => {
    console.error('MCP request error:', error instanceof Error ? error.message : 'unknown');
    if (!res.headersSent) end(res, 500, 'Internal error');
    else res.end();
  });
});

app.listen(PORT, HOST, () => console.error(`MCP listening on http://${HOST}:${PORT}/mcp`));
process.on('SIGTERM', () => { app.close(); void handler.close(); });

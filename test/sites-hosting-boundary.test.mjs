import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const source = path => new URL('../'+path,import.meta.url);

test('hosting boundary: only the existing ChatGPT Site is configured',()=>{
 for(const path of ['vercel.json','.vercelignore','api/mcp.mjs','api/healthz.mjs','src/public-mcp.mjs']){
  assert.equal(existsSync(source(path)),false,'External hosting code must not be present: '+path);
 }
 assert.equal(existsSync(source('sites/worker/index.js')),true);
 assert.equal(existsSync(source('public/index.html')),true);
 const hosting=JSON.parse(readFileSync(source('.openai/hosting.json'),'utf8'));
 assert.ok(hosting.capabilities.includes('mcp'),'Existing Sites MCP capability must be preserved');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { handler, createPersonaServer } from '../src/mcp.mjs';

test('MCP SDK handler loads and provides a Fetch interface', () => {
  assert.equal(typeof handler.fetch, 'function');
  assert.equal(typeof handler.close, 'function');
  const server = createPersonaServer();
  assert.equal(typeof server.registerTool, 'function');
});

/** Portable web-standard MCP handler for ChatGPT Sites or other HTTP runtimes. */
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import catalog from '../data/catalog.json' with { type: 'json' };
import { randomPersona, getPersona, validateCatalog } from './core.mjs';

validateCatalog(catalog);

const wrap = (data) => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
  structuredContent: data
});

export function createPersonaServer(data = catalog) {
  validateCatalog(data);
  const server = new McpServer({ name: 'wikidata-random-persona', version: '0.1.0' });
  server.registerTool(
    'random_persona',
    {
      description: 'Select one real person or fictional character from a prebuilt Wikidata URL catalog. Returns URLs and guidance; never retrieves article text or roleplays.',
      inputSchema: z.object({
        kind: z.enum(['real', 'fictional', 'both']).default('both'),
        language: z.enum(['ja', 'en']).default('ja'),
        exclude_qids: z.array(z.string().regex(/^Q[1-9][0-9]{0,11}$/)).max(20).default([])
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (params) => wrap(randomPersona(data, params))
  );
  server.registerTool(
    'get_persona',
    {
      description: 'Return stored reference URLs and metadata for a Wikidata QID already present in the approved catalog. Does not fetch arbitrary URLs.',
      inputSchema: z.object({
        qid: z.string().regex(/^Q[1-9][0-9]{0,11}$/),
        language: z.enum(['ja', 'en']).default('ja')
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (params) => wrap(getPersona(data, params))
  );
  return server;
}

export const handler = createMcpHandler(() => createPersonaServer(), { responseMode: 'json' });
export default handler;

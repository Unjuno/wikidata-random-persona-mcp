# ChatGPT Sites / Work / Codex handoff

## Deployment goal

Use this GitHub repository as the source of truth to create **Random Persona MCP** in ChatGPT Sites. The website/plugin should expose **only** the read-only tools `random_persona` and `get_persona`, without LLM generation, Wikipedia text mirroring, or arbitrary user-selected fetching.

The MCP server returns a Wikidata QID, sorted Wikipedia/Wikidata links, and procedural guidance. A browsing-capable ChatGPT client retrieves the linked source and then begins a clearly disclosed simulated conversation, distinguishing evidence from creative interpretation.

## Work / Sites instruction

> Open https://github.com/Unjuno/wikidata-random-persona-mcp and read AGENTS.md, README.ja.md, docs/ARCHITECTURE.md, src/core.mjs and src/mcp.mjs. Create a Site called Random Persona MCP, adapt the web-standard handler to its actual server runtime, expose two read-only tools, and load the approved data/catalog.json. Test the real MCP handshake and both tool calls. Do not assume the Node adapter works unchanged in Sites. Enforce host/origin, quotas and auth if required by the public hosting policy. Verify that ChatGPT can retrieve one actual returned Wikipedia URL, disclose simulated dialogue, and avoid fabricating content from unread sources.

## Gate checklist

1. Confirm repository files and CI status.
2. Check Node>=22 domain tests locally or in Work.
3. Confirm Sites MCP handler integration, initialize and tools/list.
4. Verify both tools, invalid input and empty selections.
5. Verify ChatGPT actually follows a returned article URL before conversation begins.
6. Publish the Site for the owner and test the installed plugin.
7. Test third-party sharing separately; if product restrictions prohibit it, do not claim public release.
8. Review official plugin submission rules before directory application.

GitHub commits do not necessarily redeploy an already published Site; sync/republish explicitly.

Official references:
- https://help.openai.com/en/articles/20001547-hosting-a-plugin-with-chatgpt-sites
- https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html
- https://developers.openai.com/plugins/deploy/submission

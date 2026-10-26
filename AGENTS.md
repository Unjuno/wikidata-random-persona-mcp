# Instructions for ChatGPT Work / Codex

## Product contract
The MCP is a **random URL catalog selector**, not a persona generator. Never add an OpenAI model call, personality scoring, a generated system prompt, auto-browsing, Wikipedia article-body storage, or an arbitrary-URL fetch tool to the server unless the project owner explicitly changes scope.

## Repo architecture
- `src/core.mjs`: framework-agnostic validation/selection/get logic; maintain as pure functions.
- `src/mcp.mjs`: MCP SDK v2 server factory with two read-only tools and `handler.fetch`.
- `src/server.mjs`: optional Node adapter, NOT assumed as the ChatGPT Sites runtime.
- `src/wikidata.mjs` and scripts: manual staging and catalog review; never auto-promote.
- `data/catalog.json`: approved finite catalog of Wikidata QIDs + Wikipedia reference URLs.
- `docs/SITES_HANDOFF.md`: mandatory deployment and test gates.

## Engineering rules
1. Preserve QID as stable unique key. Never use names as keys.
2. Only allow approved Wikimedia HTTPS hosts/paths, checked before any data is returned.
3. No article text, images, audio, quotes or conversation transcript persistence.
4. Support both real and fictional kinds; optional Japanese/English article links and fallback.
5. Keep handler stateless. Persist catalog through Sites-supported storage or bundled reviewed data. Do not rely on an in-process mutable cache surviving publishes.
6. Secure Origin/Host at the deployment boundary. No public admin mutation tools.
7. CI must run `npm run check`, `npm run catalog:validate`, and `npm test`; add MCP protocol smoke tests once dependencies are available.
8. Verify any changed SDK methods against current [MCP v2 docs](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html); avoid legacy v1 APIs.
9. Before claiming public release, demonstrate a third-party account can install/connect, given ChatGPT Sites plugin-sharing restrictions.
10. Do not commit API tokens or private contact information.
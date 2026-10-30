# Instructions for ChatGPT Work / Codex

## Product contract
The MCP is a **Wikidata-live URL selector with a transparent reviewed-catalog fallback**, not a persona generator. Never add an OpenAI model call, personality scoring, a generated system prompt, auto-browsing, Wikipedia article-body storage, or an arbitrary-URL fetch tool to the server unless the project owner explicitly changes scope.

## Persona-mode contract (2026-10-31)
The intended experience is *the AI agent speaks as the selected identity*, not a biography lookup. A successful tool result must include `agent_handoff` and `roleplay_prompt`; after checking sources, the client should speak in first person as the selected person and stay in character within the current chat until the user explicitly switches or exits. Standard MCP `initialize.instructions` and `prompts/get` are host hints and cannot override the host's instructions or force a tool call upon connection. Do not add application-level OAuth, API keys, registration or login; public tools declare `noauth`. Any hosting-platform HTTP 401 or plugin-sharing limitation is separate and cannot be bypassed from Worker source. Preserve the existing ChatGPT Site as the sole deployment target.

## Repo architecture
- `src/core.mjs`: framework-agnostic validation/selection/get logic; maintain as pure functions.
- `src/mcp.mjs`: MCP SDK v2 factory; mount `src/app.mjs` for the guarded Fetch entry, not the raw handler.
- `src/server.mjs`: optional Node adapter, NOT assumed as the ChatGPT Sites runtime.
- `src/wikidata.mjs`, `src/catalog-update.mjs`, `src/catalog-files.mjs` and scripts: metadata-only staging and digest-bound review; never auto-promote.
- `data/catalog.json`: approved finite catalog of Wikidata QIDs + Wikipedia reference URLs.
- `docs/SITES_HANDOFF.md`: mandatory deployment and test gates.

## Engineering rules
1. Preserve QID as stable unique key. Never use names as keys.
2. Only allow approved Wikimedia HTTPS hosts/paths, checked before any data is returned.
3. No article text, images, audio, quotes or conversation transcript persistence.
4. Support both real and fictional kinds; optional Japanese/English article links and fallback.
5. Keep handler stateless. Persist catalog through Sites-supported storage or bundled reviewed data. Do not rely on an in-process mutable cache surviving publishes.
6. Secure Origin/Host at the deployment boundary. No public admin mutation tools.
7. CI must run `npm run check`, `npm run catalog:validate`, and `npm test`; real HTTP protocol tests run with the official client. Use npm ci and the committed lockfile.
8. Verify any changed SDK methods against current [MCP v2 docs](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html); avoid legacy v1 APIs.
9. Before claiming public release, demonstrate a third-party account can install/connect, given ChatGPT Sites plugin-sharing restrictions.
10. Do not commit API tokens or private contact information.

## Handoff
Read docs/CLIENT_WORKFLOW.md and docs/READINESS.md. Preserve the independent blocked-qids list across catalog-only rollbacks; changes require a new runtime snapshot and Site republishing. Unit fixtures live in test/fixtures; do not weaken checks to accommodate live metadata changes. Source timestamps certify metadata checks, not article truth or persona fidelity.

## Wikidata-live Sites requirement

The Sites Worker must fetch only Wikidata structured metadata from `query.wikidata.org/sparql` and `www.wikidata.org/w/api.php`. It must not browse article text or persist chats. Both tools must preserve response provenance (`source_mode`, `fetched_at` or `fallback_reason`). An upstream outage for an uncataloged QID is `upstream_unavailable`, not `not_found`. The Node adapter remains an optional catalog-only test utility; the Sites worker has the live implementation. Follow docs/LIVE_WIKIDATA.md and verify Site egress permissions before declaring completion.


## Do not confuse fallback count with Wikidata scope

The 300 entries in `data/catalog.json` are the outage fallback only. Never market them as the total universe. `data/persona-index.json` is optional and may be installed only after a **complete** real Wikidata JSON dump scan, validated population counts, reviewed exact SHA-256 and explicit commit. Do not create synthetic QIDs for production and do not trigger an enormous full dump automatically. Sites reports `fallback_catalog.entries` separately from `sampling_method`; selected index QIDs must always be refreshed via live Wikidata API. Keep the existing Site and MCP routes intact.

## Deployment boundary: existing ChatGPT Sites ONLY (2026-10-29)

The owner confirmed that the LP and MCP must remain together on the existing https://random-persona-mcp.unjuno.chatgpt.site Site. Do not create or deploy a separate project on Vercel, Railway, Render or any other host. The previous external-hosting PR was reverted; new hosting elsewhere requires an explicit, new owner decision.

The MCP has no application-specific account, API key, OAuth or login. However, ChatGPT Sites may enforce its own platform access controls on /mcp, and an anonymous request returned HTTP 401. Do not claim that the plugin is anonymously accessible by all MCP clients; do not attempt to bypass Sites platform controls. Preserve Wikidata-live identity discovery, article URL + shared guidance output, the LP, strict input checks and rate budgets.


## Sites D1 persistent fallback cache (2026-10-31)

The product owner chose to progressively collect Wikidata persona metadata in the **existing ChatGPT Site** and prefer this D1 cache when live Wikidata is unavailable. D1 has a documented 10GB max per Site; operate below it (suggested 8GB), measure actual index and storage consumption, and do not upload full Wikidata JSON dumps into D1.

New adapter `src/d1-persona-cache.mjs` is optional until Work/Sites binds `DB` and applies `migrations/0001_persona_cache.sql`. Preserve the exact order: live Wikidata → validated D1 cache → reviewed bundled catalog. Cache records must contain only QID, kind, name, short description, allowlisted Wikipedia/Wikidata URLs and checked timestamp; no article prose, user chats or LLM calls. Maintain source modes and never identify a stale/uncertain cached identity as newly live verified.

No public anonymous ingestion API or user authentication. Data seeding/review/import must be owner-controlled through Sites storage management. No Vercel, Railway or new ChatGPT Site. Never claim D1 is active before the *deployed* /healthz reports `cache_storage=d1` and a real cache-fallback tool call passes.


## Durable progressive ingestion — owner instruction

The owner wants the persona cache to grow continuously, not to expire old identities. Never delete a cached QID only because its last verification is 90+ days old. The Site-local D1 table has a QID primary key, and repeated discoveries may refresh metadata without duplicating identity records. Keep `cache_checked_at` for transparency.

The private `createProgressiveIngestor` and Site Worker `runSiteCollection`/`scheduled` must never be callable through `/mcp` or a public unauthenticated route. Site Automations must be explicitly linked to the **existing** Site by its owner, with the D1 `DB` binding available in the scheduled environment. Do not silently start a GitHub Actions cron, create new hosting, or claim scheduled collection is live from source-code tests.

Use D1's `meta.size_after` for authoritative byte accounting when available and stop writes if size is unknown or approaches the configured 8GB soft ceiling. Do not insert Wikimedia records that failed structured validation or came from a non-live fallback. See docs/PROGRESSIVE_INGESTION.md.

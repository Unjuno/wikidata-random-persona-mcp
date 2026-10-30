# ChatGPT Sites / Work / Codex handoff

## Copy into Work or Codex

> https://github.com/Unjuno/wikidata-random-persona-mcp を開き、AGENTS.md、README.ja.md、docs/ARCHITECTURE.md、docs/CLIENT_WORKFLOW.md、docs/READINESS.mdを読んでください。既存Site https://random-persona-mcp.unjuno.chatgpt.site を更新し、sites/worker/index.js をSitesのWorker環境へビルドしてください。別Siteを新規作成しないでください。公開するツールはrandom_personaとget_personaだけです。data/catalog.jsonとdata/blocked-qids.jsonを同時に読み、実際のSiteホスト名をallowedHostsへ設定してください。Node常駐サーバー、任意URL取得、LLM呼び出し、Wikipedia本文保存は追加しません。docs/CLIENT_WORKFLOW.mdを利用側の共通ワークフローとして組み込みます。まず非公開でnpm ci、npm run check、npm run catalog:validate、npm testを実行し、Sites上のMCP接続と資料取得から仮想対話開始までを確認してください。所有者の公開・プラグイン接続・第三者利用は別々に検証し、未確認の段階を完了扱いにしないでください。

## Runtime seam

The Sites-specific production entry is `sites/worker/index.js`. Build it with `npm run build:sites`; the generated artifact places its Worker entry at `dist/server/index.js` and declares `capabilities: ["mcp"]` in `.openai/hosting.json`. This adapter speaks the Sites MCP protocol (`server/discover`, `tools/list`, `tools/call`) and reuses `src/core.mjs`, `src/catalog-store.mjs`, `data/catalog.json`, and `data/blocked-qids.json`. It does not run the Node HTTP adapter. It makes bounded requests only to the Wikidata structured-data endpoints `query.wikidata.org/sparql` and `www.wikidata.org/w/api.php`. The Site must be allowed to reach these hosts; the Node adapter remains a separate catalog-only implementation. The target hostname is deliberately exact in the Worker and must be updated in source and tests if the Site slug changes.

`src/app.mjs` exports `createApp(options)`, returning `{fetch, close}`. The adapter must preserve the original request URL, method, headers and streaming body. Do not mount raw `src/mcp.mjs` without equivalent guards. Never put a body parser in front that bypasses the byte limit. Mount `/mcp` and `/healthz`; call `close` during shutdown where supported.

| Option | Meaning | SI unit | Type / range / precondition |
|---|---|---|---|
| allowedHosts | Exact deployment hostname allowlist | none | nonempty string array, no wildcard, no scheme or port |
| allowedOrigins | Origins allowed when an Origin header is present | none | string array of full origins; default empty |
| catalog | Approved catalog snapshot | none | validated JSON object; omit to bundle data/catalog.json |
| blockedQids | Suspensions independent of catalog rollback | none | valid QID string array; omit to bundle data/blocked-qids.json |

Request-body bound is 131072 bytes, a byte count rather than time or character count. Node request timeout is 15 seconds. In Sites, explicitly verify the platform's request deadline, memory/concurrency limits, traffic quotas/rate limits and any required authentication. Host/Origin checks are not authentication and do not stop non-browser callers. The Sites Worker intentionally supports anonymous CORS preflights and wildcard read-only browser access on `/mcp`, while enforcing the exact Site Host and request-size/rate limits. Other site routes still reject untrusted browser Origins. This CORS allowance is **not** an authentication bypass: Sites platform access checks can reject anonymous clients before the Worker runs.

Use live metadata first in Sites and bundled reviewed data only as labeled fallback. Do not assume a writable filesystem, a persistent Node process, cron, or background jobs. `catalog:refresh`/`catalog:promote` are operator-side Node scripts: run them in Work/Codex or use the manual GitHub Actions staging workflow, review results, commit approved data, then sync/republish the Site. A future Sites database requires a separate transactional storage adapter.

## Publish gates, in order

1. Select an actual commit with green CI; use its package-lock.json and `npm ci`.
2. Read the current catalog status in READINESS. Demo data is not a comprehensive/representative database. Verify real metadata before broad publication.
3. Update the existing Site, preserving its current audience; verify real host/origin and request/traffic controls. Never use `*` to make a failed guard disappear.
4. Check actual SDK connection, exactly two tools, both kinds, exclusions, unknown QID, strict invalid inputs, suspended IDs, oversized request rejection and health.
5. Confirm the SAME ChatGPT conversation can fetch a returned article URL and start a disclosed simulation. Test missing browsing/insufficient evidence with bounded recovery.
6. Site owner publishes/republishes; install the produced plugin card and complete required connection. Check the tool list again.
7. Test a second account and its access to BOTH Site and plugin. Sharing a website URL is not evidence of plugin access. Record the actual endpoint and result; do not invent a public endpoint.
8. If general/public directory distribution is intended, separately verify current submission and hosting eligibility. The repository and local/CI TCP tests do not prove eligibility.

GitHub updates do not necessarily redeploy an existing Site. Catalog and suspension changes take effect only after snapshot recreation/sync/republish. Roll back catalog data only; retain the current suspension list. Do not revert the entire repository without reapplying current suspensions.

## Official references checked 2026-10-28
- https://help.openai.com/en/articles/20001547-hosting-a-plugin-with-chatgpt-sites
- https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites
- https://developers.openai.com/plugins/deploy/submission
- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/src/server/createMcpHandler.ts

The hosting guide currently distinguishes Site sharing from plugin sharing; personal/Pro direct plugin invitations/share links are restricted. Confirm the actual account's available route rather than assuming that a public repository enables public plugin sharing.

## Wikidata live acceptance gate

Use `docs/LIVE_WIKIDATA.md` as the current source of truth. Republish the existing Site from a green CI commit, confirm `/healthz.mode=wikidata_live_with_catalog_fallback`, then invoke `random_persona` and `get_persona` for a verified Wikidata QID outside the fallback catalog. Inspect `source_mode`: `wikidata_live` must be observed, not just fallback. Test what happens if Wikidata cannot be reached, and have ChatGPT actually open the referenced article before beginning simulated dialogue. GitHub updates alone do not redeploy Sites.


## Correct random population and health fields

The updated `/healthz` deliberately replaces the ambiguous top-level `entries` with `fallback_catalog.entries`. `sampling_method` is either `bounded_wdqs_offset` (no reviewed full-dump index deployed) or `wikidata_dump_reservoir` (approved full-dump QID index active). `eligible_population` and `index_version` are reported only for the latter. Do not claim indexed mode is active until the official full dump has been scanned, approved, and republished to the **existing** ChatGPT Site. The 300 standby records are never a hard cap on live Wikidata selection.

## Corrected single-Site deployment boundary (2026-10-29)

The only deployment target is the existing https://random-persona-mcp.unjuno.chatgpt.site. Keep both / and /mcp on that Site, including the existing generated imagery and live Wikidata integration. Do not create any new ChatGPT Site or deploy to Vercel/Railway/Render.

Do not add custom login, API keys or OAuth. Sites-managed access checks are platform features and should not be bypassed; anonymous /mcp requests have returned HTTP 401. General access by other AI clients remains unverified even though MCP itself is an open protocol. Do not report anonymous public distribution as implemented without a real external-client test.


## D1 cache in the same Site — mandatory provisioning and verification

Use the existing `random-persona-mcp.unjuno.chatgpt.site` Site only. Request a Site-local D1 database binding named `DB` using the Sites storage capability, preserving the existing Site project_id and MCP capability. The repository's hosting manifest is **not** evidence of a provisioned database; do not set a made-up database identifier. Run the migration from `migrations/0001_persona_cache.sql` in that bound database through authorized Sites management, without exposing an anonymous HTTP write endpoint.

Start by revalidating and importing the reviewed fallback QIDs into D1, then progressively ingest additional verified Wikidata QIDs in manageable batches. Set a soft operating target of 8GB/10GB with alerts and plan for retention/eviction. Cache source objects must be validated; do not store Wikipedia article bodies or conversations.

Republish the same Site from a green GitHub commit. Check `/healthz.cache_storage=d1`, then simulate Wikidata unavailability and confirm `random_persona.source_mode=d1_cache_fallback`, correct QID and `cache_checked_at`. Verify `get_persona` for a cached QID outside the 300-record embedded catalog and ensure unauthorized cache-write routes do not exist. If D1 provisioning is unsupported on this account, report it and leave the old live → 300 fallback intact.

Reference: [D1_CACHE_OPERATIONS.md](D1_CACHE_OPERATIONS.md).


## Link the progressive Wikidata collection to this existing Site

After D1 provisioning on the existing Site, configure a Site Automation owned by the same owner. Run `runSiteCollection(env,{batches:8})` through a privileged scheduled execution context with Site `DB` available, and do not create a public import route. Begin with one cloud run per day at 03:00 Asia/Tokyo, then assess safe cadence using the task's `added`, `known`, `source_unavailable` and `storage_bytes` outputs.

Strict acceptance: Site `/healthz.cache_storage=d1`, verified D1 row count increases over at least two scheduled runs without duplicates, `source_mode=d1_cache_fallback` on controlled Wikidata outage, 8GB soft stopping and no new Site or external host. Scheduler support is account-specific, and a deployed Worker `scheduled` method alone does not prove a Site Automation was linked. Full instructions: [PROGRESSIVE_INGESTION.md](PROGRESSIVE_INGESTION.md).


## Initial-connection persona activation handoff (2026-10-31)

The published Site **must** use the updated `sites/worker/index.js`, compiled through `npm run build:sites`. On the first `server/discover` (MCP 2026-07-28) or `initialize` (legacy) request, the Worker performs an **internal random draw** and returns `CONNECTION_PERSONA_JSON` in the standard `instructions` field with QID, name, kind, source links, `agent_handoff` and `roleplay_prompt`. `server/discover` must report `ttlMs:0` and `cacheScope:'private'`. The consumer must **not** call `random_persona` again just to begin the first conversation. Run the official SDK connection regression test before publish.

**Proof sequence for the existing Site only:** (1) republish the known green commit into `https://random-persona-mcp.unjuno.chatgpt.site`, keeping `/mcp`, LP, and `/healthz`; (2) connect a fresh modern MCP SDK client with no application authentication, check that `connect()` alone returns `CONNECTION_PERSONA_JSON` with a nonempty QID; (3) repeat with a legacy client; (4) check that no separate `tools/call` occurred during either handshake; (5) test ChatGPT actually reads the reference article and **speaks as** the identity on the first available assistant turn and keeps the QID for five exchanges; (6) test explicit switch/exit; (7) verify independent-user plugin and Site sharing. Report 401 separately if the platform prevents anonymous access.

An MCP server does not have a universal on-install callback that starts a chat, and the host may ignore discovery instructions. **Green server tests are insufficient for the product's full zero-click roleplay acceptance.** If the host cannot consume those instructions, configure a host-level start-of-session action for this plugin rather than claiming the Worker can force model behavior. Do not create a new Site or deploy elsewhere.

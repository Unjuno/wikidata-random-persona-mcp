# Progressive D1 persona-cache operating procedure

## Goal and verified platform limits

**One existing ChatGPT Site**: https://random-persona-mcp.unjuno.chatgpt.site. Keep the LP, original images and MCP there. Do not create a new Site, Vercel project, or external host.

OpenAI's official Sites guidance documents D1 databases up to **10 GB per Site**, while file storage (R2) has no fixed per-Site storage cap. Use the existing Site's D1 only for compact structured records; do not copy the full Wikidata JSON dump or Wikipedia article bodies. The proposed 8GB working ceiling is an operational recommendation, not a hard platform limit or a currently implemented automated quota.

References: https://help.openai.com/ja-jp/articles/20001339-creating-and-using-chatgpt-sites and https://learn.chatgpt.com/docs/sites/data-and-connections

## Data model

`migrations/0001_persona_cache.sql` defines `persona_cache` with QID primary key, real/fictional classification, short name and description, allowlisted article/identity URLs stored as JSON, a random key for indexed draws, and a checked-at timestamp. The `(kind, random_key, qid)` index enables bounded indexed seeks rather than sorting the entire database randomly.

No full article text, generated prompts, personal identity/account information or chat transcripts are persisted. `roleplay_prompt` is recreated from the selected entry in the Worker. A D1 cache row is not automatically equivalent to newly live verified Wikidata.

## Stage A — provision the D1 binding on the EXISTING Site

1. In ChatGPT Work/Sites, open existing project ID `appgprj_6ae19a38eb4c819192ec364286d5b1af`; **do not create another Site**.
2. Enable a relational D1 database and bind it as `DB`. Preserve existing `/`, `/mcp`, `/healthz` and `.openai/hosting.json` `capabilities: ["mcp"]`. Let Sites tooling record its actual binding config; do not invent a D1 identifier.
3. Through the privileged Sites database-management capability, execute `migrations/0001_persona_cache.sql` exactly once (idempotent `IF NOT EXISTS`). Do not create an unauthenticated public HTTP route capable of writing to D1.
4. Build the latest GitHub main (`npm ci --ignore-scripts && npm test && npm run build:sites`), save the reviewed version, and republish the same Site.
5. Verify `/healthz.cache_storage` is `d1` and `fallback_order` is live, D1, bundled catalog. A `not_configured` value means D1 has **not** been connected.

## Stage B — initial and progressive population

1. Seed with a small verified batch of QIDs from the existing reviewed catalog, but **revalidate each through Wikidata before assigning the current checked-at timestamp**. Do not falsely treat unverified historic snapshots as fresh.
2. Obtain additional candidates from reviewed, bounded Wikidata category queries or the existing full-dump sampler. Stream the dump only in an appropriately provisioned batch environment: raw Wikidata is far larger than 10GB.
3. Revalidate candidates using Wikidata entity metadata, direct P31 kind checks and ja/en Wikipedia sitelinks. Deduplicate by QID and respect the blocked-QID list.
4. Import validated records through owner-controlled Sites data tools using the parameterized upsert from `src/d1-persona-cache.mjs`. Keep batches small and checkpoint the last imported QID before processing the next batch. Never expose the batch writer through a public MCP tool or LP route.
5. Run incremental batches on a schedule only if the connected Work/Sites environment supports a permitted recurring job. Do **not** claim an in-process Worker has a durable timer or background cron. Otherwise manually stage and import reviewed batches.
6. Monitor actual D1 used bytes, QID count by category, candidate rejection rate, stale-record rate, ingestion error rate and read latency. Pause writes near **8GB** until compaction/retention and available storage are checked. Indexes and SQLite overhead count toward D1 size.

## Runtime behavior

The implementation in `sites/worker/index.js` is backward-compatible with the existing Site: if no `env.DB` binding exists, the current live → 300 JSON fallback continues. If bound:

- Live Wikidata success: return `source_mode=wikidata_live` and write verified metadata to D1 (write failure never erases the successful draw).
- Live errors/empty candidate search: try D1 cache; if successful return `source_mode=d1_cache_fallback`, `cache_checked_at`, `fallback_reason` and a person-specific roleplay instruction.
- D1 unavailable/empty: use bundled catalog with `source_mode=catalog_fallback`.
- Explicit live `not_found` for a QID does not silently become stale cache data.
- An AI client reads the returned article and performs the simulated roleplay. The MCP does not run a model.

## Release verification and rollback

Verify both random and QID lookup against the **actual deployed Site**, not just synthetic fixtures. Simulate an upstream maxlag/timeout while an eligible D1 record exists, and confirm that the result is sourced from D1. If D1 errors, confirm the built-in fallback continues. Preserve D1 and blocked QIDs across Site code rollbacks. No custom user login, API key or OAuth is added. Platform-managed MCP connection restrictions remain separate.

## State at creation

**Code and migration only. D1 has not been provisioned, data has not been bulk imported and continuous scheduled ingestion has not been enabled.** GitHub CI does not imply any of those actions were carried out on the existing Site.


## Progressive Site Automation ingestion

A new bounded private collector `src/progressive-ingestion.mjs` is invoked through `runSiteCollection(env,{source,batches})` or the existing Site Worker's optional `scheduled` event handler. Its source `discoverBatch` makes a **single class-scoped SPARQL query and one metadata batch request** for up to four verified people. A Site schedule can run multiple bounded batches; collection never requires an anonymous HTTP writer.

For unattended work, first provision D1 `DB`, apply the existing migration, attach the schedule to the exact Site in Sites > Automations and verify the cloud task can see the database. The owner's schedule must explicitly be confirmed; no schedule exists merely because Worker source exports a `scheduled` handler. Start with a conservative 8 batches per day and review upstream 429/maxlag outcomes before increasing cadence.

Do not delete stale identities just because their cache date is old. The collector upserts by QID, validates all article URLs, and stops writing at the 8GB soft budget with a 1MB safety margin. Query response `meta.size_after` measures database bytes. An absent `size_after` stops ingestion rather than treating storage as infinite. Read [PROGRESSIVE_INGESTION.md](PROGRESSIVE_INGESTION.md).

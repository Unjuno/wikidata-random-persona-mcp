# Progressive Wikidata collection on the existing ChatGPT Site

## Intended operation

The owner wants the database to keep growing automatically, not to discard older person records. Preserve existing verified QIDs, append new eligible ones, deduplicate by QID and refresh stale metadata on rediscovery without deleting records based on age alone. The MCP continues to draw a person and hand back article URLs plus a roleplay instruction; the AI client does the reading and simulation.

**Exclusive Site:** https://random-persona-mcp.unjuno.chatgpt.site. Do not create a new Site or deploy to Vercel, Railway, Render or another service.

## Implementation

- `src/live-wikidata.mjs`: `discoverBatch({kind,language,exclude_qids})` retrieves up to four classified Wikidata identities with one bounded WDQS query followed by at most one `wbgetentities` metadata request. The source enforces Wikimedia host/path and response size restrictions and respects rate limits.
- `src/progressive-ingestion.mjs`: `createProgressiveIngestor({db,source,cache,blockedQids,softLimitBytes}).runOnce({batches:8})` runs at most 16 batches per invocation, alternating real/fictional, validating QIDs and Wikipedia URLs, checking for existing records and upserting by QID.
- `sites/worker/index.js`: exports `runSiteCollection(env,{source,batches})` and an optional Worker `scheduled` handler. Neither is an HTTP or MCP tool. A scheduler will only trigger the handler when the hosting runtime explicitly supports and wires scheduled events.
- `src/d1-persona-cache.mjs`: Site runtime enables an 8GB soft limit on all D1 writes, including opportunistic MCP cache inserts. D1 reads and the bundled 300-item emergency fallback remain available when writes stop.
- D1 query results include `meta.size_after` (database size in bytes). The collector checks storage before each batch and refuses writes if storage size cannot be verified. The soft limit reserves space for DB indexes and maintenance. 10GB is the Sites hard limit, not a target that must be filled.

## Activate in Sites (Work required)

1. Open the existing Site project ID `appgprj_6ae19a38eb4c819192ec364286d5b1af`; never create a replacement.
2. Provision the supported D1 storage binding named `DB` if absent. Apply `migrations/0001_persona_cache.sql` through Sites' privileged storage tools. The GitHub build itself does not create storage.
3. Check the runtime recognizes the binding and `GET /healthz.cache_storage` equals `d1` after republishing the reviewed source.
4. From this same Site's **Automations**, choose Create schedule. A conservative default is daily at 03:00 Asia/Tokyo, at most 8 batches per run (at most 32 candidate records; successful metadata lookups may yield fewer). The owner must confirm the schedule and ensure it can access Site D1 when running in the cloud.
5. The scheduled task must invoke the private collection function with the Site database binding; no new external host, no unauthenticated public endpoint and no extra MCP tool. If the scheduler cannot directly invoke Worker `scheduled`, use the Sites-supported privileged data workflow to call `runSiteCollection` with the actual D1 context. Report an unsupported integration instead of pretending it runs.
6. Run a safe first batch, verify results and D1 row counts, then verify at least one more scheduled run. Adjust frequency only after observing Wikidata maxlag, request quotas and Sites usage. No automatic promise that 8GB will be filled quickly.

### Suggested Site Automation instruction

Operate only the existing Site `random-persona-mcp.unjuno.chatgpt.site`. On each confirmed schedule, use the Site-local `DB` D1 binding and the reviewed `runSiteCollection` logic to collect up to 8 bounded Wikidata batches, alternating real and fictional people. Append only fresh, eligible, verified QIDs and Wikipedia references, deduplicate by QID, preserve older identities, refresh metadata without rewriting recent unchanged entries, never download article bodies or save conversations. Respect Wikidata 429/503/maxlag and halt safely on upstream errors. Stop all writes if D1 size is unknown or approaches 8GB. Never add a public write endpoint, new host or custom authentication. Record run time, added/known/skipped counts, storage bytes and any early-stop status. Report errors; do not claim successful ingestion without a D1 row-count change or a verified no-new-data outcome.

## Acceptance gates

- D1 bound to the original Site (`/healthz.cache_storage: d1`).
- A real scheduled run reports `status: ok`, non-zero `added` when eligible new QIDs exist, and a verifiable D1 total increase.
- Repeated runs do not create duplicate QID rows and do not delete older QIDs merely for age.
- The Wiki service can be temporarily unavailable while the MCP falls back to `source_mode=d1_cache_fallback` and returns the original QID and source URLs.
- At/above the 8GB soft ceiling, scheduled writes stop and MCP reads continue. Missing D1 `meta.size_after` also fails closed for writes.
- Public `/mcp` still exposes **only** `random_persona` and `get_persona` and has no ingestion/mutation route. The landing page and generated images remain unchanged.

## Scope and current status

The code and simulated Worker scheduled-handler tests are implemented in GitHub. **The actual existing Site D1 binding and the Site Automation schedule are not created by GitHub.** Do not report that background collection is active until Work/Sites has linked and executed a schedule and measured persistent growth.

References: [OpenAI Sites schedule documentation](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites), [Sites storage](https://learn.chatgpt.com/docs/sites/data-and-connections), [D1 result metadata](https://developers.cloudflare.com/d1/worker-api/return-object/).

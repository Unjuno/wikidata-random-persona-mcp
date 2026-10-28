# Live Wikidata source — Sites only

## Why this exists
The original MCP selected from six, then 300 preapproved QIDs; this was a finite catalog, not live Wikidata discovery. The ChatGPT Sites worker now uses Wikimedia metadata APIs **at request time**. Its response reports the source used.

## Two read-only MCP tools
- `random_persona`: a single bounded Wikidata Query Service class-scoped search for up to 4 QIDs with a randomized offset, followed by one `wbgetentities` metadata read to choose an eligible item.
- `get_persona`: an Action API `wbgetentities` lookup for any valid Wikidata QID (not limited to the 300 fallback records), requiring a recognized direct P31 classification and ja/en Wikipedia article link.
- Only `https://query.wikidata.org/sparql` and `https://www.wikidata.org/w/api.php` may be accessed by the Sites worker. It never fetches or stores Wikipedia article text.
- Wikimedia User-Agent, bounded requests/responses, read timeouts, strict QID checks, and explicit handling of 429 responses are part of this mode.

## Response provenance
- `source_mode: wikidata_live` plus `fetched_at`: the selected QID was fetched from live Wikidata metadata in this request.
- `source_mode: catalog_fallback` and `fallback_reason: wikidata_unavailable | no_live_match`: live Wikidata failed or yielded no eligible result; the subject was drawn from the bundled approved catalog.
- `status: upstream_unavailable`: cannot verify a valid, uncataloged QID during a Wikidata outage. This must not be reported as not_found.
- `/healthz.entries` is the fallback catalog entry count **not** the universe of live Wikidata subjects; `/healthz.mode` indicates whether the source-capable Worker was deployed.

## Honest randomness disclosure
The current technique is NOT uniformly random across Wikidata. It draws from direct P31 classes, uses bounded randomly offset windows and selects real/fictional in roughly equal categories when kind=both. Other classes, unlinked people, and some items deeper in Wikidata subclasses are omitted. Public WDQS has query limits. Under significant traffic, use a dump-derived eligibility index and keep live reads for the selected item rather than per-draw WDQS queries.

## Test and deploy
1. `npm ci --ignore-scripts && npm test && npm run build:sites` in Work/Codex from current GitHub main.
2. Update the **existing** ChatGPT Site `https://random-persona-mcp.unjuno.chatgpt.site`; do not create another service or move to Railway.
3. If the Site needs outbound API access authorization, allow only query.wikidata.org and www.wikidata.org.
4. Check `GET /healthz` returns `mode=wikidata_live_with_catalog_fallback`.
5. Call both MCP tools. Confirm random_persona returns `source_mode=wikidata_live`, and get_persona succeeds for a suitable QID outside the fallback catalog.
6. Deliberately test an upstream outage and check `catalog_fallback` and `upstream_unavailable` semantics.
7. Verify that ChatGPT actually opens the returned Wikipedia link before simulated roleplay. Test external account access separately.

**GitHub changes do not automatically republish an existing ChatGPT Site.**

Official references: https://www.wikidata.org/wiki/Wikidata:Data_access and https://www.mediawiki.org/wiki/API:Presenting_Wikidata_knowledge

## Limits in the LP release

Each draw makes at most two upstream GET requests (4 candidate IDs, then one entity batch). The query selects direct-class identities; ja/en sitelinks are verified in the entity response, so no expensive article join is required. Each request and response body share a 10-second deadline and a 2 MiB response limit. No automatic retry loop runs. HTTP 429/503 Retry-After (including HTTP dates) and maxlag put that isolate into a cooldown. At most 60 upstream requests/minute and 4 simultaneous upstream operations are allowed per Worker isolate. `/mcp` additionally permits at most 120 requests/minute per isolate and 128 KiB per body with a 5-second body-read deadline. These volatile safety budgets are not distributed account-level quotas and reset when Sites starts a new isolate.

A no-such-entity API error with the exact requested QID is `not_found`. Missing/mismatched response maps are upstream errors. Contradictory human/fictional, deprecated-only and disambiguation/list classifications are rejected. Sites' authentication/access enforcement remains the MCP boundary; the static LP does not provide an unauthenticated proxy for MCP calls.

The built Worker is tested with official MCP Client 2.4 in both legacy initialize and modern auto-discovery modes. Modern results carry `resultType: complete`; legacy initialize negotiates supported 2025/2024 revisions. Batch requests are rejected and notifications never execute tool calls.

The four-entity batch avoids unnecessarily downloading claims for twelve subjects: a live production trial exceeded the 2 MiB cap and correctly fell back. Large individual entities can still fall back. Redirects use `manual` and every non-2xx status is rejected; Cloudflare Workers do not support the Node/browser `error` redirect mode.


## Full-dump QID reservoir mode (optional, not yet deployed)

300 entries is the size of the approved **outage fallback**, not the draw ceiling. The Sites Worker now supports a QID-only, complete-Wikidata-dump reservoir (up to 250,000 QIDs per eligible kind). With a reviewed index installed, `both` draws kinds in proportion to eligible population counts from the complete scan, chooses a QID uniformly within its reservoir and refreshes that QID from live Wikidata. This does not cover every transitive fictional subclass, and a fixed finite reservoir is not the entire Wikidata corpus.

**This change does not ship a completed dump or an approved index.** Without one, Sites keeps bounded WDQS queries and still is not limited to 300. The new `/healthz.sampling_method` reports the actual method; `/healthz.fallback_catalog.entries` is the backup count. A full-dump scan, review, explicit GitHub commit and existing Site republish are separate release gates. See [index operations](DUMP_INDEX_OPERATIONS.md).

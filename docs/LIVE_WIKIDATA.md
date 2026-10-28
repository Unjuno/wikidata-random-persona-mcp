# Live Wikidata source — Sites only

## Why this exists
The original MCP selected from six, then 300 preapproved QIDs; this was a finite catalog, not live Wikidata discovery. The ChatGPT Sites worker now uses Wikimedia metadata APIs **at request time**. Its response reports the source used.

## Two read-only MCP tools
- `random_persona`: a single bounded Wikidata Query Service class-scoped search for up to 12 QIDs with a randomized offset, followed by one `wbgetentities` metadata read to choose an eligible item.
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

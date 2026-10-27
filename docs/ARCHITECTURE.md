# Architecture — URL-first MCP v0.2

## Product boundary
The server draws an identity and returns metadata, trusted reference URLs and fixed common guidance. The browsing client retrieves articles and constructs a conversation. There are no model calls, generated persona definitions, stored article bodies, stored chats or arbitrary-URL public fetch tools.

## Runtime
`data/catalog.json` + independent `data/blocked-qids.json` -> immutable `createCatalogStore` snapshot -> two SDK tools -> guarded `createApp().fetch` -> optional Node adapter or actual Sites runtime.

- `random_persona`: kind defaults to both, language defaults ja, up to 20 exclusions. Sampling is uniform over eligible catalog identities, not URLs or all Wikipedia, and not a forced 50/50 split. Language controls source priority with fallback, not filtering.
- `get_persona`: QID required; unknown/suspended items return not_found. This does not retrieve article content.
- Both return structuredContent plus equivalent JSON text; source metadata is cloned and fields are bounded. Outcomes are ok, no_match and not_found. Invalid arguments are tool validation errors.
- No runtime external network access. Host and Origin allowlists, 128 KiB actual-byte cap, JSON-only input, no-store responses. Optional Node adapter also has timeouts. Sites edge quotas and authentication are separate prerequisites.
- Selection validates a bounded catalog; this implementation is for small reviewed batches, not an optimized million-identity database. Rebuild the snapshot on data/suspension changes.

## Operator-only update pipeline
1. Read 1-100 reviewed seed QIDs; reject duplicates/invalid kinds before networking.
2. Fetch Wikidata metadata in groups of 10, not an expensive random global SPARQL query. Use sitelink titles, never guessed names.
3. Verify each candidate through Wikipedia metadata APIs only: ns=0, no disambiguation, no section redirect, exact wikibase_item QID, canonical allowed URL. Keep ja/en verified sources and checked_at. An English source is sufficient if Japanese is missing.
4. HTTP requests use an identifying User-Agent, maxlag=5, 15-second timeout, 2 MiB response bound, sequential pacing, maximum three attempts. Honor Retry-After; if it exceeds the 30-second run wait budget, abort instead of retrying early. API maxlag in HTTP 200 also triggers backoff.
5. Only after the whole run succeeds, atomically write catalog.pending.json and show its SHA-256 plus rejections. A failed run does not replace active or pending data. Both kinds must remain represented.
6. Review changes and any deletions/classification changes. Promote with --reviewed AND the expected SHA-256. Take an exclusive local writer lock, save catalog.previous.json and atomically replace the active file. No automatic publication.
7. Commit approved data and sync/republish the Site. Block list is not touched by promotion. Restore only the prior catalog on rollback, retaining current suspensions.

Local rename supplies atomic visibility, not a cross-host database transaction or power-loss durability guarantee. Crash leftovers require an operator to verify no process owns the lock before removing it. The GitHub staging workflow has contents:read and uploads only a candidate; it cannot approve, commit or deploy.

## Classification limits
Real seeds require direct P31=Q5; fictional seeds reject direct Q5 but otherwise rely on reviewed seed classification. Full Wikidata subclass closure is NOT implemented. Metadata verification establishes link/identity correspondence, not article accuracy, narrative sufficiency, rights clearance or faithful personality reproduction. These are distinct client/review gates.

## Consumer
See CLIENT_WORKFLOW.md: retrieve before interpreting, retain identity in the same chat, disclose simulation, cite sources, separate fact/interpretation/fiction. At most two articles per identity and two redraws; absent browsing or global access failures stop without pretending success.

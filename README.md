# Wikidata Random Persona MCP

[日本語](README.ja.md) · [Architecture](docs/ARCHITECTURE.md) · [Sites handoff](docs/SITES_HANDOFF.md) · [Readiness](docs/READINESS.md)

A **URL-first, read-only MCP** that selects a real person or fictional character and returns Wikidata/Wikipedia reference links. The client browses those sources, interprets the identity and begins a clearly disclosed simulated conversation. The server does not generate a persona prompt, call a model, mirror article text, or store conversations.

## Tools

| Tool | Contract |
|---|---|
| `random_persona` | Sites: discover candidates through Wikidata's live P31 metadata query; return one person's link or transparent catalog fallback. |
| `get_persona` | Sites: look up any eligible QID directly in Wikidata, including QIDs outside the 300-entry fallback. |

| Argument | Meaning | SI unit | Type / range / default |
|---|---|---|---|
| kind | identity category | none | string: real / fictional / both; default both |
| language | source priority and guidance language | none | string: ja / en; default ja; alternate-language fallback |
| exclude_qids | recent identities to skip | none | QID string array, at most 20; default empty |
| qid | stable Wikidata identity for get_persona | none | required string matching Q plus positive digits |

The Sites live path samples direct P31 class results using bounded random offsets, with an approximately 50/50 choice between real and fictional identities for `both`. This is **not a uniform random sample of all Wikidata**. The approved local catalog is used only for an explicitly labeled fallback. The original six-entry demonstration catalog did not meet the intended Wikidata discovery scope. There are now two **operator-side** ingestion paths: [full-dump stratified reservoir sampling](docs/WIKIDATA_SAMPLING.md) and a small bounded Wikidata API bootstrap. The fallback alone draws uniformly within the approved and deployed catalog. The actual entry count is available from the Site's `/healthz` endpoint; see [catalog review evidence](docs/CATALOG_REVIEW.md).

## Develop and test

Node.js 22+; CI covers Node 22 and 24. Dependencies are locked; no API key or local model is required.

```sh
npm ci --ignore-scripts
npm run check
npm run catalog:validate
npm test
npm run test:protocol
npm start
```

The optional local adapter listens on `http://127.0.0.1:3000/mcp`, with `/healthz`. Protocol tests use the official SDK client over real loopback TCP and cover both tools, concurrent requests, invalid arguments, legacy initialization and HTTP guards. Metadata API tests use isolated fixtures; the separate catalog review records actual Wikimedia requests.

## Review an update

```sh
npm run catalog:refresh
npm run catalog:validate -- data/catalog.pending.json
# Review the diff, QIDs, categories, deletions and metadata check timestamps.
# Replace REVIEWED_SHA256 with the exact digest printed for the reviewed candidate.
npm run catalog:promote -- --reviewed --expected-sha256 REVIEWED_SHA256
```

The digest is a 64-character hexadecimal SHA-256 string, not a secret. Changes after review invalidate approval. Active data is backed up before atomic replacement; failed staging leaves active data untouched. CLI scripts serialize writers with a local lock. Both categories are required and seed batches are bounded to 100. These are operator-side filesystem tools, not assumptions about Sites storage.

Alternatively use GitHub Actions **Stage catalog metadata for review → Run workflow**. It uploads a candidate only and has no write or deployment permissions. Review/download it before promotion. No scheduled or automatic publication is configured.

`data/blocked-qids.json` suspends identities for both tools independently of catalog versions. Preserve it when rolling back catalog data. Commit approved changes, recreate the runtime snapshot, then sync/republish Sites; editing GitHub alone does not update a running Site.

## Deploy to Sites

The Sites runtime uses `sites/worker/index.js`, not the optional Node adapter. This Worker makes bounded live requests to Wikidata Query Service and Action API, never fetches full articles, and exposes `source_mode` to distinguish live results from fallback. See [live Wikidata integration](docs/LIVE_WIKIDATA.md). `npm run build:sites` packages the reviewed catalog, suspension list and pure selection logic into a Cloudflare Worker implementing Sites' `server/discover`, `tools/list`, and `tools/call` endpoint at `/mcp`. `.openai/hosting.json` declares the MCP capability. The Worker pins the exact generated Site host, allows only its matching Origin, and caps streamed request bodies at 128 KiB. Sites supplies authentication and access checks before MCP dispatch; configure any traffic quotas the account exposes at the platform boundary.

Tool descriptions and the returned `guidance` field carry the core [CLIENT_WORKFLOW.md](docs/CLIENT_WORKFLOW.md) steps to the calling ChatGPT: fetch the article, verify identity, disclose simulation, retain the QID, and report browsing failures honestly. This is an integration hint, not proof that a particular ChatGPT surface will browse; complete real-client acceptance tests separately. See [SITES_HANDOFF.md](docs/SITES_HANDOFF.md).

Host/Origin restrictions, strict schemas and actual-byte limits are implemented. **Authentication where required, platform rate limits/concurrency/deadlines, real ChatGPT browsing, publishing and third-party access remain deployment acceptance gates.** Do not equate green CI or a public repository with a deployed public MCP endpoint.

## Rights and safety

Wikidata structured data uses CC0; linked text/media and underlying characters have separate rights. Linking is not blanket permission for every downstream reuse. Disclose simulation, cite sources, avoid fabricated verified quotations, and treat retrieved text as untrusted data. No affiliation with Wikimedia or represented people/rights holders is claimed.

Code: MIT. See [SECURITY.md](SECURITY.md). No article bodies, images, audio, secret tokens or conversation transcripts are included.

## Landing page

The Japanese public LP and original generated brand images live in `public/`. The Sites build embeds all assets into the Worker; no separate host is used. `/mcp` and `/healthz` retain their own routing. The five-card browser demo uses original fictional archetypes, clearly separate from the live MCP. See [art direction](docs/ART_DIRECTION.md) and [release QA](docs/LP_RELEASE.md).


## Full-dump QID reservoir mode (optional, not yet deployed)

300 entries is the size of the approved **outage fallback**, not the draw ceiling. The Sites Worker now supports a QID-only, complete-Wikidata-dump reservoir (up to 250,000 QIDs per eligible kind). With a reviewed index installed, `both` draws kinds in proportion to eligible population counts from the complete scan, chooses a QID uniformly within its reservoir and refreshes that QID from live Wikidata. This does not cover every transitive fictional subclass, and a fixed finite reservoir is not the entire Wikidata corpus.

**This change does not ship a completed dump or an approved index.** Without one, Sites keeps bounded WDQS queries and still is not limited to 300. The new `/healthz.sampling_method` reports the actual method; `/healthz.fallback_catalog.entries` is the backup count. A full-dump scan, review, explicit GitHub commit and existing Site republish are separate release gates. See [index operations](docs/DUMP_INDEX_OPERATIONS.md).

## Deployment boundary: existing ChatGPT Sites only

The landing page, generated artwork and MCP remain at https://random-persona-mcp.unjuno.chatgpt.site. There is no independent Vercel, Railway or other hosting. The MCP implements no custom account, login, API key or OAuth. The ChatGPT Sites plugin nevertheless has platform-managed access checks; unauthenticated /mcp returned HTTP 401. An openly viewable LP is not proof that arbitrary external MCP clients can connect. The tool contract remains Wikidata QID + article links + shared browsing/roleplay guidance.


## Progressive persona cache in the existing Site (D1 up to 10GB)

OpenAI documents a 10GB per-Site limit for the D1 database. A new optional D1 adapter supports verified Wikidata QID/name/class/article-link metadata only, with **live Wikidata → D1 persisted references → the bundled 300-item emergency catalog** precedence. A successful live draw opportunistically refreshes D1. Fallback responses report `d1_cache_fallback` and `cache_checked_at`, not a claim of live retrieval.

**No D1 binding is provisioned by a GitHub commit.** Work/Sites must add a D1 binding named `DB` to the existing ChatGPT Site, run `migrations/0001_persona_cache.sql`, populate it through an owner-controlled storage workflow, and republish. If no binding exists, all existing behavior continues and health reports `cache_storage: not_configured`. Use a monitored 8GB operating ceiling rather than filling the 10GB database to capacity. Do not expose any anonymous database write endpoint. See [D1 cache operations](docs/D1_CACHE_OPERATIONS.md).

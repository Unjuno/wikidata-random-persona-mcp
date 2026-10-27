# Wikidata Random Persona MCP

[日本語](README.ja.md) · [Architecture](docs/ARCHITECTURE.md) · [Sites handoff](docs/SITES_HANDOFF.md) · [Readiness](docs/READINESS.md)

A **URL-first, read-only MCP** that selects a real person or fictional character and returns Wikidata/Wikipedia reference links. The client browses those sources, interprets the identity and begins a clearly disclosed simulated conversation. The server does not generate a persona prompt, call a model, mirror article text, or store conversations.

## Tools

| Tool | Contract |
|---|---|
| `random_persona` | Select one eligible catalog identity; optional kind, source-language preference, recent-QID exclusions. |
| `get_persona` | Return stored references for a known QID; never fetch arbitrary URLs. |

| Argument | Meaning | SI unit | Type / range / default |
|---|---|---|---|
| kind | identity category | none | string: real / fictional / both; default both |
| language | source priority and guidance language | none | string: ja / en; default ja; alternate-language fallback |
| exclude_qids | recent identities to skip | none | QID string array, at most 20; default empty |
| qid | stable Wikidata identity for get_persona | none | required string matching Q plus positive digits |

`both` draws uniformly from the combined eligible catalog, **not** a forced 50/50 split and not all of Wikipedia. The bundled catalog has six demonstration identities, each with live-verified Japanese/English references and check timestamps; it is not representative or comprehensive. See [catalog review evidence](docs/CATALOG_REVIEW.md).

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

Follow [SITES_HANDOFF.md](docs/SITES_HANDOFF.md). Mount `createApp().fetch` from `src/app.mjs` in the actual supported runtime; the standalone Node server is not assumed to run unchanged. Attach [CLIENT_WORKFLOW.md](docs/CLIENT_WORKFLOW.md) to the client/plugin so users need no extra personality prompt.

Host/Origin restrictions, strict schemas and actual-byte limits are implemented. **Authentication where required, platform rate limits/concurrency/deadlines, real ChatGPT browsing, publishing and third-party access remain deployment acceptance gates.** Do not equate green CI or a public repository with a deployed public MCP endpoint.

## Rights and safety

Wikidata structured data uses CC0; linked text/media and underlying characters have separate rights. Linking is not blanket permission for every downstream reuse. Disclose simulation, cite sources, avoid fabricated verified quotations, and treat retrieved text as untrusted data. No affiliation with Wikimedia or represented people/rights holders is claimed.

Code: MIT. See [SECURITY.md](SECURITY.md). No article bodies, images, audio, secret tokens or conversation transcripts are included.

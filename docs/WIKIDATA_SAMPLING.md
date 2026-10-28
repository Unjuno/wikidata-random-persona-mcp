# Wikidata-scale random catalog: not six hard-coded identities

## What was wrong
The published catalog originally contained exactly six hand-picked `data/seeds.json` QIDs. The runtime selected uniformly from those six, so describing it as random from all Wikidata was false. This implementation adds a new operator-side sampling pipeline that **does not depend on those seed QIDs**.

## Data path
1. Trigger the manual GitHub Actions workflow **Sample Wikidata dump for review**, or stream the official weekly JSON dump using the operator command below.
2. Stream and parse the entire dump (not a fixed first page), retaining at most N uniformly sampled eligible real people and N eligible fictional characters by reservoir sampling.
3. Keep only entities with real Wikipedia sitelinks (ja/en), labels, QIDs, and permitted HTTPS URLs. Do not persist copyrighted Wikipedia article text.
4. Inspect candidate size, classification coverage, provenance, failures, and SHA-256. The sampled artifact is **not published automatically**.
5. If accepting article links from the dump without separately verifying current Wikipedia article metadata, opt into the weaker provenance mode explicitly:
   `npm run catalog:promote -- --reviewed --expected-sha256 <64-hex-review-digest> --accept-unverified-dump-links`
   The default promotion path still requires `checked_at` verification.
6. Commit the approved `data/catalog.json`, run npm CI and `npm run build:sites`, then **sync/republish ChatGPT Sites**. A GitHub commit does not update the already deployed Site.
7. Test both MCP tools, random samples, source retrieval and dialogue in ChatGPT after republishing. Site `/healthz` reveals the active catalog version and number of entries.

## Operator command
```bash
set -euo pipefail
curl -fL --retry 2 -A 'RandomPersonaMCP/0.3 (+https://github.com/Unjuno/wikidata-random-persona-mcp)' \
  'https://dumps.wikimedia.org/wikidatawiki/entities/latest-all.json.gz' |
  node scripts/sample-wikidata-dump.mjs --gzip --per-kind 1000 --out data/catalog.pending.json
npm run catalog:validate -- data/catalog.pending.json
```

The command reads a **large weekly dump** over the network and can use significant bandwidth / runner minutes. Run it deliberately; it is NOT part of CI or an automated schedule. Test the script with synthetic fixtures before a large run. A truncated, invalid or unfinished dump must not replace the live catalog.

## Sampling and coverage disclosure
- This produces a **stratified sample from the eligible subset of a complete Wikidata dump**, not an index of every person in Wikidata. It samples real and fictional identities separately to ensure both categories appear.
- Real: direct best-ranked `P31=Q5`. Fictional: direct best-ranked `P31` from a reviewed set including character, fictional human, anime/manga, film, literary and comics character classes. The complete transitive `P279` subclass graph is **not yet covered**. Some fictional identities will be missed.
- Only entries with Japanese or English Wikipedia sitelinks qualify; items without either are intentionally excluded.
- Sampling is uniform **within each eligible category** using reservoir sampling on the dump stream. The existing `both` tool draws uniformly over the selected catalog, so if the saved samples have equal sizes, real/fictional exposure is close to 50/50. It is NOT a uniform draw from all Wikidata QIDs.
- The dump's sitelinks are not proof that an article is still accessible or suitable for simulation. When using `--accept-unverified-dump-links`, this limitation must appear in product documentation. The client should verify before roleplay and handle failure.
- Streaming RAM use is proportional to the sample size plus one entity; the full dump is not stored by this script. Cap stage JSON at 20 MiB to protect the Sites bundle. Worker deployment limits must be verified with the actual Sites platform.

Official Wikidata advice: https://www.wikidata.org/wiki/Wikidata:Data_access/en and https://www.wikidata.org/wiki/Wikidata:Database_download

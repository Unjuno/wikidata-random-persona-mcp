# Reviewed Wikidata bootstrap catalog (2026-10-28)

## Production issue addressed
The initial random-persona service drew from six hand-picked QIDs. This violated the intended Wikidata-sourced discovery experience. The replacement pipeline now builds a larger reviewed candidate using Wikidata P31 category queries and a separate whole-dump reservoir sampler.

## Approved bootstrap evidence
- Source: Wikidata direct-P31 class query plus Wikidata structured metadata (labels, descriptions, ja/en sitelinks), **not** manually selected six seeds.
- Initial staging: [GitHub Actions run 40653402575](https://github.com/Unjuno/wikidata-random-persona-mcp/actions/runs/40653402575).
- Exact uncompressed candidate SHA-256: `b0c793536d5adfdc1bfbf461377e2afb2899b7037a98bc7a01755605b540ab08`.
- Approval: [GitHub Actions run 40654190698](https://github.com/Unjuno/wikidata-random-persona-mcp/actions/runs/40654190698) — verified the exact digest, 150 real plus 150 fictional items, and catalog validation.
- Published catalog version **in the Git branch**: `published-bootstrap-2026-10-28T07:59:22.623Z`.
- **300 unique QIDs, 150 real, 150 fictional**, no copied article text or media.
- The candidate was approved with an explicit opt-in to unverified current Wikipedia links. It was **not** checked for full article accuracy, roleplay suitability, or global uniformity.
- On the Site, verify `/healthz` after syncing the updated main branch; a GitHub branch commit alone is not deployment.

## Sampling limitations
- This first bootstrap is **not** uniform over all of Wikidata. Query limits restrict which P31 members are considered, and only ja/en Wikipedia sitelinks are eligible. P279 subclass closure is not complete.
- The whole-dump stream reservoir sampler supports a more representative, full-scan sample within supported P31 classes; run it separately with a suitable runner and monitor the completed scan.
- Approved QIDs are not guaranteed to have live or sufficiently detailed articles; the client must verify each link before beginning a simulation and stop if the source cannot be read.

## Deployment checks remaining
- CI success **on the 300-entry commit**, with Sites-worker bundle and real HTTP/MCP tests.
- Merge code and approved catalog to main after tests and review.
- Republish ChatGPT Sites using `npm run build:sites`; confirm `/healthz` reports 300.
- Test ChatGPT's `random_persona`, `get_persona`, article reading, and simulation; then separately test access from a second account.

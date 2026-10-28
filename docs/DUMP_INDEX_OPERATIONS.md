# Wikidata full-dump QID index: build, review, deploy

## Purpose

The six-item seed and later 300-item catalog were never the complete selection universe. 300 is an outage fallback only. The bounded per-draw WDQS query currently biases draws toward its limited window. This index mode uses a secure reservoir from a **complete** official Wikidata JSON dump for a much broader, more defensible selection.

## How it works

1. Stream the entire official JSON dump, through its closing bracket. Consider entries with recognized direct P31 person/fictional classes and ja/en Wikipedia sitelinks. Full P279 subclass closure is not implemented.
2. Maintain independent QID-only reservoirs for real and fictional. No article text, generated personality or private chat data is stored.
3. Count the whole eligible population by kind. A `both` draw weights the category by its observed eligible population, then chooses a random sampled QID.
4. Ask the live Wikidata Action API for the selected QID to verify current classification and article URLs. Retry at most two stale index entries; fail over transparently if Wikidata is inaccessible.

**Sampling qualification:** reservoir selection is uniform within each specifically recognized eligible category when the complete dump is scanned. A finite reservoir is still finite: individual requests choose among its stored QIDs, not every Wikidata QID. This is not a claim of full Wikidata or all fictional subclasses.

## Manual data creation (very large download)

The official JSON dump is enormous; Wikimedia documentation has referenced a compressed snapshot exceeding 100 GiB. Do not run a full download automatically or on every API request. Use sufficient bandwidth, compute and budget, and monitor any manually dispatched runner. Official guide: https://www.wikidata.org/wiki/Wikidata:Database_download

```bash
set -euo pipefail
curl --fail --location --retry 2 \
  --user-agent 'RandomPersonaMCP/0.5 (+https://github.com/Unjuno/wikidata-random-persona-mcp)' \
  'https://dumps.wikimedia.org/wikidatawiki/entities/latest-all.json.gz' \
  | node scripts/sample-wikidata-index.mjs --gzip --per-kind 100000 --out data/persona-index.pending.json
```

The script requires the complete JSON terminator and both eligible categories before it writes anything. It enforces a 12 MiB output bound and prints the exact SHA-256 of the output file. A truncated stream cannot be approved.

## Manual reviewed promotion

Review the source dump, direct class coverage, excluded cases, sampled QIDs, population counts, output size and exact SHA-256. Do not promote a synthetic fixture. Then:

```bash
npm run catalog:index-promote -- --reviewed --expected-sha256 <64-character-reviewed-SHA256>
npm run check
npm test
npm run build:sites
```

Promotion backs up the previous approved QID index and never overwrites `data/blocked-qids.json`. Commit the actual reviewed `data/persona-index.json`, verify GitHub Actions, and republish the **existing** ChatGPT Site rather than creating another hosting service.

## Deployment acceptance

- `GET /healthz` reports `sampling_method: wikidata_dump_reservoir` and the correct `index_version` / `eligible_population`.
- `fallback_catalog.entries` reports the standby catalog size separately; the unqualified top-level `entries` no longer appears.
- `random_persona` results include `source_mode: wikidata_live`, `sampling_method: wikidata_dump_reservoir`, and a QID refreshed from the Wikidata API, with no WDQS query on that request.
- Test both kinds, exclusions, current-QID failures, Wikimedia outages and ChatGPT fetching the returned article before a disclosed simulation.

**This branch does not include a completed full-dump scan or an approved production QID index.** Without it, the existing bounded WDQS live mode remains active; do not claim new index coverage until real deployment and testing.

References: https://www.wikidata.org/wiki/Wikidata:Data_access/en and https://www.wikidata.org/wiki/Wikidata:Database_download

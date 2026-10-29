# Readiness and remaining gates

Updated 2026-10-28. This is a deployed LP and working owner-connected live MCP; unrestricted third-party plugin distribution is not verified, so full public-product completion is not claimed.

## Implemented and checked

- Existing Site only: https://random-persona-mcp.unjuno.chatgpt.site, with `/mcp` and `/healthz` preserved.
- Japanese discovery LP, eight original generated illustrations, separate mobile hero, responsive WebP assets, accessible card demo, FAQ, source/rights disclosures. Local demo figures are explicitly original fiction, separate from Wikidata draws.
- Sites Worker requests live Wikidata P31 search and entity metadata; any eligible QID can be retrieved, including Q7259 outside the 300-entry fallback. No server LLM, article-body store, conversation store or arbitrary URL fetch.
- Exact Host/Origin checks; Sites MCP authentication; 128 KiB / 5-second request-body limit; 2 MiB / 10-second upstream limit; manual non-following redirects compatible with Cloudflare Workers. Per-isolate 120 MCP requests/minute, 60 upstream requests/minute and four concurrent upstream operations. These are not distributed global quotas.
- Only random_persona and get_persona; official SDK Client 2.4 verifies legacy initialize and modern discovery over real local HTTP. JSON-RPC batches are rejected, notifications never execute tools. Modern result envelopes include resultType and list cache metadata.
- The latest local suite has 116 unit, asset, security and official-client tests. CI runs syntax, catalog validation and tests on Node 22/24. Verify the latest commit's Actions result; historical green runs do not certify later code.

## Production evidence

On Site version 4, owner-connected ChatGPT calls returned:

| Test | Observed result |
|---|---|
| random_persona, real | Q33749, Ivan Alev, wikidata_live, 2026-10-28T10:06:14.111Z |
| random_persona, fictional | Q918010, Tyushtya, wikidata_live, 2026-10-28T10:06:04.234Z |
| get_persona outside fallback | Q7259, Ada Lovelace, wikidata_live, 2026-10-28T10:05:42.300Z |
| Missing QID | Q999999999999 -> not_found, wikidata_live |
| Non-person | Q1 -> not_found, wikidata_live |
| Invalid input | Q0 -> isError, invalid argument |
| Redraw with both recent QIDs excluded | Q303, distinct from both; catalog_fallback because the upstream entity response exceeded the size cap |

The live response-size event motivated reducing the metadata batch from 12 to 4 identities. Regression coverage proves that even oversized search results cannot increase the four-entity batch. The safety cap remains enforced.

The same ChatGPT conversation retrieved the returned English Ivan Alev and Tyushtya articles and Japanese Ada Lovelace article. It then began separate disclosed simulation test openings for the real/fictional random subjects, clearly separating article facts/legend from newly written dialogue. Tyushtya's translation/citation notices were acknowledged. This is actual tool-and-browsing evidence in this task conversation, not a new-chat trigger test or the full 30×5 acceptance campaign.

Unauthenticated POST /mcp returned 401; hostile Origin returned 403. Sites reports has_mcp=true. Published HTML and all 18 assets returned 200, and asset bytes matched the repository. The public health fingerprint matched the source build. Source trees in GitHub and Sites are compared before saving each release.

## Still not verified

- A second account installing and calling the private Site-generated plugin. Public Site visibility is separate from plugin distribution; no unrestricted public install link is advertised.
- Physical iOS/Android devices. Desktop browser and 390px iframe viewport were checked; the latter is a responsive browser simulation, not a phone hardware test.
- Independent fresh-chat natural-language trigger selection, long multi-turn persona retention, every article-browsing failure mode, and the full CLIENT_WORKFLOW acceptance campaign.
- Platform-wide rate/concurrency quotas and sustained traffic/latency benchmarks. Per-isolate limits are intentionally described precisely.

Wikidata classification/coverage is bounded and not globally uniform. Upstream failures can produce explicit catalog_fallback; successful tests do not imply every subsequent draw is live. The fallback catalog has 150 real and 150 fictional identities. The optional Node adapter remains catalog-only.


## Correction to the 300-entry interpretation

The user-facing LP now explains that 300 is a **fallback** count, not the number of possible Wikidata persons. The optional QID-only full-dump reservoir code and its population-weighted selection are implemented and unit-tested, but an actual complete dump has **not** been processed or approved by this change. Until a real index is committed and the existing Site republished, the production method remains the nonuniform bounded WDQS search. The method must be checked in `/healthz.sampling_method` rather than inferred from the code.

## Independent cross-client public MCP

Implemented `src/public-mcp.mjs` and Vercel Node API routes for an anonymous Streamable HTTP MCP, with `random_persona`, `get_persona`, the reusable `start_random_persona` prompt, live Wikidata URL metadata and `roleplay_prompt`. The original Site and LP stay on ChatGPT Sites. GitHub tests are not evidence of actual external public deployment; verify the production URL, 200 health and a real SDK call without Authorization before claiming this release.

# Landing page release / 2026-10-28

Target: existing https://random-persona-mcp.unjuno.chatgpt.site only. The repository contains the LP at `/`, static brand assets, and the Wikidata-live MCP at `/mcp`. `/healthz` reports fallback catalog size, live-capable mode and a reproducible runtime/asset fingerprint. No alternate hosting or separate Site is used.

## Local release checks

- Syntax, 300-record fallback catalog validation, unit/security and official-client protocol tests run with the lockfile. Node 22/24 are the required CI matrix.
- Built Worker tested with official MCP Client 2.4 over real local HTTP in both legacy and modern modes. Mock upstream tests are explicitly distinct from production Wikimedia tests.
- Fault injection checks `catalog_fallback`, `upstream_unavailable`, exclusions, invalid input, response bounds, timeouts, cooldowns and missing/ambiguous identity behavior.
- Original generated imagery is included in the build. HTML references, internal anchors, image alternative text, canonical/OG metadata, CSP, MIME types, HEAD/ETag and separated MCP routes have automated coverage.
- Browser preview inspected at desktop 1363px and a 390px iframe viewport (375px content after scrollbar). Dedicated mobile hero selected correctly; no horizontal document overflow. Card demo and redraw exercised. This is a browser viewport simulation, not a physical handset test. One preview image-load failure displayed the correct error; a reload and subsequent draw succeeded.
- Real Wikimedia smoke reads fetched both real and fictional identities. Q7259 (Ada Lovelace), absent from the 300-record fallback, resolves live. Upstream latency varies; safety timeouts can trigger transparent fallback.

## Access and scope

The LP is publicly viewable. Sites authenticates MCP callers and checks Site access before forwarding requests. Exact Host/Origin guards, body limits and isolate-local request/upstream budgets remain enabled. The browser demo has no MCP proxy and stores no conversation state. There is no server-side LLM, article-body store, or arbitrary URL-fetch tool.

Public Site visibility is separate from plugin distribution. The plugin created by Sites belongs to the owner; no second account is available in this work session. An unrestricted public plugin install URL is deliberately absent from the LP. Global/distributed traffic quotas and physical mobile device testing are not claimed.

Final publication, owner ChatGPT tool calls, article reading, and live endpoint fingerprint comparison must be recorded after deployment. A passing local or CI test alone is not a completed deployment.

## Observed publication and end-to-end results

Site version 4 was published successfully on 2026-10-28. The owner-connected ChatGPT plugin executed both tools; live real Q33749, fictional Q918010 and uncataloged Q7259 were returned. Wikipedia article content was retrieved by ChatGPT and two clearly labeled simulation openings were produced. Missing/invalid/non-person QIDs and exclusion redraw were checked. See `READINESS.md` and `qa/mcp-smoke.json` for scoped evidence.

The initial deployment exposed a genuine Sites adapter defect: `fetch` with redirect=error is unsupported by Cloudflare Workers. It was corrected to manual redirects with explicit non-2xx rejection and regression coverage. A later oversized entity response exercised real catalog_fallback and prompted a smaller four-entity batch.

Published assets (all 18 files under /assets/) were fetched and byte-compared with local source, including the mobile hero and all five category images. Public browser demo draw/redraw, prompt-copy feedback and FAQ expansion passed. Public desktop and mobile-width preview screenshots are in `qa/`; mobile is not a physical-device claim. The static build rejects missing or empty assets. MCP calls without authentication returned 401; the Site remains public without exposing an unauthenticated MCP proxy.

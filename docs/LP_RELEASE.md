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

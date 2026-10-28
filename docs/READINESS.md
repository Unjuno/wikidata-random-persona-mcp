# Readiness and remaining gates

## Implemented

- URL-first offline selection and QID lookup; strict input schemas and real/fictional/language/exclusion behavior.
- Independent suspensions, immutable snapshots and copied source objects.
- Guarded Fetch entry for runtime adaptation, measured 128 KiB body limit, exact Host/Origin allowlists, JSON-only POST, no-store responses.
- Official SDK integration tests over actual TCP, including legacy initialize, both tools, concurrency and invalid input.
- Metadata-only staging, identity/page validation, bounded retries, respectful maxlag/Retry-After handling.
- Digest-bound reviewed promotion, backup, atomic replacement and local writer lock. No auto-promote or auto-deploy.
- Locked dependency graph with npm ci; Node 22/24 CI.
- Source of the original six-item demo is live-reviewed. A larger, directly sourced Wikidata candidate is staged separately; **no deployment claim until Sites is explicitly republished**.
- Client workflow, source-insufficiency recovery and Sites handoff documented.

## Evidence

- Runtime hardening and real protocol tests: https://github.com/Unjuno/wikidata-random-persona-mcp/actions/runs/40585254053 — 51 tests, both Node 22 and 24 jobs succeeded. Node 22 log reports 22.23.4, server/client 2.4.0, node adapter 2.1.2, Zod 4.6.7.
- Catalog lifecycle and locked dependencies: https://github.com/Unjuno/wikidata-random-persona-mcp/actions/runs/40586422062 — CI succeeded for commit 43fa3fcd4855fda9ebcc8160e84d2abb87a52a99.
- Actual metadata staging: https://github.com/Unjuno/wikidata-random-persona-mcp/actions/runs/40586422207 — succeeded; exact reviewed candidate digest recorded separately.
- Run the current branch's CI after any source/data change; earlier green runs do not prove later revisions. Local container tests use Node 22.16.0 for pure/unit tests only; SDK dependencies were verified in Actions because the local container has no external network.
- Sites Worker acceptance on 2026-10-28: 77 automated tests pass locally, including discovery, exactly two tools, real/fictional draws, QID lookup, invalid inputs, missing IDs, hostile Host/Origin and streamed 128 KiB limit. The published Site reports `has_mcp: true`; its public page and `/healthz` were opened successfully. Live MCP `tools/call` from ChatGPT was not verified.

## Remaining gates / not claimed

| Gate | Status |
|---|---|
| Sites runtime adapter and public endpoint | Published at https://random-persona-mcp.unjuno.chatgpt.site; MCP endpoint is https://random-persona-mcp.unjuno.chatgpt.site/mcp. Sites reports `has_mcp: true`. A live MCP call through ChatGPT remains unverified. |
| Edge controls | Exact Host/Origin validation and 128 KiB body cap are deployed. Sites applies visitor authentication/access checks before MCP dispatch. No account-level rate/concurrency quota was available to confirm through the Sites controls. |
| ChatGPT browsing and dialogue | Worker/SDK tests do not prove the same ChatGPT chat can browse and interpret the returned article. The browser session used for this task was signed out; run CLIENT_WORKFLOW acceptance trials in the owner's signed-in ChatGPT. |
| Third-party access and general distribution | Site audience is public. A second account has not installed or called the Site plugin; plugin sharing remains separate from Site visibility. |
| Broad catalog coverage | The six-identity demo was inadequate. A bounded Wikidata API bootstrap and a separate streaming full-dump sampler are implemented, but neither is a complete fictional subclass closure or globally uniform sample of Wikidata. |

No CPU/latency benchmark or psychological fidelity measurement is claimed. SDK JSON-response-mode warnings about dropping intermediate notifications are expected for these single-result tools; no progress notifications are used. Current Actions v4 may emit a runner Node-version deprecation warning; that is separate from the explicitly selected Node 22/24 application tests.

## Completion rule

Repository implementation passes when the final commit's syntax, catalog and unit/protocol CI pass. Product release passes only after the actual Sites endpoint, end-to-end ChatGPT dialogue, access controls and intended third-party distribution are all checked. A documented gate is not a passed gate.

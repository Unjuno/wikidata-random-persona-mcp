# Readiness and remaining gates

## Implemented

- URL-first offline selection and QID lookup; strict input schemas and real/fictional/language/exclusion behavior.
- Independent suspensions, immutable snapshots and copied source objects.
- Guarded Fetch entry for runtime adaptation, measured 128 KiB body limit, exact Host/Origin allowlists, JSON-only POST, no-store responses.
- Official SDK integration tests over actual TCP, including legacy initialize, both tools, concurrency and invalid input.
- Metadata-only staging, identity/page validation, bounded retries, respectful maxlag/Retry-After handling.
- Digest-bound reviewed promotion, backup, atomic replacement and local writer lock. No auto-promote or auto-deploy.
- Locked dependency graph with npm ci; Node 22/24 CI.
- Live-reviewed bilingual six-identity catalog; see CATALOG_REVIEW.md.
- Client workflow, source-insufficiency recovery and Sites handoff documented.

## Evidence

- Runtime hardening and real protocol tests: https://github.com/Unjuno/wikidata-random-persona-mcp/actions/runs/40585254053 — 51 tests, both Node 22 and 24 jobs succeeded. Node 22 log reports 22.23.4, server/client 2.4.0, node adapter 2.1.2, Zod 4.6.7.
- Catalog lifecycle and locked dependencies: https://github.com/Unjuno/wikidata-random-persona-mcp/actions/runs/40586422062 — CI succeeded for commit 43fa3fcd4855fda9ebcc8160e84d2abb87a52a99.
- Actual metadata staging: https://github.com/Unjuno/wikidata-random-persona-mcp/actions/runs/40586422207 — succeeded; exact reviewed candidate digest recorded separately.
- Run the current branch's CI after any source/data change; earlier green runs do not prove later revisions. Local container tests use Node 22.16.0 for pure/unit tests only; SDK dependencies were verified in Actions because the local container has no external network.

## Not completed / not claimed

| Gate | Why it still requires an actual deployment |
|---|---|
| Sites runtime adapter and public endpoint | No Site or actual endpoint has been created by these commits. Bundler/storage/route integration must be checked in the user's Sites environment. |
| Edge controls | Host/Origin validation is not authentication, abuse prevention or a distributed rate limiter. Configure actual platform quotas/deadlines/access controls. |
| ChatGPT browsing and dialogue | SDK tool success does not prove the same ChatGPT chat can browse and interpret the returned article. Run CLIENT_WORKFLOW acceptance trials. |
| Third-party access and general distribution | Site sharing and plugin sharing are separate. Test another account; verify current account/product restrictions and directory requirements. |
| Broad catalog coverage | Six manually selected identities are a demo, not a representative or exhaustive corpus. Review seeds before expanding. |

No CPU/latency benchmark or psychological fidelity measurement is claimed. SDK JSON-response-mode warnings about dropping intermediate notifications are expected for these single-result tools; no progress notifications are used. Current Actions v4 may emit a runner Node-version deprecation warning; that is separate from the explicitly selected Node 22/24 application tests.

## Completion rule

Repository implementation passes when the final commit's syntax, catalog and unit/protocol CI pass. Product release passes only after the actual Sites endpoint, end-to-end ChatGPT dialogue, access controls and intended third-party distribution are all checked. A documented gate is not a passed gate.

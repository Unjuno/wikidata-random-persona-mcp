# URL-first MCP readiness implementation plan and execution ledger

Goal: complete actual MCP HTTP tests, bounded metadata-only staging and reviewed promotion, then prepare a Sites handoff without changing the approved URL-first scope.

Architecture: pure selection core, immutable catalog plus independent suspensions, two read-only tools, guarded Fetch adapter. Operator-side metadata requests are separate from the network-free serving runtime. Client performs retrieval and conversation.

## Tasks
- [x] Reproduce URL/language/source-copy and streamed-body defects with failing tests, then fix.
- [x] Add independent suspension list and immutable snapshot with empty-pool handling.
- [x] Verify official SDK client calls over real loopback HTTP, plus legacy initialization and invalid input.
- [x] Verify upstream metadata identity, disambiguation, section redirects and canonical allowed URLs; bound retries, response bytes and waits.
- [x] Stage separately and require exact reviewed candidate SHA-256; backup and atomically replace under a writer lock.
- [x] Lock dependencies and use npm ci in Node 22/24 CI.
- [x] Run live six-identity metadata verification and review its candidate; preserve data/verification provenance.
- [x] Document common client workflow, Sites adapter boundary and unpassed publication gates.
- [ ] Verify the final code/data/docs commit's CI and advance main only with an unchanged-head lease.
- [ ] Actual Sites deployment, ChatGPT browsing/conversation and second-account access (separate deployment phase).

## Evidence ledger
- Remote starting commit: bc3f1bf4c8ab0dc11af3806cfdbae965b4eff682.
- Runtime commit caa622fae9cd1ec0148641ff911c38db3daa0eca: CI run 40585254053, 51 tests, Node 22 and 24 success.
- Lifecycle commit 43fa3fcd4855fda9ebcc8160e84d2abb87a52a99: CI run 40586422062 succeeded; metadata run 40586422207 succeeded.
- Reviewed candidate SHA-256: 3c407fd0acf3bcbabee184e4b6d36ad9abdc927dcb51bfa5a318da7d038b1336. Six unchanged seed identities, verified ja/en references, no article bodies.
- Local pure/unit tests ran on Node 22.16.0; network-dependent SDK verification ran in GitHub Actions, not the offline local container.

Consumer instructions are documented in CLIENT_WORKFLOW.md rather than an assumed universal plugin manifest; attach them using the actual account's Sites/plugin facilities. No claim of completed public deployment is allowed from repository or CI status alone.

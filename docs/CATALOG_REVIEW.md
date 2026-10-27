# Catalog review evidence — 2026-10-28 JST

## Source and checks

The metadata staging job ran against Wikimedia, not fixture responses:
- Run: https://github.com/Unjuno/wikidata-random-persona-mcp/actions/runs/40586422207
- Code: 43fa3fcd4855fda9ebcc8160e84d2abb87a52a99
- Artifact: reviewed-candidate-required, ID 12770939165
- Candidate SHA-256: `3c407fd0acf3bcbabee184e4b6d36ad9abdc927dcb51bfa5a318da7d038b1336`
- Candidate version: candidate-2026-10-27T21-24-05-526Z
- Promoted data version: published-2026-10-27T21-24-05-526Z (a catalog version, NOT proof of a published website)

The implementation agent reviewed the unchanged six seed QIDs, category assignments, Japanese labels, allowed canonical article links and check timestamps under the owner's implementation request, then ran digest-bound promotion. No unattended promotion workflow was added.

| QID | Name | Kind | Verified article languages |
|---|---|---|---|
| Q42 | ダグラス・アダムズ | real | ja / en |
| Q7259 | エイダ・ラブレス | real | ja / en |
| Q937 | アルベルト・アインシュタイン | real | ja / en |
| Q51746 | ルーク・スカイウォーカー | fictional | ja / en |
| Q51730 | ヨーダ | fictional | ja / en |
| Q552682 | 初音ミク | fictional | ja / en |

The checks covered Wikipedia namespace, missing/disambiguation/section-redirect exclusion, canonical host and exact wikibase_item correspondence. There were six retained identities, twelve article links and six identity links. Only metadata was fetched; no article prose or media was read or persisted by the server pipeline. Timestamps in catalog.json describe metadata checks, not a guarantee of future availability or factual accuracy.

This is a six-identity demonstration catalog. Wider coverage, subjective narrative suitability, rights review and actual ChatGPT conversation remain separate decisions. Tests use test/fixtures/catalog.json so routine catalog metadata updates cannot invalidate unit-test assumptions.

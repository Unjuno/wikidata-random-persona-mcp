# Architecture / 技術仕様 v0.1

## Independent pipelines

A. Operator: seed QIDs → Wikidata `wbgetentities` → normalize → pending catalog → human review → promote → GitHub → republish Site.

B. Read-only MCP: `random_persona` or `get_persona` → validate inputs → choose from approved catalog → return QID, ranked source URLs, catalog version, and workflow guidance.

C. MCP consumer: tool result → browser fetch of article → verify identity and adequate evidence → distinguish facts from interpretations and creative speech → clearly labeled simulated conversation.

Pipeline C runs **in the client**, not this server. A client lacking browsing must never claim to have read the linked material. The server does not persist user conversations.

## Catalog

One row per unique Wikidata QID: `{qid,kind,name,description?,sources:[{url,language,purpose}]}`. Source URLs are HTTPS Wikipedia ja/en articles and `https://www.wikidata.org/wiki/QID`. Articles are **linked only**, never mirrored.

The example has 6 hand-selected entries and is not statistically representative of Wikidata. `kind=both` samples uniformly over the remaining approved catalog entries; it is not a forced 50/50 split.

## Validation / security

- QIDs are unique; do not construct Wikipedia article links from names. Use official Wikidata sitelinks.
- Allowed hosts: `ja.wikipedia.org`, `en.wikipedia.org`, `www.wikidata.org`. No arbitrary URL fetch tool.
- Seed verification checks P31=Q5 for directly marked real people, and obvious contradiction for fictional entries. It is not a full subclass reasoner.
- The refresh is bounded/manual. Candidate catalog publication requires explicit review.
- Strict article redirects and disambiguation detection need additional engineering before broad scale.
- Source text is untrusted and must never override agent instructions.
- The web MCP handler has no built-in auth, Host/Origin validation, or rate limiting; the hosting runtime must enforce its own protections.
- Network calls are made in catalog maintenance, not during random selection.

## Release gates

Domain: 21 core tests; MCP integration: initialize, tools/list, tools/call, invalid args; HTTP integration: /healthz and Host/Origin checks; ChatGPT end-to-end: source retrieval confirmed, no fake browsing claims, simulation disclosed and character maintained across turns.

Site sharing to independent outside accounts and official public plugin submission eligibility must be verified separately.

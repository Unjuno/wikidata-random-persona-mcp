# Anonymous public Random Persona MCP

## Objective

Make the Wikidata random-persona discovery and URL-first roleplay flow accessible to any compatible AI host without a project-specific account, API key, OAuth or cookies. The caller retrieves articles and conducts the clearly disclosed simulation.

## Split hosting

- LP and generated images: https://random-persona-mcp.unjuno.chatgpt.site (unchanged).
- Site-managed plugin: existing ChatGPT Sites `/mcp` (may be protected by the platform, not an anonymous endpoint).
- Public independent Streamable HTTP MCP: a separate Vercel project with `/mcp` and `/healthz`; the Vercel root redirects to the LP.
- `.vercelignore` excludes the LP assets and Sites runtime from the external service deployment.

## Contracts

- `random_persona`: kind real/fictional/both, language ja/en, recent QID exclusions; live Wikidata selection and a labeled fallback if the source is unavailable.
- `get_persona`: live Wikidata lookup for a valid QID, including QIDs outside the 300 cached identities.
- MCP prompt `start_random_persona`: optional prompt for clients that expose MCP Prompts.
- Successful tool results include the name, QID, Wikipedia/Wikidata article URLs, `source_mode`, `guidance` and `roleplay_prompt`.

## Anonymous deployment

Host only the read-only MCP Node functions on Vercel. Use a production deployment accessible without deployment protection or OAuth. Configure `PUBLIC_MCP_HOSTS` to the exact public domain if different from the default. Optional `PUBLIC_MCP_ORIGINS` is a comma-separated exact browser-origin allowlist. Origin-less desktop/server MCP clients are supported. Never put secret tokens in a prompt or Git repository.

Test `GET /healthz`, `tools/list`, `prompts/list`, `random_persona` and `get_persona` using an MCP SDK client with **no Authorization header**. HTTP 401 on the original Sites plugin is unrelated to the new external endpoint.

## Safety and limitations

Strict Host/Origin checks, 128 KiB input limit, bounded Wikidata JSON responses and upstream Retry-After are enforced. Local rate limits are **per serverless instance**, not a globally distributed quota. For broad public traffic, configure platform-level abuse protection. The live selector still uses bounded P31 class queries; do not describe it as uniformly random over all Wikidata. The 300-item catalog is a transparent outage fallback, not the source universe.

## Live endpoint

Deployment and external unauthenticated-client verification pending. Record the actual URL, deployed commit, production protection state and test evidence here after publication.

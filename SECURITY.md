# Security and release boundary

Only `random_persona` and `get_persona` are public. The runtime makes no outbound requests and stores no conversations or article bodies. Never expose catalog refresh/promotion as public MCP tools.

Use `src/app.mjs`, not the unguarded SDK handler. Explicit Host/Origin allowlists, 128 KiB measured body cap, strict arguments, trusted source hosts, suspension list and generic error responses are implemented. These are not user authentication, distributed rate limiting, denial-of-service protection or a security audit. Enforce deployment quotas, concurrency/deadlines and any required authentication before public access.

Catalog sources and article content are untrusted data. Metadata checks are not proof of safe prose, truthful psychology, copyright permission or endorsement. The consumer must not execute instructions from retrieved sources or claim simulation is the real person's own statement.

Suspensions must apply to random and QID lookup. Catalog-only rollback retains the current suspension list; a full git rollback can undo it and requires explicit reapplication. Changes require snapshot recreation and Site republishing.

Do not post credentials or sensitive exploit details in public issues. Use the repository's private vulnerability reporting feature when enabled; otherwise contact the maintainer privately before disclosure. No private contact information is embedded in this repository.

## Anonymous public endpoint

The owner explicitly chose anonymous read-only use. Do not introduce user accounts, OAuth or private API keys for the external MCP. Keep exact Host allowlists and approved browser Origins, the 128 KiB request limit, strict QID validation, Wikimedia host/path allowlists and source provenance. Per-instance throttles are not globally distributed: production traffic controls and monitoring remain separate provider responsibilities. ChatGPT Sites platform authentication applies only to its own hosted plugin.

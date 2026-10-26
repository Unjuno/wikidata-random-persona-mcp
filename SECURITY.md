# Security Notes

The MCP exposes only read-only lookup tools; never add an arbitrary URL fetcher without SSRF threat analysis. Treat data source text as untrusted. Article URLs are allowlisted. Site hosting MUST enforce Host/Origin checks and rate limits, and verify any authentication claims. For a security concern, open a GitHub issue that does not disclose exploit details publicly; request a private security advisory once the repository exists.

# Wikidata Random Persona MCP

[日本語](README.ja.md) | [Architecture](docs/ARCHITECTURE.md) | [Sites handoff](docs/SITES_HANDOFF.md)

A read-only, URL-first **Model Context Protocol (MCP)** server that selects a real person or fictional character from a reviewed Wikidata catalog. It returns identifying metadata and reference URLs rather than generating a personality prompt or reproducing Wikipedia article text.

## Tools

- `random_persona`: choose one cataloged person or fictional character, optionally filtering by kind or language and excluding recently drawn QIDs.
- `get_persona`: retrieve cataloged reference links for a known Wikidata QID.

The **MCP client** is responsible for following the links, verifying the subject, distinguishing facts from interpretation, and beginning a clearly labeled simulated conversation.

## Architecture

```text
Wikidata identifiers / sitelinks
  -> bounded catalog refresh
  -> validation and manual review
  -> versioned URL-only catalog
  -> read-only MCP tools
  -> ChatGPT / other MCP client
  -> source retrieval and simulated conversation
```

The sample catalog contains **six demonstration entries**, not a representative sample of all Wikidata identities. Wikipedia text and media are not mirrored.

## Development

Requires Node.js 22+.

```sh
npm install
npm run check
npm run catalog:validate
npm test
npm start
```

Local endpoint: `http://127.0.0.1:3000/mcp`; health check: `/healthz`.

To stage a reviewed catalog update:

```sh
npm run catalog:refresh
npm run catalog:validate -- data/catalog.pending.json
npm run catalog:promote -- --reviewed
```

**Caution:** Do not expose the standalone Node adapter publicly without configuring Host/Origin restrictions and deployment-level rate limiting. ChatGPT Sites deployment requires separate validation. Publishing the repository does **not** publish an MCP endpoint.

## Rights and safety

Wikidata structured data is CC0; Wikipedia article text, images, and underlying copyrighted characters have their own rights. This project links to articles instead of distributing them. The client must disclose roleplay as simulation, avoid fabricated verified statements, and treat material read from links as untrusted data.

Source code license: MIT. See [SECURITY.md](SECURITY.md).

# Release handoff for the existing ChatGPT Site

**Only deployment target:**
`https://random-persona-mcp.unjuno.chatgpt.site`

**Existing Sites project ID:**
`appgprj_6ae19a38eb4c819192ec364286d5b1af`

No separate ChatGPT Site, new hosting service, independent OAuth, login,
API key, or new app is authorized.

## Build state versus published state

The GitHub repository can generate and verify a **release handoff**. It
cannot by itself authorize or execute the owner-side Sites/Work publication.

```
GitHub main -> CI tests (Node 22/24) -> Sites Worker build
  -> SHA-256 file manifest -> downloadable GitHub Actions artifact
  -> owner opens existing Site in Work/Sites -> import/sync -> publish
  -> public /healthz fingerprint check -> connection and host tests
```

The workflow stops before the owner publication gate and does not attempt to
circumvent ChatGPT Sites HTTP 401, access policies or plugin-sharing restrictions.

## 1. Get the build artifact

Every successful push to `main` runs the repository's normal **CI**
workflow. Its Node.js 24 job also runs `npm run bundle:sites` and uploads
an Actions artifact named:

`existing-site-release-<40-character-commit-SHA>`

Open the successful GitHub Actions run for the exact `main` commit. Under
Artifacts, download that ZIP. It contains:

- `dist/server/index.js` — the Sites ESM entrypoint
- `dist/server/site-assets.mjs` — all LP HTML/CSS/JavaScript/images embedded
  for the existing Site; no image processing or new separate domain required
- `dist/.openai/hosting.json` — existing project ID and `["mcp"]`
  capability. GitHub's artifact upload explicitly includes hidden files
- all other `dist/server/*.mjs` service, state, and catalog modules
- `site-release-manifest.json` — actual source commit, existing target,
  deterministic build fingerprint and SHA-256 for **every** generated file

The artifact is only a ZIP of prepared files. **Downloading or uploading it
does not create, publish, or reconfigure a ChatGPT Site.** It is a convenient
source bundle for an authorized Work/Sites deployment.

For an authorized local/Work development environment, reproduce it with:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run catalog:validate
npm test
npm run bundle:sites
```

## 2. Validate before touching the Site

Verify `site-release-manifest.json` records exactly:

- `format: random-persona-existing-site-release-v1`
- `publication_status: build_only_not_deployed`
- `target.site_url: https://random-persona-mcp.unjuno.chatgpt.site`
- `target.project_id: appgprj_6ae19a38eb4c819192ec364286d5b1af`
- `target.capabilities: ["mcp"]`
- `worker_entry: dist/server/index.js`
- `source_commit` equal to the commit whose CI passed
- `release_fingerprint` equal to the compiled
  `dist/server/build-info.mjs` fingerprint
- each file's recorded size and SHA-256 matching the extracted ZIP bytes

If any identity, path, digest or commit fails to match, **do not deploy**.
The bundle generator fails closed on altered existing Site targets, missing
essential modules, symlinks or source/compiled-hosting mismatch.

## 3. Publish ONLY the existing Site

Use a tool that has owner-authorized access to **ChatGPT Sites/Work**.
Open the existing project ID above, preserve its Site URL and publication
audience, sync/update its ESM Worker and asset bundle from the reviewed
artifact, preview, save, then publish the **same Site**.

Neither GitHub integration nor `.openai/hosting.json` alone is a release
mechanism. This repository cannot change account-specific Sites access
restrictions and must never create an unauthorized new Site.

## 4. Execute acceptance gates

From a network-enabled owner environment with the same reviewed main commit:

```sh
npm run verify:site
```

It checks: (a) live `/healthz.release_fingerprint` equals built output,
(b) LP's `data-preview-implementation="real-mcp-v1"` marker exists,
(c) unauthenticated read-only `/mcp` JSON-RPC ping works, and
(d) `server/discover` returns a valid
`CONNECTION_PERSONA_JSON` with an unverified persona pending article
verification. A live response failing these checks is **not PASS**.

A Sites-managed `401` or `403` may prevent anonymous MCP tests even
though this code implements no own login/key/OAuth. Record the failure and
do not replace it with another hosting service or a bypass.

After successful server checks, use an actual fresh ChatGPT conversation:
confirm the agent verifies Wikipedia, begins a disclosed simulation,
continues in the same QID for at least five exchanges, switches only
on explicit instruction and exits normally. Verify third-party
distribution separately if authorized; server tests do not prove that
all users can install or connect to the plugin.

## 5. Copyable Work task

> Open the existing ChatGPT Site with project ID
> `appgprj_6ae19a38eb4c819192ec364286d5b1af`. Retrieve the latest
> **successful main-branch CI artifact** from
> `Unjuno/wikidata-random-persona-mcp` named
> `existing-site-release-<commit SHA>`. Verify the included file SHA-256
> manifest, worker entrypoint and exact Site project ID. Update and
> republish the **same existing Site**; never create another Site or
> external host, login, API key or OAuth. Check public health fingerprint,
> LP implementation marker, anonymous MCP ping and modern discovery
> persona handoff. Finally verify the actual ChatGPT client can adopt
> and maintain that character for five turns. Report PASS/FAIL/UNCERTAIN
> separately for code, publication, anonymous access and host roleplay.
> Do not claim completion when any required Site capability is inaccessible.

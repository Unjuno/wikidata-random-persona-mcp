/** Build-only release handoff; never calls a Site publication API. */
import {writeFile} from 'node:fs/promises';
import {generateSiteReleaseManifest} from '../src/site-release-bundle.mjs';

const sha=process.env.GITHUB_SHA||null;
const manifest=await generateSiteReleaseManifest({commit:sha});
await writeFile(new URL('../site-release-manifest.json',import.meta.url),
 JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({
 target:manifest.target.site_url,
 project_id:manifest.target.project_id,
 source_commit:manifest.source_commit,
 fingerprint:manifest.release_fingerprint,
 files:manifest.file_count,
 total_bytes:manifest.total_bytes,
 publication_status:manifest.publication_status
},null,2));

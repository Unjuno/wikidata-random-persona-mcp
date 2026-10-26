/** Convert Wikimedia wbgetentities results to our small, link-only catalog shape. */
import { isQid } from './core.mjs';

const BAD_WIKI_NAMESPACES = /^(?:Category|Template|Help|File|Wikipedia|Special|Portal|Draft|Module|List of|一覧[:：])/i;
const STRING_LIMIT = 160;
function cleanString(s, limit = STRING_LIMIT) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, limit);
}

export function normalizeEntity(entity, seed) {
  if (!entity || !isQid(entity.id) || entity.id !== seed.qid || !['real', 'fictional'].includes(seed.kind)) return null;
  const p31 = new Set((entity.claims?.P31 ?? []).map(c => c?.mainsnak?.datavalue?.value?.id).filter(Boolean));
  if (seed.kind === 'fictional' && p31.has('Q5')) return null;
  if (seed.kind === 'real' && !p31.has('Q5')) return null;
  const name = cleanString(entity.labels?.ja?.value || entity.labels?.en?.value);
  if (!name) return null;
  const sources = [];
  for (const language of ['ja', 'en']) {
    const title = entity.sitelinks?.[`${language}wiki`]?.title;
    if (typeof title !== 'string' || title.length > 250 || BAD_WIKI_NAMESPACES.test(title) || title.includes('#')) continue;
    sources.push({
      url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`,
      language,
      purpose: 'article'
    });
  }
  if (!sources.length) return null;
  sources.push({ url: `https://www.wikidata.org/wiki/${entity.id}`, language: 'mul', purpose: 'identity' });
  return {
    qid: entity.id,
    kind: seed.kind,
    name,
    description: cleanString(entity.descriptions?.ja?.value || entity.descriptions?.en?.value, 280),
    sources
  };
}

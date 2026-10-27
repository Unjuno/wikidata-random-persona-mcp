import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog, randomPersona, getPersona, isQid, isAllowedSourceUrl, secureRandomIndex, GUIDANCE } from '../src/core.mjs';
import { normalizeEntity } from '../src/wikidata.mjs';
const sample = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8'));
const cloned = () => structuredClone(sample);

test('catalog: supplied seed data is internally well formed', () => assert.equal(validateCatalog(sample), sample));
test('catalog: duplicate Wikidata QID is rejected', () => {
  const x = cloned(); x.entries.push(x.entries[0]);
  assert.throws(() => validateCatalog(x), /duplicate QID/);
});
test('catalog: URL must point to approved wikimedia hosts', () => {
  const x = cloned(); x.entries[0].sources[0].url = 'https://evil.example/wiki/Douglas_Adams';
  assert.throws(() => validateCatalog(x), /untrusted or malformed URL/);
});
test('catalog: URL with credentials or query is rejected', () => {
  assert.equal(isAllowedSourceUrl('https://user:pass@en.wikipedia.org/wiki/Foo', 'Q42', 'article'), false);
  assert.equal(isAllowedSourceUrl('https://en.wikipedia.org/wiki/Foo?edit=1', 'Q42', 'article'), false);
});
test('catalog: identity URL must match record QID', () => {
  assert.equal(isAllowedSourceUrl('https://www.wikidata.org/wiki/Q43', 'Q42', 'identity'), false);
});
test('catalog: entries must have article and identity URLs', () => {
  const x = cloned(); x.entries[0].sources = x.entries[0].sources.filter(s => s.purpose !== 'article');
  assert.throws(() => validateCatalog(x), /article and identity/);
});
test('catalog: invalid QID and control characters rejected', () => {
  assert.equal(isQid('Q0'), false); assert.equal(isQid('Q1'), true);
  assert.equal(isQid('Q1\n'), false);
  const x = cloned(); x.entries[0].name = 'not\naname';
  assert.throws(() => validateCatalog(x), /invalid name/);
});
test('random: draw from real category only', () => {
  const result = randomPersona(sample, {kind:'real'}, n => n-1);
  assert.equal(result.status, 'ok'); assert.equal(result.persona.kind, 'real'); assert.equal(result.persona.qid, 'Q937');
});
test('random: draw from fictional category only', () => {
  const result = randomPersona(sample, {kind:'fictional'}, () => 0);
  assert.equal(result.persona.qid, 'Q51746'); assert.equal(result.persona.kind, 'fictional');
});
test('random: exclude QIDs and return no_match when exhausted', () => {
  const excluded = sample.entries.filter(e => e.kind === 'real').map(e => e.qid);
  const result = randomPersona(sample, {kind:'real',exclude_qids:excluded});
  assert.equal(result.status, 'no_match');
});
test('random: fallback English source precedes identity for Japanese request', () => {
  const result = randomPersona(sample, {language:'ja'}, () => 0);
  assert.equal(result.persona.sources[0].purpose, 'article');
  assert.equal(result.persona.sources.at(-1).purpose, 'identity');
  assert.ok(result.guidance.includes('仮想対話'));
});
test('random: default is both (combined population) and not a 50/50 forced split', () => {
  const last = randomPersona(sample, {}, n => n - 1);
  assert.equal(last.persona.qid, 'Q552682');
});
test('random: invalid parameters rejected', () => {
  assert.throws(() => randomPersona(sample, {kind:'fantasy'}), /kind must/);
  assert.throws(() => randomPersona(sample, {language:'ru'}), /language must/);
  assert.throws(() => randomPersona(sample, {exclude_qids:['not-id']}), /exclude_qids/);
});
test('random: RNG errors are rejected', () => {
  assert.throws(() => randomPersona(sample, {}, () => 99), /index out of range/);
});
test('random: random index bounded for all supported test pool sizes', () => {
  for (const n of [1,2,3,6,127]) for (let i=0;i<20;i++) {
    const result=secureRandomIndex(n); assert.ok(result>=0 && result<n && Number.isInteger(result));
  }
});
test('get: existing QID resolves with provenance and without fabricated prompt', () => {
  const result = getPersona(sample, {qid:'Q7259', language:'en'});
  assert.equal(result.status, 'ok'); assert.equal(result.persona.qid, 'Q7259');
  assert.equal(result.catalog_version, sample.version);
  assert.equal(result.guidance, GUIDANCE.en);
});
test('get: missing valid QID returns explicit not_found', () => {
  assert.equal(getPersona(sample, {qid:'Q999999999'}).status, 'not_found');
});
test('get: invalid QID fails validation', () => {
  assert.throws(() => getPersona(sample, {qid:'http://evil.example'}), /qid must/);
});
test('normalize: Wikimedia P31, labels, and sitelinks form safe links', () => {
  const raw = {id:'Q42', labels:{ja:{value:'ダグラス・アダムズ'},en:{value:'Douglas Adams'}},
    descriptions:{en:{value:'British writer'}},
    claims:{P31:[{mainsnak:{datavalue:{value:{id:'Q5'}}}}]},
    sitelinks:{jawiki:{title:'ダグラス・アダムズ'},enwiki:{title:'Douglas Adams'}}};
  const entity=normalizeEntity(raw,{qid:'Q42',kind:'real'});
  assert.equal(entity.name,'ダグラス・アダムズ');
  assert.equal(entity.sources[0].language, 'ja');
  assert.ok(entity.sources[0].url.startsWith('https://ja.wikipedia.org/wiki/'));
  assert.equal(entity.sources.length,3);
  validateCatalog({version:'test',entries:[entity]});
});
test('normalize: no article results in rejection', () => {
  assert.equal(normalizeEntity({id:'Q42',labels:{en:{value:'Test'}},claims:{P31:[{mainsnak:{datavalue:{value:{id:'Q5'}}}}]}},{qid:'Q42',kind:'real'}),null);
});
test('normalize: direct human classification contradicting fictional seed is rejected', () => {
  const raw={id:'Q42',labels:{en:{value:'Test'}},sitelinks:{enwiki:{title:'Test'}},claims:{P31:[{mainsnak:{datavalue:{value:{id:'Q5'}}}}]}};
  assert.equal(normalizeEntity(raw,{qid:'Q42',kind:'fictional'}),null);
});

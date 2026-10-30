-- Apply through the existing ChatGPT Site's provisioned D1 binding using Work/Sites.
-- QID + bounded metadata only; no Wikipedia article bodies, images or conversations.
CREATE TABLE IF NOT EXISTS persona_cache (
  qid TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('real', 'fictional')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sources_json TEXT NOT NULL,
  random_key INTEGER NOT NULL CHECK (random_key >= 0 AND random_key < 4294967295),
  checked_at_ms INTEGER NOT NULL CHECK (checked_at_ms > 0)
);
CREATE INDEX IF NOT EXISTS idx_persona_cache_kind_random
  ON persona_cache(kind, random_key, qid);
CREATE INDEX IF NOT EXISTS idx_persona_cache_checked_at
  ON persona_cache(checked_at_ms);

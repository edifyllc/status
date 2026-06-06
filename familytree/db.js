// Neon / Postgres storage for the family tree.
//
// The tree is stored as a single JSONB document (the app already works with the
// whole tree as one object), and every save also appends a snapshot to
// tree_history — so you get full version history for free. Media files are NOT
// stored here; binary blobs stay on the volume (or object storage).
//
// Storage is opt-in: the server uses this only when DATABASE_URL is set.

import pg from 'pg';

let pool;

/** Lazily create a connection pool. Neon requires TLS. */
export function getPool(connectionString) {
  if (!pool) {
    const local = /@(localhost|127\.0\.0\.1)/.test(connectionString);
    pool = new pg.Pool({
      connectionString,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

export async function initSchema(p) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS tree_doc (
      id          int PRIMARY KEY,
      data        jsonb NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  text
    );`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS tree_history (
      id        serial PRIMARY KEY,
      data      jsonb NOT NULL,
      saved_at  timestamptz NOT NULL DEFAULT now(),
      saved_by  text
    );`);
}

/** Returns the current tree object, or null if none stored yet. */
export async function loadTreeDoc(p) {
  const { rows } = await p.query('SELECT data FROM tree_doc WHERE id = 1');
  return rows[0]?.data ?? null;
}

/** Upsert the current tree and append a history snapshot. */
export async function saveTreeDoc(p, tree, who) {
  const json = JSON.stringify(tree);
  await p.query(
    `INSERT INTO tree_doc (id, data, updated_at, updated_by)
       VALUES (1, $1::jsonb, now(), $2)
     ON CONFLICT (id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [json, who || null],
  );
  await p.query('INSERT INTO tree_history (data, saved_by) VALUES ($1::jsonb, $2)', [json, who || null]);
}

/** Seed from the sample if the document table is empty. */
export async function seedIfEmpty(p, sampleTree) {
  if ((await loadTreeDoc(p)) === null) {
    await saveTreeDoc(p, sampleTree, 'seed');
    return true;
  }
  return false;
}

/** Recent version-history entries (metadata only). */
export async function listHistory(p, limit = 50) {
  const { rows } = await p.query(
    'SELECT id, saved_at, saved_by FROM tree_history ORDER BY id DESC LIMIT $1', [limit]);
  return rows;
}

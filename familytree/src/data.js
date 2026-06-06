// Data layer: load the tree, index it, expose relationship helpers, and adapt
// our friendly JSON shape to Topola's native JsonGedcomData format.
//
// Our schema (see data/schema.md) keeps dates as ISO-ish strings and media as a
// separate top-level array so the editor and storage stay simple. Topola wants
// structured dates and per-person images, so toTopolaJson() converts on the fly.

export const state = {
  tree: null,        // raw loaded tree
  indisById: new Map(),
  famsById: new Map(),
  mediaById: new Map(),
};

/**
 * Fetch and index the tree. Tries the live data file first (served by the
 * Railway/Cloudflare backend), then falls back to the bundled sample so the
 * static viewer works with no backend.
 */
export async function loadTree(urls = ['data/tree.json', 'data/tree.sample.json']) {
  const list = Array.isArray(urls) ? urls : [urls];
  let lastErr;
  for (const url of list) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) { setTree(await res.json()); return state; }
      lastErr = new Error(`${url}: ${res.status}`);
    } catch (e) { lastErr = e; }
  }
  throw new Error(`Failed to load family data (${lastErr?.message || 'unknown error'})`);
}

/** Index an in-memory tree object (used by loader and by the editor). */
export function setTree(tree) {
  tree.indis = tree.indis || [];
  tree.fams = tree.fams || [];
  tree.media = tree.media || [];
  state.tree = tree;
  state.indisById = new Map(tree.indis.map((i) => [i.id, i]));
  state.famsById = new Map(tree.fams.map((f) => [f.id, f]));
  state.mediaById = new Map(tree.media.map((m) => [m.id, m]));
  return state;
}

export const getIndi = (id) => state.indisById.get(id) || null;
export const getFam = (id) => state.famsById.get(id) || null;
export const getMedia = (id) => state.mediaById.get(id) || null;

export function displayName(indi) {
  if (!indi) return 'Unknown';
  const name = [indi.firstName, indi.lastName].filter(Boolean).join(' ').trim();
  return name || '(unnamed)';
}

/** Lifespan label like "1851–1921" or "b. 1880". */
export function lifespan(indi) {
  const b = year(indi?.birth?.date);
  const d = year(indi?.death?.date);
  if (b && d) return `${b}–${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return '';
}

// --- Relationship helpers -------------------------------------------------

/** The two parents (may be null) of an individual, via their famc family. */
export function parentsOf(indi) {
  const fam = indi?.famc ? getFam(indi.famc) : null;
  if (!fam) return [];
  return [fam.husb, fam.wife].filter(Boolean).map(getIndi).filter(Boolean);
}

/** All spouse-families of an individual. */
export function spouseFamsOf(indi) {
  return (indi?.fams || []).map(getFam).filter(Boolean);
}

/** Spouses of an individual across all marriages. */
export function spousesOf(indi) {
  return spouseFamsOf(indi)
    .map((fam) => (fam.husb === indi.id ? fam.wife : fam.husb))
    .filter(Boolean)
    .map(getIndi)
    .filter(Boolean);
}

/** Children of an individual across all marriages. */
export function childrenOf(indi) {
  const ids = spouseFamsOf(indi).flatMap((fam) => fam.children || []);
  return ids.map(getIndi).filter(Boolean);
}

/** Siblings (including half-siblings) via the famc family. */
export function siblingsOf(indi) {
  const fam = indi?.famc ? getFam(indi.famc) : null;
  if (!fam) return [];
  return (fam.children || [])
    .filter((id) => id !== indi.id)
    .map(getIndi)
    .filter(Boolean);
}

/** Media records attached to an individual. */
export function mediaOf(indi) {
  return (indi?.media || []).map(getMedia).filter(Boolean);
}

// --- Date utilities -------------------------------------------------------

/** Extract a 4-digit year from a date string, or null. */
export function year(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

/**
 * Parse our date string into Topola's structured Date.
 * Accepts "YYYY-MM-DD", "YYYY-MM", "YYYY", or free text.
 */
export function parseDate(dateStr) {
  if (!dateStr) return undefined;
  const iso = String(dateStr).trim().match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (iso) {
    const out = { year: Number(iso[1]) };
    if (iso[2]) out.month = Number(iso[2]);
    if (iso[3]) out.day = Number(iso[3]);
    return out;
  }
  return { text: String(dateStr) };
}

const dateToEvent = (ev) =>
  ev && (ev.date || ev.place)
    ? { date: parseDate(ev.date), place: ev.place }
    : undefined;

/** Resolve a person's media ids to Topola image objects. */
function imagesFor(indi) {
  return mediaOf(indi)
    .filter((m) => m.type !== 'document')
    .map((m) => ({ url: m.file, title: m.caption }));
}

/** Convert our tree into Topola's JsonGedcomData for chart rendering. */
export function toTopolaJson(tree = state.tree) {
  const indis = (tree.indis || []).map((i) => ({
    id: i.id,
    firstName: i.firstName,
    lastName: i.lastName,
    maidenName: i.maidenName,
    sex: i.sex,
    famc: i.famc,
    fams: i.fams || [],
    birth: dateToEvent(i.birth),
    death: dateToEvent(i.death),
    images: imagesFor(i),
    notes: i.notes ? [i.notes] : undefined,
    events: (i.events || []).map((e) => ({
      type: e.type,
      place: e.place,
      date: parseDate(e.date),
    })),
  }));
  const fams = (tree.fams || []).map((f) => ({
    id: f.id,
    husb: f.husb,
    wife: f.wife,
    children: f.children || [],
    marriage: dateToEvent(f.marriage),
  }));
  return { indis, fams };
}

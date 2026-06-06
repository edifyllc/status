// Save strategies for the editor.
//
// Phase 1 (default): validate, then download an updated tree.json (+ optional
// GEDCOM) that a family curator commits to the private repo. Git is the
// database, giving full version history for free.
//
// Phase 2 (optional): POST the tree to a Cloudflare Pages Function that verifies
// the visitor's Cloudflare Access session and commits on their behalf. Enable by
// setting SAVE_MODE = 'api'. See functions/api/save.js.

import { validateTree } from './validate.js';
import { toGedcom } from '../gedcom/export.js';

export const SAVE_MODE = 'download'; // 'download' (Phase 1) | 'api' (Phase 2)

function downloadFile(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Returns {ok, problems}. On ok, performs the configured save action. */
export async function saveTree(tree, { alsoGedcom = false } = {}) {
  const problems = validateTree(tree);
  if (problems.length) return { ok: false, problems };

  if (SAVE_MODE === 'api') {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tree),
    });
    if (!res.ok) {
      return { ok: false, problems: [`Server save failed (${res.status}). ${await res.text()}`] };
    }
    return { ok: true, problems: [], mode: 'api' };
  }

  // Phase 1: download for the curator to commit.
  downloadFile('tree.json', JSON.stringify(tree, null, 2));
  if (alsoGedcom) downloadFile('tree.ged', toGedcom(tree), 'text/plain');
  return { ok: true, problems: [], mode: 'download' };
}

// Save + upload for the editor.
//
// saveTree() auto-detects the environment:
//   • If a backend is present (Railway server or Cloudflare Pages Function),
//     POST /api/save persists live.
//   • Otherwise it downloads tree.json for a curator to commit (static hosting).
// A 403 is surfaced as an auth error rather than silently downloading.

import { validateTree } from './validate.js';
import { toGedcom } from '../gedcom/export.js';

function downloadFile(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Returns {ok, problems, mode}. */
export async function saveTree(tree, { alsoGedcom = false } = {}) {
  const problems = validateTree(tree);
  if (problems.length) return { ok: false, problems };

  // Try a live backend first.
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tree),
    });
    if (res.ok) return { ok: true, problems: [], mode: 'server' };
    if (res.status === 403) {
      return { ok: false, problems: ['Not authorized to save — sign in through the family login first.'] };
    }
    // 404/405 → no backend on this host; fall through to download.
  } catch {
    // Network error → treat as no backend.
  }

  // Static fallback: download for the curator to commit.
  downloadFile('tree.json', JSON.stringify(tree, null, 2));
  if (alsoGedcom) downloadFile('tree.ged', toGedcom(tree), 'text/plain');
  return { ok: true, problems: [], mode: 'download' };
}

/**
 * Upload a photo/document to the backend. Resolves to { file, id } on success.
 * Throws 'no-backend' when there is no server (caller should fall back to a
 * manual file-path entry) or 'forbidden' when not signed in.
 */
export async function uploadMedia(file) {
  let res;
  try {
    const fd = new FormData();
    fd.append('file', file);
    res = await fetch('/api/upload', { method: 'POST', body: fd });
  } catch {
    throw new Error('no-backend');
  }
  if (res.status === 403) throw new Error('forbidden');
  if (res.status === 404 || res.status === 405) throw new Error('no-backend');
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
  return res.json();
}

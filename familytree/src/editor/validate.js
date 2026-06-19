// Referential-integrity and sanity checks run before any save/export.
// Returns an array of human-readable problem strings (empty == valid).

import { year } from '../data.js';

export function validateTree(tree) {
  const problems = [];
  const indiIds = new Set((tree.indis || []).map((i) => i.id));
  const famIds = new Set((tree.fams || []).map((f) => f.id));
  const mediaIds = new Set((tree.media || []).map((m) => m.id));

  const dupCheck = (arr, label) => {
    const seen = new Set();
    for (const x of arr) {
      if (seen.has(x.id)) problems.push(`Duplicate ${label} id: ${x.id}`);
      seen.add(x.id);
    }
  };
  dupCheck(tree.indis || [], 'person');
  dupCheck(tree.fams || [], 'family');

  for (const i of tree.indis || []) {
    if (!i.id) problems.push('A person is missing an id.');
    if (i.famc && !famIds.has(i.famc)) problems.push(`${i.id}: famc points to missing family ${i.famc}`);
    for (const fid of i.fams || []) {
      if (!famIds.has(fid)) problems.push(`${i.id}: fams points to missing family ${fid}`);
    }
    for (const mid of i.media || []) {
      if (!mediaIds.has(mid)) problems.push(`${i.id}: media points to missing item ${mid}`);
    }
    const b = year(i.birth?.date);
    const d = year(i.death?.date);
    if (b && d && d < b) problems.push(`${i.id}: death year (${d}) is before birth year (${b}).`);
  }

  for (const f of tree.fams || []) {
    for (const ref of ['husb', 'wife']) {
      if (f[ref] && !indiIds.has(f[ref])) problems.push(`${f.id}: ${ref} points to missing person ${f[ref]}`);
    }
    for (const c of f.children || []) {
      if (!indiIds.has(c)) problems.push(`${f.id}: child points to missing person ${c}`);
      if (c === f.husb || c === f.wife) problems.push(`${f.id}: ${c} is listed as both spouse and child (self-parenting).`);
    }
  }

  return problems;
}

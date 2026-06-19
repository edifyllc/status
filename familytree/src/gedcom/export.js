// Minimal GEDCOM 5.5.1 export. GEDCOM is an interchange format here (for moving
// data into Ancestry/FamilySearch/webtrees), not the source of truth.

import { parseDate } from '../data.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function gedDate(dateStr) {
  if (!dateStr) return null;
  const d = parseDate(dateStr);
  if (d.text) return d.text;
  const parts = [];
  if (d.day) parts.push(String(d.day));
  if (d.month) parts.push(MONTHS[d.month - 1] || '');
  if (d.year) parts.push(String(d.year));
  return parts.filter(Boolean).join(' ');
}

function eventLines(tag, ev) {
  if (!ev || (!ev.date && !ev.place)) return [];
  const out = [`1 ${tag}`];
  const d = gedDate(ev.date);
  if (d) out.push(`2 DATE ${d}`);
  if (ev.place) out.push(`2 PLAC ${ev.place}`);
  return out;
}

export function toGedcom(tree) {
  const lines = [
    '0 HEAD',
    '1 SOUR FamilyTreeSite',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
  ];

  for (const i of tree.indis || []) {
    lines.push(`0 @${i.id}@ INDI`);
    const name = `${i.firstName || ''} /${i.lastName || ''}/`.trim();
    lines.push(`1 NAME ${name}`);
    if (i.sex) lines.push(`1 SEX ${i.sex}`);
    lines.push(...eventLines('BIRT', i.birth));
    lines.push(...eventLines('DEAT', i.death));
    for (const e of i.events || []) {
      lines.push('1 EVEN');
      if (e.type) lines.push(`2 TYPE ${e.type}`);
      const d = gedDate(e.date);
      if (d) lines.push(`2 DATE ${d}`);
      if (e.place) lines.push(`2 PLAC ${e.place}`);
    }
    if (i.famc) lines.push(`1 FAMC @${i.famc}@`);
    for (const f of i.fams || []) lines.push(`1 FAMS @${f}@`);
    if (i.notes) lines.push(`1 NOTE ${i.notes.replace(/\n/g, ' ')}`);
  }

  for (const f of tree.fams || []) {
    lines.push(`0 @${f.id}@ FAM`);
    if (f.husb) lines.push(`1 HUSB @${f.husb}@`);
    if (f.wife) lines.push(`1 WIFE @${f.wife}@`);
    for (const c of f.children || []) lines.push(`1 CHIL @${c}@`);
    lines.push(...eventLines('MARR', f.marriage));
  }

  lines.push('0 TRLR');
  return lines.join('\n') + '\n';
}

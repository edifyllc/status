// Chronological timeline: flattens births, marriages, deaths, and custom events
// from every person into a single sorted rail.

import { state, getIndi, displayName, year } from '../data.js';

export function renderTimeline(container) {
  const events = collectEvents();
  if (!events.length) {
    container.innerHTML = '<p class="muted">No dated events yet.</p>';
    return;
  }
  container.innerHTML = `
    <div class="timeline">
      <h1>Family timeline</h1>
      <ol class="rail">
        ${events
          .map(
            (e) => `
          <li class="rail-item ${e.kind}">
            <span class="rail-year">${e.year}</span>
            <span class="rail-dot"></span>
            <span class="rail-body">
              ${e.personId ? `<a href="#/person/${e.personId}">${e.who}</a>` : e.who}
              <span class="rail-label">${e.label}</span>
              ${e.place ? `<span class="muted"> · ${e.place}</span>` : ''}
            </span>
          </li>`,
          )
          .join('')}
      </ol>
    </div>
  `;
}

function collectEvents() {
  const out = [];
  const push = (y, kind, label, indi, place) => {
    if (!y) return;
    out.push({ year: y, kind, label, who: displayName(indi), personId: indi?.id, place });
  };

  for (const i of state.tree?.indis || []) {
    push(year(i.birth?.date), 'birth', 'born', i, i.birth?.place);
    push(year(i.death?.date), 'death', 'died', i, i.death?.place);
    for (const e of i.events || []) push(year(e.date), 'event', e.type || 'event', i, e.place);
  }
  for (const f of state.tree?.fams || []) {
    if (!f.marriage) continue;
    const husb = getIndi(f.husb);
    const wife = getIndi(f.wife);
    const who = [husb, wife].filter(Boolean).map(displayName).join(' & ');
    const y = year(f.marriage.date);
    if (y) out.push({ year: y, kind: 'marriage', label: 'married', who, personId: husb?.id || wife?.id, place: f.marriage.place });
  }
  return out.sort((a, b) => a.year - b.year);
}

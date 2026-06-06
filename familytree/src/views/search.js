// Fuzzy search over people, powered by a vendored copy of Fuse.js.

import Fuse from '../../vendor/fuse.min.mjs';
import { state, displayName, lifespan, year } from '../data.js';

let fuse = null;

function buildIndex() {
  const records = (state.tree?.indis || []).map((i) => ({
    id: i.id,
    name: displayName(i),
    birthYear: year(i.birth?.date) || '',
    deathYear: year(i.death?.date) || '',
    places: [i.birth?.place, i.death?.place, ...(i.events || []).map((e) => e.place)]
      .filter(Boolean)
      .join(' '),
  }));
  fuse = new Fuse(records, {
    keys: ['name', 'places', 'birthYear', 'deathYear'],
    threshold: 0.4,
    ignoreLocation: true,
  });
}

export function renderSearch(container, params, navigate) {
  if (!fuse) buildIndex();
  container.innerHTML = `
    <div class="search">
      <input id="search-input" type="search" placeholder="Search by name or place…" autocomplete="off" autofocus>
      <ul id="search-results" class="results"></ul>
    </div>
  `;
  const input = container.querySelector('#search-input');
  const results = container.querySelector('#search-results');

  const run = () => {
    const q = input.value.trim();
    const hits = q ? fuse.search(q, { limit: 30 }) : allPeople();
    results.innerHTML = hits.length
      ? hits
          .map((h) => {
            const rec = h.item || h;
            return `<li><a href="#/person/${rec.id}">${rec.name} <span class="muted">${spanLabel(rec)}</span></a></li>`;
          })
          .join('')
      : '<li class="muted">No matches.</li>';
  };

  input.addEventListener('input', run);
  run();
}

function allPeople() {
  return (state.tree?.indis || [])
    .slice()
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
    .map((i) => ({ id: i.id, name: displayName(i), birthYear: year(i.birth?.date), deathYear: year(i.death?.date) }));
}

function spanLabel(rec) {
  if (rec.birthYear && rec.deathYear) return `${rec.birthYear}–${rec.deathYear}`;
  if (rec.birthYear) return `b. ${rec.birthYear}`;
  if (rec.deathYear) return `d. ${rec.deathYear}`;
  return '';
}

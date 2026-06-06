// App shell + hash router. Loads the tree once, then dispatches to views.

import { loadTree } from './data.js';
import { renderTree } from './views/tree.js';
import { renderProfile } from './views/profile.js';
import { renderSearch } from './views/search.js';
import { renderTimeline } from './views/timeline.js';
import { renderEditor } from './editor/editor.js';

const view = document.getElementById('view');
const navigate = (hash) => { window.location.hash = hash; };

const routes = [
  { re: /^#\/tree(?:\/(.+))?$/, handler: (m) => renderTree(view, { id: m[1] }, navigate) },
  { re: /^#\/person\/(.+)$/, handler: (m) => renderProfile(view, { id: m[1] }, navigate) },
  { re: /^#\/search$/, handler: () => renderSearch(view, {}, navigate) },
  { re: /^#\/timeline$/, handler: () => renderTimeline(view, {}, navigate) },
  { re: /^#\/edit(?:\/(.+))?$/, handler: (m) => renderEditor(view, { id: m[1] }, navigate) },
];

function route() {
  const hash = window.location.hash || '#/tree';
  setActiveNav(hash);
  for (const { re, handler } of routes) {
    const m = hash.match(re);
    if (m) { handler(m); return; }
  }
  view.innerHTML = '<p class="error">Page not found.</p>';
}

function setActiveNav(hash) {
  document.querySelectorAll('nav a').forEach((a) => {
    a.classList.toggle('active', hash.startsWith(a.getAttribute('href')));
  });
}

async function start() {
  try {
    await loadTree();
  } catch (e) {
    view.innerHTML = `<p class="error">Could not load family data: ${e.message}</p>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

start();

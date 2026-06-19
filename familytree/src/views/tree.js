// Interactive tree view, powered by Topola (hourglass chart: ancestors +
// descendants of a focus person, with pan/zoom and click-through to profiles).

import { state, toTopolaJson, getIndi, displayName } from '../data.js';

let chart = null;
let currentRoot = null;

export function renderTree(container, params, navigate) {
  const focusId = params.id || pickDefaultRoot();
  currentRoot = focusId;

  container.innerHTML = `
    <div class="tree-toolbar">
      <label>Center on
        <select id="tree-root"></select>
      </label>
      <span class="hint">Drag to pan · scroll to zoom · click a person to open their profile</span>
    </div>
    <div class="tree-canvas">
      <svg id="tree-svg" width="100%" height="100%"></svg>
    </div>
  `;

  populateRootSelect(focusId);
  document.getElementById('tree-root').addEventListener('change', (e) => {
    navigate(`#/tree/${e.target.value}`);
  });

  // Topola needs the <svg> present in the DOM before createChart runs.
  if (!window.topola) {
    container.querySelector('.tree-canvas').innerHTML =
      '<p class="error">Tree library not loaded. Run <code>npm run build</code> to generate src/lib/topola.bundle.js.</p>';
    return;
  }

  chart = window.topola.createChart({
    json: toTopolaJson(state.tree),
    chartType: window.topola.HourglassChart,
    renderer: window.topola.DetailedRenderer,
    svgSelector: '#tree-svg',
    horizontal: false,
    animate: true,
    updateSvgSize: true,
    indiCallback: (info) => navigate(`#/person/${info.id}`),
  });
  chart.render({ startIndi: focusId });
}

function pickDefaultRoot() {
  // Prefer the earliest-born individual so the default view spans generations.
  const indis = state.tree?.indis || [];
  if (!indis.length) return null;
  const withYear = indis
    .map((i) => ({ id: i.id, y: i.birth?.date ? parseInt(i.birth.date, 10) : Infinity }))
    .sort((a, b) => a.y - b.y);
  return withYear[0].id;
}

function populateRootSelect(focusId) {
  const sel = document.getElementById('tree-root');
  const opts = (state.tree?.indis || [])
    .slice()
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
    .map((i) => `<option value="${i.id}" ${i.id === focusId ? 'selected' : ''}>${displayName(i)}</option>`)
    .join('');
  sel.innerHTML = opts;
}

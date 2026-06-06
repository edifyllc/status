// Built-in browser editor: add/edit people, link relationships, add events, and
// attach media. Edits accumulate on an in-memory working copy of the tree; the
// "Save" button validates and persists via save.js (download or API).

import {
  state, setTree, getIndi, getFam, displayName, lifespan,
} from '../data.js';
import { saveTree } from './save.js';

// Working copy so accumulated edits survive view switches without committing.
let work = null;

function ensureWork() {
  if (!work) work = structuredClone(state.tree || { indis: [], fams: [], media: [] });
  work.indis ||= []; work.fams ||= []; work.media ||= [];
  return work;
}

function commitWork() {
  // Re-index so Tree/Profile/Search/Timeline immediately reflect edits.
  setTree(structuredClone(work));
}

function nextId(prefix, list) {
  let n = 1;
  const ids = new Set(list.map((x) => x.id));
  while (ids.has(prefix + n)) n++;
  return prefix + n;
}

export function renderEditor(container, params, navigate) {
  ensureWork();
  const editingId = params.id;
  container.innerHTML = `
    <div class="editor">
      <header class="editor-head">
        <h1>Edit family data</h1>
        <div class="editor-actions">
          <label class="inline"><input type="checkbox" id="also-gedcom"> also export GEDCOM</label>
          <button class="btn primary" id="save-btn">Save changes</button>
        </div>
      </header>
      <p class="hint">Changes are kept in your browser until you Save. Saving downloads an updated
        <code>tree.json</code> for your family historian to commit (Phase 1).</p>
      <div id="save-feedback" class="feedback" hidden></div>

      <div class="editor-grid">
        <aside class="people-list">
          <button class="btn" id="add-person">+ Add person</button>
          <ul id="people-ul"></ul>
        </aside>
        <section id="person-editor" class="person-editor"></section>
      </div>
    </div>
  `;

  renderPeopleList(container, editingId, navigate);
  container.querySelector('#add-person').addEventListener('click', () => {
    const id = nextId('I', work.indis);
    work.indis.push({ id, firstName: '', lastName: '', fams: [] });
    commitWork();
    navigate(`#/edit/${id}`);
  });
  container.querySelector('#save-btn').addEventListener('click', () => doSave(container));

  if (editingId) renderPersonForm(container, editingId, navigate);
  else container.querySelector('#person-editor').innerHTML =
    '<p class="muted">Select a person on the left, or add a new one.</p>';
}

function renderPeopleList(container, editingId, navigate) {
  const ul = container.querySelector('#people-ul');
  ul.innerHTML = work.indis
    .slice()
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
    .map(
      (i) => `<li><a href="#/edit/${i.id}" class="${i.id === editingId ? 'active' : ''}">${displayName(i)} <span class="muted">${lifespan(i)}</span></a></li>`,
    )
    .join('');
}

function renderPersonForm(container, id, navigate) {
  const indi = work.indis.find((i) => i.id === id);
  const box = container.querySelector('#person-editor');
  if (!indi) { box.innerHTML = '<p class="error">Person not found.</p>'; return; }
  indi.birth ||= {}; indi.death ||= {}; indi.fams ||= []; indi.events ||= []; indi.media ||= [];

  const peopleOptions = (selected, exclude = []) =>
    ['<option value="">—</option>']
      .concat(
        work.indis
          .filter((p) => !exclude.includes(p.id))
          .map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${displayName(p)}</option>`),
      )
      .join('');

  box.innerHTML = `
    <h2>${displayName(indi)} <span class="muted">(${indi.id})</span></h2>
    <div class="form-grid">
      ${field('First name', 'firstName', indi.firstName)}
      ${field('Last name', 'lastName', indi.lastName)}
      ${field('Maiden name', 'maidenName', indi.maidenName)}
      ${selectField('Sex', 'sex', indi.sex, [['', '—'], ['M', 'Male'], ['F', 'Female']])}
      ${field('Birth date', 'birth.date', indi.birth.date, 'YYYY-MM-DD')}
      ${field('Birth place', 'birth.place', indi.birth.place)}
      ${field('Death date', 'death.date', indi.death.date, 'YYYY-MM-DD')}
      ${field('Death place', 'death.place', indi.death.place)}
    </div>
    <label class="block">Story / notes
      <textarea data-path="notes" rows="4">${indi.notes || ''}</textarea>
    </label>
    <label class="inline"><input type="checkbox" data-path="living" ${indi.living ? 'checked' : ''}> Living</label>

    <fieldset>
      <legend>Parents</legend>
      <label class="block">Child in family
        <select id="famc-select">${famOptions(indi.famc)}</select>
      </label>
      <button class="btn small" id="new-parents">Create parents family from two people…</button>
      <div id="new-parents-form"></div>
    </fieldset>

    <fieldset>
      <legend>Spouses &amp; children</legend>
      <div id="spouse-fams"></div>
      <label class="block">Add spouse
        <select id="add-spouse">${peopleOptions('', [indi.id])}</select>
      </label>
    </fieldset>

    <fieldset>
      <legend>Life events</legend>
      <div id="events"></div>
      <button class="btn small" id="add-event">+ Add event</button>
    </fieldset>

    <fieldset>
      <legend>Photos &amp; documents</legend>
      <div id="media-list"></div>
      <button class="btn small" id="add-media">+ Add media</button>
    </fieldset>

    <p><a class="btn-link" href="#/person/${indi.id}">View profile →</a></p>
  `;

  // Bind simple field edits.
  box.querySelectorAll('[data-path]').forEach((el) => {
    el.addEventListener('input', () => {
      const val = el.type === 'checkbox' ? el.checked : el.value;
      setPath(indi, el.dataset.path, val);
      commitWork();
      if (el.dataset.path === 'firstName' || el.dataset.path === 'lastName') {
        renderPeopleList(container, id, navigate);
        box.querySelector('h2').firstChild.textContent = displayName(indi) + ' ';
      }
    });
  });

  // famc
  box.querySelector('#famc-select').addEventListener('change', (e) => {
    indi.famc = e.target.value || undefined;
    commitWork();
  });

  // create parents family
  box.querySelector('#new-parents').addEventListener('click', () => {
    box.querySelector('#new-parents-form').innerHTML = `
      <div class="form-row">
        <select id="np-father">${peopleOptions('', [indi.id])}</select>
        <select id="np-mother">${peopleOptions('', [indi.id])}</select>
        <button class="btn small" id="np-create">Create</button>
      </div>`;
    box.querySelector('#np-create').addEventListener('click', () => {
      const fid = nextId('F', work.fams);
      const husb = box.querySelector('#np-father').value || undefined;
      const wife = box.querySelector('#np-mother').value || undefined;
      work.fams.push({ id: fid, husb, wife, children: [indi.id] });
      indi.famc = fid;
      addFamToSpouses(husb, wife, fid);
      commitWork();
      renderPersonForm(container, id, navigate);
    });
  });

  // add spouse -> creates a family
  box.querySelector('#add-spouse').addEventListener('change', (e) => {
    const spouseId = e.target.value;
    if (!spouseId) return;
    const fid = nextId('F', work.fams);
    const fam = { id: fid, children: [] };
    if (indi.sex === 'F') { fam.wife = indi.id; fam.husb = spouseId; }
    else { fam.husb = indi.id; fam.wife = spouseId; }
    work.fams.push(fam);
    addFamToSpouses(fam.husb, fam.wife, fid);
    commitWork();
    renderPersonForm(container, id, navigate);
  });

  renderSpouseFams(box, indi, container, navigate, peopleOptions);
  renderEvents(box, indi);
  renderMedia(box, indi);
}

function renderSpouseFams(box, indi, container, navigate, peopleOptions) {
  const wrap = box.querySelector('#spouse-fams');
  const fams = (indi.fams || []).map(getFamWork).filter(Boolean);
  wrap.innerHTML = fams
    .map((f) => {
      const spouseId = f.husb === indi.id ? f.wife : f.husb;
      const spouse = spouseId ? work.indis.find((p) => p.id === spouseId) : null;
      const kids = (f.children || [])
        .map((c) => work.indis.find((p) => p.id === c))
        .filter(Boolean)
        .map((c) => `<li>${displayName(c)}</li>`)
        .join('');
      return `
        <div class="fam-card" data-fam="${f.id}">
          <strong>With ${spouse ? displayName(spouse) : '(unknown)'}</strong>
          ${marriageField(f)}
          <ul class="kids">${kids || '<li class="muted">no children</li>'}</ul>
          <label class="block">Add child
            <select class="add-child" data-fam="${f.id}">${peopleOptions('', [indi.id, ...(f.children || [])])}</select>
          </label>
        </div>`;
    })
    .join('') || '<p class="muted">No marriages yet.</p>';

  wrap.querySelectorAll('.add-child').forEach((sel) =>
    sel.addEventListener('change', (e) => {
      const fam = getFamWork(sel.dataset.fam);
      const childId = e.target.value;
      if (!fam || !childId) return;
      fam.children ||= [];
      if (!fam.children.includes(childId)) fam.children.push(childId);
      const child = work.indis.find((p) => p.id === childId);
      if (child) child.famc = fam.id;
      commitWork();
      renderPersonForm(container, indi.id, navigate);
    }),
  );
  wrap.querySelectorAll('[data-mpath]').forEach((el) =>
    el.addEventListener('input', () => {
      const fam = getFamWork(el.closest('.fam-card').dataset.fam);
      fam.marriage ||= {};
      setPath(fam.marriage, el.dataset.mpath, el.value);
      commitWork();
    }),
  );
}

function marriageField(f) {
  const m = f.marriage || {};
  return `<div class="form-row">
    <label>Married <input data-mpath="date" value="${m.date || ''}" placeholder="YYYY-MM-DD"></label>
    <label>Place <input data-mpath="place" value="${m.place || ''}"></label>
  </div>`;
}

function renderEvents(box, indi) {
  const wrap = box.querySelector('#events');
  const draw = () => {
    wrap.innerHTML = (indi.events || [])
      .map(
        (e, idx) => `<div class="form-row" data-ev="${idx}">
          <input data-evpath="type" value="${e.type || ''}" placeholder="type">
          <input data-evpath="date" value="${e.date || ''}" placeholder="YYYY-MM-DD">
          <input data-evpath="place" value="${e.place || ''}" placeholder="place">
          <button class="btn small del-ev" data-ev="${idx}">✕</button>
        </div>`,
      )
      .join('');
    wrap.querySelectorAll('[data-evpath]').forEach((el) =>
      el.addEventListener('input', () => {
        const idx = Number(el.closest('[data-ev]').dataset.ev);
        indi.events[idx][el.dataset.evpath] = el.value;
        commitWork();
      }),
    );
    wrap.querySelectorAll('.del-ev').forEach((b) =>
      b.addEventListener('click', () => {
        indi.events.splice(Number(b.dataset.ev), 1);
        commitWork();
        draw();
      }),
    );
  };
  draw();
  box.querySelector('#add-event').addEventListener('click', () => {
    indi.events.push({ type: '', date: '', place: '' });
    commitWork();
    draw();
  });
}

function renderMedia(box, indi) {
  const wrap = box.querySelector('#media-list');
  const draw = () => {
    wrap.innerHTML = (indi.media || [])
      .map((mid) => {
        const m = work.media.find((x) => x.id === mid);
        return `<div class="media-row"><span>${m ? m.caption || m.file : mid}</span>
          <button class="btn small del-media" data-mid="${mid}">remove</button></div>`;
      })
      .join('') || '<p class="muted">None attached.</p>';
    wrap.querySelectorAll('.del-media').forEach((b) =>
      b.addEventListener('click', () => {
        indi.media = indi.media.filter((x) => x !== b.dataset.mid);
        commitWork();
        draw();
      }),
    );
  };
  draw();
  box.querySelector('#add-media').addEventListener('click', () => {
    const file = prompt('Media file path (e.g. media/grandpa.jpg):');
    if (!file) return;
    const caption = prompt('Caption (optional):') || '';
    const type = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file) ? 'photo' : 'document';
    const mid = nextId('m_', work.media.map((m) => ({ id: m.id })));
    work.media.push({ id: mid, file, caption, type, people: [indi.id] });
    indi.media.push(mid);
    commitWork();
    draw();
  });
}

// --- helpers --------------------------------------------------------------

function getFamWork(id) { return work.fams.find((f) => f.id === id); }

function addFamToSpouses(husb, wife, fid) {
  for (const pid of [husb, wife]) {
    if (!pid) continue;
    const p = work.indis.find((x) => x.id === pid);
    if (p) { p.fams ||= []; if (!p.fams.includes(fid)) p.fams.push(fid); }
  }
}

function famOptions(selected) {
  return ['<option value="">— none —</option>']
    .concat(
      work.fams.map((f) => {
        const h = f.husb ? displayName(work.indis.find((p) => p.id === f.husb)) : '?';
        const w = f.wife ? displayName(work.indis.find((p) => p.id === f.wife)) : '?';
        return `<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${f.id}: ${h} & ${w}</option>`;
      }),
    )
    .join('');
}

function setPath(obj, path, val) {
  const parts = path.split('.');
  let cur = obj;
  while (parts.length > 1) { const k = parts.shift(); cur[k] ||= {}; cur = cur[k]; }
  if (val === '' || val === false) delete cur[parts[0]];
  else cur[parts[0]] = val;
}

function field(label, path, val, placeholder = '') {
  return `<label>${label}<input data-path="${path}" value="${val || ''}" placeholder="${placeholder}"></label>`;
}
function selectField(label, path, val, options) {
  const opts = options.map(([v, t]) => `<option value="${v}" ${v === (val || '') ? 'selected' : ''}>${t}</option>`).join('');
  return `<label>${label}<select data-path="${path}">${opts}</select></label>`;
}

async function doSave(container) {
  const fb = container.querySelector('#save-feedback');
  const alsoGedcom = container.querySelector('#also-gedcom').checked;
  const { ok, problems, mode } = await saveTree(work, { alsoGedcom });
  fb.hidden = false;
  if (ok) {
    fb.className = 'feedback ok';
    fb.innerHTML = mode === 'api'
      ? '✓ Saved to the family repository.'
      : '✓ Your changes downloaded as <code>tree.json</code>. Send it to your family historian to commit, or replace <code>data/tree.json</code> in the repo.';
  } else {
    fb.className = 'feedback error';
    fb.innerHTML = `<strong>Couldn’t save — please fix:</strong><ul>${problems.map((p) => `<li>${p}</li>`).join('')}</ul>`;
  }
}

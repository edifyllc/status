// Person profile page: vital facts, clickable relatives, story/notes, and a
// photo/document gallery with a lightbox.

import {
  getIndi, displayName, lifespan, parentsOf, spousesOf, childrenOf,
  siblingsOf, mediaOf,
} from '../data.js';

export function renderProfile(container, params, navigate) {
  const indi = getIndi(params.id);
  if (!indi) {
    container.innerHTML = `<p class="error">No person with id "${params.id}".</p>`;
    return;
  }

  const fact = (label, ev) => {
    if (!ev || (!ev.date && !ev.place)) return '';
    const parts = [ev.date, ev.place].filter(Boolean).join(' · ');
    return `<div class="fact"><span class="fact-label">${label}</span><span>${parts}</span></div>`;
  };

  const personLink = (p) =>
    `<a class="person-chip" href="#/person/${p.id}">${displayName(p)} <span class="muted">${lifespan(p)}</span></a>`;

  const relGroup = (label, people) =>
    people.length
      ? `<div class="rel-group"><h3>${label}</h3><div class="chips">${people.map(personLink).join('')}</div></div>`
      : '';

  const photos = mediaOf(indi);
  const gallery = photos.length
    ? `<div class="gallery">${photos
        .map(
          (m, idx) => `
        <figure class="media-item ${m.type === 'document' ? 'doc' : ''}" data-idx="${idx}">
          <img src="${m.file}" alt="${m.caption || ''}" loading="lazy">
          <figcaption>${m.caption || ''}</figcaption>
        </figure>`,
        )
        .join('')}</div>`
    : '<p class="muted">No photos or documents attached yet.</p>';

  const events = (indi.events || [])
    .map((e) => `<li>${[e.date, e.type, e.place].filter(Boolean).join(' · ')}</li>`)
    .join('');

  container.innerHTML = `
    <article class="profile">
      <header class="profile-head">
        <div>
          <h1>${displayName(indi)}</h1>
          <p class="lifespan">${lifespan(indi)}${indi.living ? ' · <span class="badge">Living</span>' : ''}</p>
        </div>
        <a class="btn" href="#/tree/${indi.id}">View in tree →</a>
      </header>

      <section class="facts">
        ${fact('Born', indi.birth)}
        ${fact('Died', indi.death)}
        ${indi.sex ? `<div class="fact"><span class="fact-label">Sex</span><span>${indi.sex}</span></div>` : ''}
      </section>

      ${indi.notes ? `<section class="story"><h3>Story</h3><p>${escapeHtml(indi.notes)}</p></section>` : ''}

      <section class="relatives">
        ${relGroup('Parents', parentsOf(indi))}
        ${relGroup('Siblings', siblingsOf(indi))}
        ${relGroup('Spouses', spousesOf(indi))}
        ${relGroup('Children', childrenOf(indi))}
      </section>

      ${events ? `<section class="events"><h3>Life events</h3><ul>${events}</ul></section>` : ''}

      <section class="media">
        <h3>Photos &amp; documents</h3>
        ${gallery}
      </section>

      <p><a class="btn-link" href="#/edit/${indi.id}">Edit this person</a></p>
    </article>
    <div id="lightbox" class="lightbox" hidden><img><div class="lb-caption"></div></div>
  `;

  wireLightbox(container, photos);
}

function wireLightbox(container, photos) {
  const lb = container.querySelector('#lightbox');
  container.querySelectorAll('.media-item').forEach((el) => {
    el.addEventListener('click', () => {
      const m = photos[Number(el.dataset.idx)];
      lb.querySelector('img').src = m.file;
      lb.querySelector('.lb-caption').textContent = m.caption || '';
      lb.hidden = false;
    });
  });
  lb.addEventListener('click', () => { lb.hidden = true; });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

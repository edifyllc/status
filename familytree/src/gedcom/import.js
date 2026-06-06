// GEDCOM import: convert a GEDCOM file into our tree.json shape, reusing
// Topola's bundled parser (window.topola.gedcomToJson) which yields the native
// {indis, fams} structure. We then map structured dates back to our strings.

function dateToString(dateOrRange) {
  const d = dateOrRange?.date || dateOrRange;
  if (!d) return undefined;
  if (d.text) return d.text;
  const pad = (n) => String(n).padStart(2, '0');
  if (d.year && d.month && d.day) return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
  if (d.year && d.month) return `${d.year}-${pad(d.month)}`;
  if (d.year) return String(d.year);
  return undefined;
}

function ev(e) {
  if (!e) return undefined;
  const out = {};
  const date = dateToString(e);
  if (date) out.date = date;
  if (e.place) out.place = e.place;
  return Object.keys(out).length ? out : undefined;
}

/** gedcomText -> our tree.json shape. Requires window.topola to be loaded. */
export function fromGedcom(gedcomText) {
  if (!window.topola?.gedcomToJson) {
    throw new Error('Topola not loaded; run npm run build first.');
  }
  const data = window.topola.gedcomToJson(gedcomText); // {indis, fams}
  const media = [];

  const indis = (data.indis || []).map((i) => {
    const person = {
      id: i.id,
      firstName: i.firstName,
      lastName: i.lastName,
      maidenName: i.maidenName,
      sex: i.sex,
      famc: i.famc,
      fams: i.fams || [],
      birth: ev(i.birth),
      death: ev(i.death),
      notes: Array.isArray(i.notes) ? i.notes.join('\n') : i.notes,
    };
    (i.images || []).forEach((img, idx) => {
      const mid = `${i.id}_m${idx}`;
      media.push({ id: mid, file: img.url, caption: img.title || '', type: 'photo', people: [i.id] });
      (person.media ||= []).push(mid);
    });
    if (i.events?.length) {
      person.events = i.events.map((e) => ({ type: e.type, date: dateToString(e), place: e.place }));
    }
    return person;
  });

  const fams = (data.fams || []).map((f) => ({
    id: f.id,
    husb: f.husb,
    wife: f.wife,
    children: f.children || [],
    marriage: ev(f.marriage),
  }));

  return { indis, fams, media };
}

# `tree.json` schema

The site reads a single JSON file (`data/tree.sample.json` in the scaffold;
rename to `data/tree.json` for your own data). It has three top-level arrays.

## `indis` — individuals
| field        | type     | notes |
|--------------|----------|-------|
| `id`         | string   | unique, e.g. `I1`. Required. |
| `firstName`  | string   | |
| `lastName`   | string   | |
| `maidenName` | string   | optional |
| `sex`        | `"M"`/`"F"` | optional |
| `birth`      | event    | `{ "date": "...", "place": "..." }` |
| `death`      | event    | same shape as birth |
| `famc`       | string   | id of the family this person is a **child** in |
| `fams`       | string[] | ids of families this person is a **spouse** in (array → multiple marriages) |
| `events`     | event[]  | `{ "type": "residence", "date": "...", "place": "..." }` |
| `media`      | string[] | ids into the top-level `media` array |
| `notes`      | string   | free-text biography / story |
| `living`     | boolean  | flag living people |

## `fams` — families (a couple + their children)
| field      | type     | notes |
|------------|----------|-------|
| `id`       | string   | unique, e.g. `F1`. Required. |
| `husb`     | string   | individual id |
| `wife`     | string   | individual id |
| `children` | string[] | individual ids |
| `marriage` | event    | `{ "date": "...", "place": "..." }` |

## `media` — photos & documents
| field     | type     | notes |
|-----------|----------|-------|
| `id`      | string   | unique, e.g. `m_001`. Required. |
| `file`    | string   | path under the site, e.g. `media/grandpa.jpg` |
| `caption` | string   | |
| `type`    | `"photo"`/`"document"` | documents render contained, photos cropped |
| `people`  | string[] | individual ids this item depicts |

## Dates
Use `YYYY-MM-DD`, `YYYY-MM`, or `YYYY`. Anything else is kept as free text.
Years are extracted for the timeline and lifespan labels.

## Why this shape
Families are first-class records (not just parent pointers), so multiple
marriages, half-siblings, and step-relationships are all representable. The
shape maps cleanly onto GEDCOM `INDI`/`FAM` records, so
`src/gedcom/export.js` can produce a portable GEDCOM for Ancestry/FamilySearch.

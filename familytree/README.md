# Family Tree — private static site

An interactive, private family-tree website: pan/zoom tree, person profiles,
photos & documents, fuzzy search, and a timeline — plus a built-in browser
editor. Built as a static site so it can be hosted free on Cloudflare Pages and
locked behind real per-person logins with Cloudflare Access.

> ⚠️ **This scaffold contains only fake sample data.** Keep real family data and
> photos out of any **public** repository. See "Going private" below.

## Features
- **Tree** (`#/tree`) — Topola hourglass chart (ancestors + descendants), pan/zoom, click a person to open their profile.
- **Profiles** (`#/person/:id`) — dates, places, story, parents/siblings/spouses/children, photo & document gallery with lightbox.
- **Search** (`#/search`) — typo-tolerant fuzzy search (Fuse.js) over names and places.
- **Timeline** (`#/timeline`) — all births, marriages, deaths and events on one chronological rail.
- **Editor** (`#/edit`) — add/edit people, link relationships, add events, attach media. Saves an updated `tree.json` you commit (Phase 1), or saves live via a Cloudflare function (Phase 2).

## Run locally
```bash
cd familytree
npm install        # dev deps: topola, fuse.js, esbuild
npm run build      # produces src/lib/topola.bundle.js and vendor/fuse.min.mjs
npm run dev        # builds, then serves at http://localhost:8080
```
You can also serve the folder with any static server (`python3 -m http.server`)
after `npm run build`. Must be served over http:// (ES modules don't load from
`file://`).

## Data
- Source of truth is a single JSON file. The scaffold loads `data/tree.sample.json`;
  for real data, save your tree as `data/tree.json` and change the default in
  `src/data.js` (`loadTree('data/tree.json')`).
- Schema is documented in [`data/schema.md`](data/schema.md).
- Photos/documents live under `media/` and are referenced by id from people.
- **GEDCOM** in/out lives in `src/gedcom/` for portability (import from / export to
  Ancestry, FamilySearch, webtrees, etc.). JSON stays the source of truth; git
  gives you full version history of every edit.

## Going private (recommended deployment)
1. **Create a new PRIVATE GitHub repo** and copy the `familytree/` folder into it
   (this keeps real data/photos out of the public `status` repo).
2. **Cloudflare Pages** → connect that private repo. Set the build to output the
   static files (committing the built `src/lib/topola.bundle.js` means no build
   step is even required on Pages). Set the project root to the folder containing
   `index.html`.
3. **Cloudflare Access** (Zero Trust, free up to 50 users) → add a self-hosted
   Access application covering the Pages domain, with a policy that allows only
   your family's emails (email one-time-PIN and/or Google). Now only invited
   relatives can reach the site.

## Optional: live editing (Phase 2)
By default the editor's "Save" downloads `tree.json` for a family historian to
commit. To let logged-in relatives save directly:
1. Deploy `functions/api/save.js` (already included) with Pages. Set env vars:
   `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `GITHUB_REPO`, `GITHUB_BRANCH`,
   and the secret `GITHUB_TOKEN` (fine-grained PAT, `contents:write` on the
   private repo only). Optionally `ALLOWED_EMAILS`.
2. Set `SAVE_MODE = 'api'` in `src/editor/save.js`.
The function verifies the Cloudflare Access JWT server-side before committing, so
the write endpoint isn't an open hole even though it holds a GitHub token.

## Notes & limitations
- Topola is Apache-2.0; the bundled license/NOTICE is preserved in `node_modules`.
- Genealogy is a graph, not a strict tree: a shared ancestor may appear more than
  once in the chart. Families are modeled as records (with array `fams`) so
  remarriages and half-siblings are represented correctly.
- For larger photo archives you can later move media to Cloudflare R2 (free 10 GB,
  no egress) and store R2 keys in `media[].file`.

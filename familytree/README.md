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

To run the **server** (live save + uploads) locally without Cloudflare:
```bash
AUTH_DISABLED=true DATA_DIR=.runtime npm start   # http://localhost:8080
```
`AUTH_DISABLED=true` is for local use only — in production the server requires a
valid Cloudflare Access session.

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

## Deploy on Railway + Cloudflare Access (live editing)

This is the recommended setup if you have both a Railway and a Cloudflare
account. Railway hosts the app and gives you a real backend (edits and photo
uploads save **live** to a persistent volume); Cloudflare Access provides the
per-person family login. `server.js` also verifies the Cloudflare Access token on
every request and **fails closed**, so the bare `*.up.railway.app` URL stays
locked — the only way in is through your Cloudflare login.

The editor auto-detects the backend: with the server running it saves live; on
plain static hosting it falls back to downloading `tree.json`. No code change
needed to switch.

### 1. Put the code in a private repo
Copy `familytree/` into a new **private** GitHub repo (keeps real data/photos off
the public `status` repo).

### 2. Create the Railway service
1. Railway → **New Project → Deploy from GitHub repo** → pick the private repo.
2. If `familytree/` is a subfolder, set **Settings → Root Directory** to
   `familytree`. Railway auto-detects Node and runs `npm start` (see
   `railway.json`). The committed `src/lib/topola.bundle.js` means no build step.
3. **Add a Volume** (Settings → Volumes) and mount it at **`/data`**. This is
   where `tree.json` and uploaded media live, surviving deploys.
4. **Variables**:
   - `DATA_DIR=/data`
   - `CF_ACCESS_TEAM_DOMAIN` = `yourteam.cloudflareaccess.com`
   - `CF_ACCESS_AUD` = your Access application's Audience (AUD) tag (from step 4)
   - `ALLOWED_EMAILS` (optional) = comma-separated family emails
   - *(temporary, to smoke-test before Cloudflare is wired: `AUTH_DISABLED=true`
     — remove this before going live)*
5. Deploy. Railway gives you a URL like `family.up.railway.app`. `/healthz`
   should return `{"ok":true}`; everything else returns 403 until Access is in
   front (that's the fail-closed behavior).

### 3. Custom domain through Cloudflare
1. In Railway → **Settings → Networking → Custom Domain**, add e.g.
   `family.yourdomain.com`. Railway shows a CNAME target.
2. In Cloudflare DNS, add that **CNAME** record **proxied (orange cloud)**.

### 4. Cloudflare Access (the login gate)
1. Cloudflare **Zero Trust → Access → Applications → Add → Self-hosted**.
2. Application domain = `family.yourdomain.com`.
3. Add a **policy**: Action *Allow*, include rule *Emails* = your family's
   addresses (or *Email domain* / a Google login provider). Free up to 50 users.
4. Copy the application's **Audience (AUD) tag** into Railway's `CF_ACCESS_AUD`,
   then **remove `AUTH_DISABLED`** and redeploy.

Now visiting `family.yourdomain.com` shows the Cloudflare login; after sign-in,
relatives can view *and* edit/upload, and changes are saved live for everyone.

## Alternative: Cloudflare Pages only (no server)
Static-only hosting. `npm run build`, deploy the folder to Cloudflare Pages, and
gate it with a Cloudflare Access application (same step 4 above). Editing falls
back to "download `tree.json` → commit". For live saving without a server you can
instead deploy the included `functions/api/save.js` Pages Function (set
`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `GITHUB_REPO`, `GITHUB_BRANCH`, and the
secret `GITHUB_TOKEN`); it commits edits to the private repo after verifying the
Access JWT.

## Notes & limitations
- Topola is Apache-2.0; the bundled license/NOTICE is preserved in `node_modules`.
- Genealogy is a graph, not a strict tree: a shared ancestor may appear more than
  once in the chart. Families are modeled as records (with array `fams`) so
  remarriages and half-siblings are represented correctly.
- For larger photo archives you can later move media to Cloudflare R2 (free 10 GB,
  no egress) and store R2 keys in `media[].file`.

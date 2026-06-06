// Family-tree server for Railway (or any Node host).
//
// Serves the static viewer/editor AND provides live persistence:
//   GET  /data/tree.json   -> the family data (seeded from the sample on first boot)
//   GET  /media/*          -> uploaded photos/documents
//   POST /api/save         -> write tree.json
//   POST /api/upload       -> upload a photo/document
//   GET  /healthz          -> health check (no auth), for Railway
//
// AUTH: every request except /healthz is verified against Cloudflare Access.
// Put this app behind a Cloudflare-proxied hostname with an Access application;
// Cloudflare injects a Cf-Access-Jwt-Assertion header that we verify here, so the
// bare Railway URL stays locked (fails closed). Set AUTH_DISABLED=true only for
// local testing.
//
// Data lives in DATA_DIR (mount a Railway volume there, e.g. /data) so edits and
// uploads survive deploys/restarts.

import express from 'express';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(APP_DIR, '.runtime');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const TREE_FILE = path.join(DATA_DIR, 'tree.json');
const PORT = process.env.PORT || 8080;
const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true';

// --- First-boot seeding ----------------------------------------------------

async function seed() {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  if (!existsSync(TREE_FILE)) {
    const sample = await fs.readFile(path.join(APP_DIR, 'data', 'tree.sample.json'), 'utf8');
    await fs.writeFile(TREE_FILE, sample);
    console.log('Seeded tree.json from sample.');
  }
  // Copy placeholder media so the sample renders before any uploads.
  const repoMedia = path.join(APP_DIR, 'media');
  if (existsSync(repoMedia)) {
    for (const f of await fs.readdir(repoMedia)) {
      const dest = path.join(MEDIA_DIR, f);
      if (f !== '.gitkeep' && !existsSync(dest)) {
        await fs.copyFile(path.join(repoMedia, f), dest);
      }
    }
  }
}

// --- Cloudflare Access JWT verification (RS256, remote JWKS) ----------------

let jwksCache = { keys: null, at: 0 };
async function getJwks(teamDomain) {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('could not fetch JWKS');
  const { keys } = await res.json();
  jwksCache = { keys, at: Date.now() };
  return keys;
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Buffer.from(b64, 'base64');
}
const b64urlToString = (s) => b64urlToBytes(s).toString('utf8');

async function verifyAccess(req) {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
  const aud = process.env.CF_ACCESS_AUD;
  if (!teamDomain || !aud) throw new Error('server not configured (CF_ACCESS_* env vars missing)');

  const token =
    req.headers['cf-access-jwt-assertion'] ||
    (req.headers.cookie || '').match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token) throw new Error('missing Access token');

  const [h, p, sig] = token.split('.');
  const header = JSON.parse(b64urlToString(h));
  const keys = await getJwks(teamDomain);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('signing key not found');

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('bad signature');

  const claims = JSON.parse(b64urlToString(p));
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) throw new Error('aud mismatch');
  if (claims.exp && Date.now() / 1000 > claims.exp) throw new Error('token expired');

  if (process.env.ALLOWED_EMAILS) {
    const allow = process.env.ALLOWED_EMAILS.split(',').map((s) => s.trim().toLowerCase());
    if (!allow.includes((claims.email || '').toLowerCase())) throw new Error('email not allowed');
  }
  return claims;
}

async function authMiddleware(req, res, next) {
  if (AUTH_DISABLED) { req.userEmail = 'local@dev'; return next(); }
  try {
    const claims = await verifyAccess(req);
    req.userEmail = claims.email || 'unknown';
    next();
  } catch (e) {
    res.status(403).json({ error: `Forbidden: ${e.message}` });
  }
}

// --- App -------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '5mb' }));

// Health check is public so Railway can probe it.
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Everything else requires a valid Cloudflare Access session.
app.use(authMiddleware);

// Live data + uploaded media come from the volume.
app.get('/data/tree.json', (_req, res) => res.sendFile(TREE_FILE));
app.use('/media', express.static(MEDIA_DIR));

// Save the whole tree.
app.post('/api/save', async (req, res) => {
  const tree = req.body;
  if (!tree || !Array.isArray(tree.indis) || !Array.isArray(tree.fams)) {
    return res.status(400).json({ error: 'Body must be a tree with indis[] and fams[].' });
  }
  await fs.writeFile(TREE_FILE, JSON.stringify(tree, null, 2));
  console.log(`tree.json saved by ${req.userEmail}`);
  res.json({ ok: true });
});

// Upload a photo/document.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ file: `media/${req.file.filename}`, id: `m_${Date.now()}` });
});

// Static viewer/editor (index.html, src/, styles/, vendor/, data/schema.md, …).
// Comes last so the volume-backed routes above win for /data/tree.json and /media.
app.use(express.static(APP_DIR, { extensions: ['html'] }));

await seed();
app.listen(PORT, () => {
  console.log(`Family tree server on :${PORT} (auth ${AUTH_DISABLED ? 'DISABLED — local only' : 'via Cloudflare Access'}), data in ${DATA_DIR}`);
});

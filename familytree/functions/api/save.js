// Phase 2 (OPTIONAL) — Cloudflare Pages Function for live in-browser saving.
//
// It verifies the visitor's Cloudflare Access session, then commits the posted
// tree.json to your PRIVATE GitHub repo on their behalf. With this deployed and
// SAVE_MODE='api' in src/editor/save.js, logged-in relatives can save directly
// instead of downloading a file for a curator to commit.
//
// Required Pages environment variables / secrets:
//   CF_ACCESS_TEAM_DOMAIN  e.g. "yourteam.cloudflareaccess.com"
//   CF_ACCESS_AUD          the Access application's Audience (AUD) tag
//   GITHUB_TOKEN           (secret) fine-grained PAT, contents:write on the repo only
//   GITHUB_REPO            e.g. "yourname/family-tree-private"
//   GITHUB_BRANCH          e.g. "main"
//   ALLOWED_EMAILS         (optional) comma-separated allowlist of editor emails
//
// JWT verification follows Cloudflare's recommended approach: validate the
// Cf-Access-Jwt-Assertion header against the team's remote JWKS and check `aud`.

export async function onRequestPost({ request, env }) {
  // 1. Verify the Cloudflare Access JWT.
  let claims;
  try {
    claims = await verifyAccessJwt(request, env);
  } catch (e) {
    return json({ error: `Unauthorized: ${e.message}` }, 403);
  }

  if (env.ALLOWED_EMAILS) {
    const allow = env.ALLOWED_EMAILS.split(',').map((s) => s.trim().toLowerCase());
    if (!allow.includes((claims.email || '').toLowerCase())) {
      return json({ error: 'Your account is not permitted to edit.' }, 403);
    }
  }

  // 2. Read and lightly sanity-check the posted tree.
  let tree;
  try {
    tree = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  if (!Array.isArray(tree.indis) || !Array.isArray(tree.fams)) {
    return json({ error: 'Body must be a tree with indis[] and fams[].' }, 400);
  }

  // 3. Commit data/tree.json to the private repo via the GitHub API.
  try {
    const result = await commitFile(env, 'data/tree.json',
      JSON.stringify(tree, null, 2),
      `Update family tree (edited by ${claims.email || 'unknown'})`);
    return json({ ok: true, commit: result.commit?.sha });
  } catch (e) {
    return json({ error: `Commit failed: ${e.message}` }, 502);
  }
}

// --- Cloudflare Access JWT verification (remote JWKS, RS256) ---------------

let jwksCache = { keys: null, at: 0 };

async function getJwks(teamDomain) {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('could not fetch JWKS');
  const { keys } = await res.json();
  jwksCache = { keys, at: Date.now() };
  return keys;
}

async function verifyAccessJwt(request, env) {
  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token) throw new Error('missing Access token');
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) throw new Error('server not configured');

  const [headerB64, payloadB64, sigB64] = token.split('.');
  const header = JSON.parse(b64urlToString(headerB64));
  const keys = await getJwks(env.CF_ACCESS_TEAM_DOMAIN);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('signing key not found');

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key,
    b64urlToBytes(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`));
  if (!valid) throw new Error('bad signature');

  const claims = JSON.parse(b64urlToString(payloadB64));
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(env.CF_ACCESS_AUD)) throw new Error('aud mismatch');
  if (claims.exp && Date.now() / 1000 > claims.exp) throw new Error('token expired');
  return claims;
}

// --- GitHub commit (create-or-update single file) --------------------------

async function commitFile(env, path, content, message) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  const base = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'familytree-save-fn',
  };

  // Get current SHA (if the file exists) so we update rather than fail.
  let sha;
  const cur = await fetch(`${base}?ref=${branch}`, { headers });
  if (cur.ok) sha = (await cur.json()).sha;

  const res = await fetch(base, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message,
      branch,
      content: stringToB64(content),
      sha,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- small helpers ---------------------------------------------------------

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const b64urlToString = (s) => new TextDecoder().decode(b64urlToBytes(s));

function stringToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

// Build step for the family-tree site.
//
// Why this exists: Topola ships CommonJS only (no UMD/CDN build), so we use
// esbuild to produce a single browser global `topola` bundle. Fuse.js already
// ships a browser ESM build, so we just copy (vendor) a pinned copy of it.
//
// Output is committed to the repo so deployment is pure static (no build needed
// on the host). Re-run `npm run build` after bumping the topola/fuse versions.

import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const r = (...p) => resolve(root, ...p);

await mkdir(r('src/lib'), { recursive: true });
await mkdir(r('vendor'), { recursive: true });

// 1. Bundle Topola into a browser global `topola` (IIFE).
await build({
  entryPoints: [r('node_modules/topola/dist/index.js')],
  bundle: true,
  format: 'iife',
  globalName: 'topola',
  outfile: r('src/lib/topola.bundle.js'),
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
});

// 2. Vendor the pinned Fuse.js ESM build.
await copyFile(
  r('node_modules/fuse.js/dist/fuse.min.mjs'),
  r('vendor/fuse.min.mjs'),
);

console.log('Build complete: src/lib/topola.bundle.js, vendor/fuse.min.mjs');

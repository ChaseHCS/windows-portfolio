#!/usr/bin/env node
// Regenerates assets/manifest.json from the files present in assets/.
// Run after adding or removing original Win95 assets:
//
//   node scripts/scan-assets.mjs

import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const DIRS = {
  icons: /\.png$/i,
  fonts: /\.(woff2?|ttf|otf)$/i,
  sounds: /\.wav$/i,
  cursors: /\.cur$/i,
  boot: /\.png$/i,
};

const manifest = {};
for (const [dir, re] of Object.entries(DIRS)) {
  const path = join(root, dir);
  manifest[dir] = existsSync(path) ? readdirSync(path).filter((f) => re.test(f)).sort() : [];
}

writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const [dir, files] of Object.entries(manifest)) console.log(`${dir.padEnd(8)} ${files.length} file(s)`);
console.log('Wrote assets/manifest.json');

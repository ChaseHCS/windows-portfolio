// Original-asset registry. assets/manifest.json lists which original Win95
// files are present (regenerate it with `node scripts/scan-assets.mjs`), so
// nothing missing is ever requested. Without a manifest every slot is probed.

const FONT_FACES = {
  'ms-sans-serif': ['W95 Sans', 'normal'],
  'ms-sans-serif-bold': ['W95 Sans', 'bold'],
  fixedsys: ['W95 Fixedsys', 'normal'],
  dos: ['W95 Terminal', 'normal'],
};

/** null = no manifest (probe mode). */
let manifest = null;

export async function loadAssetManifest() {
  try {
    const res = await fetch('assets/manifest.json', { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch {
    manifest = null;
  }
  loadFonts();
  loadCursors();
  return manifest;
}

export const probeMode = () => manifest === null;

/** Does assets/<dir>/<file> exist? undefined = unknown (probe it). */
export function listed(dir, file) {
  if (!manifest) return undefined;
  return (manifest[dir] || []).includes(file);
}

const abs = (path) => new URL(path, location.href).href;

function loadFonts() {
  const files = manifest
    ? manifest.fonts || []
    : Object.keys(FONT_FACES).flatMap((base) => [`${base}.woff2`, `${base}.ttf`]);
  const seen = new Set();
  for (const file of files) {
    const base = file.replace(/\.(woff2?|ttf|otf)$/i, '');
    const spec = FONT_FACES[base];
    if (!spec || seen.has(base)) continue;
    const face = new FontFace(spec[0], `url("${abs('assets/fonts/' + file)}")`, { weight: spec[1], display: 'swap' });
    face
      .load()
      .then((f) => {
        seen.add(base);
        document.fonts.add(f);
      })
      .catch(() => {});
  }
}

function loadCursors() {
  const root = document.documentElement.style;
  for (const [file, prop, fallback] of [
    ['arrow.cur', '--cursor-arrow', 'default'],
    ['busy.cur', '--cursor-busy', 'progress'],
  ]) {
    if (!listed('cursors', file)) continue;
    root.setProperty(prop, `url("${abs('assets/cursors/' + file)}"), ${fallback}`);
  }
}

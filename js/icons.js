// Icon registry. Each slot uses an original asset from assets/icons/<name>.png
// (32x32) and <name>-16.png (16x16) when assets/manifest.json lists it, and the
// built-in lookalike from icon-fallbacks.js otherwise.

import { FALLBACK_ICONS } from './icon-fallbacks.js';
import { listed } from './assets.js';

const ICON_DIR = 'assets/icons/';
const found = new Map(); // name -> { 32?: url, 16?: url }
const fallbackCache = new Map();

function probe(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/** Detect which original icons have been dropped into assets/icons/. */
export async function loadIcons(names = Object.keys(FALLBACK_ICONS)) {
  await Promise.all(
    names.map(async (name) => {
      const has = async (file) => listed('icons', file) ?? (await probe(ICON_DIR + file));
      if (!(await has(`${name}.png`))) return;
      const entry = { 32: `${ICON_DIR}${name}.png` };
      if (await has(`${name}-16.png`)) entry[16] = `${ICON_DIR}${name}-16.png`;
      found.set(name, entry);
    }),
  );
}

function fallbackURL(name) {
  if (!fallbackCache.has(name)) {
    const svg = FALLBACK_ICONS[name] || FALLBACK_ICONS['file-generic'] || '<svg xmlns="http://www.w3.org/2000/svg"/>';
    fallbackCache.set(name, 'data:image/svg+xml,' + encodeURIComponent(svg));
  }
  return fallbackCache.get(name);
}

export function iconURL(name, size = 32) {
  const f = found.get(name);
  if (f) return f[size] || f[32];
  return fallbackURL(name);
}

export function hasOriginal(name) {
  return found.has(name);
}

export function icon(name, size = 32, extraClass = '') {
  const img = new Image(size, size);
  img.src = iconURL(name, size);
  img.alt = '';
  img.draggable = false;
  img.className = `icon icon${size}${extraClass ? ' ' + extraClass : ''}`;
  return img;
}

/**
 * Icon in a wrapper that supports the Win95 selection dither (and an optional
 * shortcut arrow overlay).
 */
export function iconWrap(name, { shortcut = false, size = 32 } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'icon-wrap';
  if (size !== 32) wrap.style.width = wrap.style.height = size + 'px';
  const url = iconURL(name, size);
  wrap.style.setProperty('--icon', `url("${url}")`);
  wrap.append(icon(name, size));
  if (shortcut) wrap.append(icon('shortcut-overlay', size, 'overlay'));
  return wrap;
}

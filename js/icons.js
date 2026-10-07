// Icon registry. Each icon slot first looks for an original asset in
// assets/icons/<name>.png (32x32) and assets/icons/<name>-16.png (16x16).
// Anything missing falls back to the built-in lookalike in icon-fallbacks.js.

import { FALLBACK_ICONS } from './icon-fallbacks.js';

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
      const big = `${ICON_DIR}${name}.png`;
      if (!(await probe(big))) return;
      const entry = { 32: big };
      const small = `${ICON_DIR}${name}-16.png`;
      if (await probe(small)) entry[16] = small;
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

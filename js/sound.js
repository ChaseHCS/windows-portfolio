// System sounds. Drop original .wav files into assets/sounds/ (see assets/README.md).
// Missing files are remembered and silently skipped.

import { storage, store } from './util.js';

const DIR = 'assets/sounds/';
const missing = new Set();
const cache = new Map();
let muted = storage('muted', false);
let volume = storage('volume', 0.8);
let enabled = true;

export function setSoundEnabled(on) {
  enabled = on;
}

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = m;
  store('muted', m);
}

export function getVolume() {
  return volume;
}

export function setVolume(v) {
  volume = v;
  store('volume', v);
}

/** names: startup, shutdown, ding, chord, chimes, tada, recycle, logoff */
export function play(name) {
  if (!enabled || muted || missing.has(name)) return Promise.resolve(false);
  let audio = cache.get(name);
  if (!audio) {
    audio = new Audio(`${DIR}${name}.wav`);
    audio.preload = 'auto';
    audio.addEventListener('error', () => missing.add(name), { once: true });
    cache.set(name, audio);
  }
  try {
    audio.currentTime = 0;
    audio.volume = volume;
    return audio.play().then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** Resolves when the given sound finishes (or immediately if it can't play). */
export async function playAndWait(name, maxMs = 6000) {
  const ok = await play(name);
  if (!ok) return;
  const audio = cache.get(name);
  await new Promise((r) => {
    const t = setTimeout(r, maxMs);
    audio.addEventListener('ended', () => (clearTimeout(t), r()), { once: true });
  });
}

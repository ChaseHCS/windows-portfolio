// Boot (BIOS POST -> "Starting Windows 95..." -> splash), shutdown and logon screens.
// Original bitmaps can be dropped into assets/boot/ (see assets/README.md).

import { h, sleep } from './util.js';
import { config } from './config.js';
import { listed } from './assets.js';

const SPLASH = 'assets/boot/splash.png';
const SHUTTING_DOWN = 'assets/boot/shutting-down.png';
const SAFE_OFF = 'assets/boot/safe-to-turn-off.png';

const exists = (url) =>
  listed('boot', url.split('/').pop()) === false ? Promise.resolve(false) : new Promise((r) => {
    const img = new Image();
    img.onload = () => r(true);
    img.onerror = () => r(false);
    img.src = url;
  });

let screen;
function getScreen() {
  if (!screen) screen = document.getElementById('boot');
  return screen;
}

function show(cls, ...children) {
  const el = getScreen();
  el.className = 'boot ' + cls;
  el.replaceChildren(...children);
  el.hidden = false;
  return el;
}

export function hideBoot() {
  const el = getScreen();
  el.hidden = true;
  el.replaceChildren();
}

/** Interruptible wait: resolves early when the visitor presses a key / clicks. */
function skippable() {
  let skipped = false;
  const listeners = [];
  const on = () => (skipped = true);
  for (const ev of ['keydown', 'pointerdown']) {
    document.addEventListener(ev, on, true);
    listeners.push(ev);
  }
  return {
    get skipped() {
      return skipped;
    },
    async wait(ms) {
      const end = performance.now() + ms;
      while (!skipped && performance.now() < end) await sleep(Math.min(40, end - performance.now()));
    },
    dispose() {
      listeners.forEach((ev) => document.removeEventListener(ev, on, true));
    },
  };
}

async function bios(s) {
  const pre = h('pre', { class: 'bios-text' });
  const energy = h('div', { class: 'energy-star' }, h('span', null, 'energy'), h('b', null, 'EPA POLLUTION PREVENTER'));
  show('bios', energy, pre);
  const add = (t = '') => (pre.textContent += t + '\n');
  const owner = config.owner;
  add('Award Modular BIOS v4.51PG, An Energy Star Ally');
  add('Copyright (C) 1984-95, Award Software, Inc.');
  add('');
  add(`#401A0-0104 ${owner.handle.toUpperCase()} PORTFOLIO BIOS`);
  add('');
  add('PENTIUM-S CPU at 133MHz');
  pre.textContent += 'Memory Test :  ';
  const memStart = pre.textContent.length;
  for (let k = 0; k <= 32768 && !s.skipped; k += 1024) {
    pre.textContent = pre.textContent.slice(0, memStart) + `${k}K`;
    await sleep(18);
  }
  pre.textContent = pre.textContent.slice(0, memStart) + '32768K OK\n';
  add('');
  await s.wait(250);
  add('Award Plug and Play BIOS Extension  v1.0A');
  add('Copyright (C) 1995, Award Software, Inc.');
  await s.wait(300);
  const detect = [
    ['Primary Master  ', `${owner.handle.toUpperCase().slice(0, 12)} HDD 1.2GB`],
    ['Primary Slave   ', 'None'],
    ['Secondary Master', 'ATAPI CD-ROM 4X'],
    ['Secondary Slave ', 'None'],
  ];
  for (const [slot, dev] of detect) {
    pre.textContent += `  Detecting HDD ${slot} ... `;
    await s.wait(220);
    add(dev);
  }
  add('');
  add('');
  add('');
  add('Press DEL to enter SETUP');
  add(`${new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replace(/\//g, '/')}-i430FX-2A59GF09C-00`);
  await s.wait(900);
}

async function splashScreen(minMs, s, until) {
  const hasImg = await exists(SPLASH);
  const content = hasImg
    ? h('img', { src: SPLASH, class: 'boot-img', alt: '' })
    : h(
        'div',
        { class: 'splash-art' },
        h('div', { class: 'splash-logo' }, h('div', { class: 'splash-flag' }), h('div', { class: 'splash-words' }, h('small', null, 'Microsoft'), h('span', null, h('b', null, 'Windows'), h('sup', null, '95')))),
      );
  show('splash', content, h('div', { class: 'splash-bar' }));
  await Promise.all([s.wait(minMs), until]);
}

/**
 * Full or quick boot. `loading` is a promise for everything the desktop needs.
 * full=true shows the BIOS POST first.
 */
export async function boot({ full, loading }) {
  const s = skippable();
  document.body.classList.add('busy');
  try {
    if (full) {
      await bios(s);
      show('starting', h('pre', { class: 'bios-text' }, 'Starting Windows 95...'));
      await s.wait(900);
    }
    await splashScreen(full ? 2200 : 500, s, loading);
  } finally {
    s.dispose();
    document.body.classList.remove('busy');
  }
}

/** The two shutdown screens. Resolves after the "safe to turn off" screen is clicked. */
export async function shutdownScreens() {
  const hasImg = await exists(SHUTTING_DOWN);
  show(
    'shutting-down',
    hasImg
      ? h('img', { src: SHUTTING_DOWN, class: 'boot-img', alt: '' })
      : h('div', { class: 'splash-art' }, h('div', { class: 'shutdown-msg' }, 'Please wait while your computer shuts down.'), h('div', { class: 'splash-logo' }, h('div', { class: 'splash-flag' }), h('div', { class: 'splash-words' }, h('small', null, 'Microsoft'), h('span', null, h('b', null, 'Windows'), h('sup', null, '95'))))),
  );
  await sleep(2500);
  const safe = await exists(SAFE_OFF);
  show('safe-off', safe ? h('img', { src: SAFE_OFF, class: 'boot-img', alt: '' }) : h('div', { class: 'safe-msg' }, "It's now safe to turn off", h('br'), 'your computer.'));
  await sleep(400);
  await new Promise((r) => {
    const go = () => {
      document.removeEventListener('pointerdown', go, true);
      document.removeEventListener('keydown', go, true);
      r();
    };
    document.addEventListener('pointerdown', go, true);
    document.addEventListener('keydown', go, true);
  });
}

export async function blackScreen(ms = 600) {
  show('black');
  await sleep(ms);
}

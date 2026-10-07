// Taskbar: Start button + Start menu, window buttons, tray (volume, clock).

import { h, formatTime, formatLongDate } from './util.js';
import { icon } from './icons.js';
import { wmEvents, allWindows, activeWindow } from './wm.js';
import { buildRow, openCustomRoot, closeMenus, isMenuOpen } from './menu.js';
import { attachTooltip } from './tooltip.js';
import { fs, displayName } from './fs.js';
import { openNode, launch } from './shell.js';
import { isMuted, setMuted, getVolume, setVolume, play } from './sound.js';

let startBtn, startMenu, taskButtons, startOpen = false;

export function initTaskbar() {
  const bar = document.getElementById('taskbar');
  startBtn = h('button', { id: 'start-button', class: 'btn', 'aria-label': 'Start' }, icon('windows-logo', 16), h('span', null, 'Start'));
  taskButtons = h('div', { id: 'task-buttons' });
  const speaker = icon('speaker', 16, 'tray-icon');
  const clock = h('div', { id: 'clock' });
  bar.append(startBtn, taskButtons, h('div', { id: 'tray' }, speaker, clock));

  startMenu = buildStartMenu();
  document.body.append(startMenu);

  startBtn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    toggleStart();
  });
  attachTooltip(startBtn, 'Click here to begin.');
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Escape') {
      e.preventDefault();
      toggleStart();
    }
  });

  const tick = () => {
    clock.textContent = formatTime(new Date());
  };
  tick();
  setInterval(tick, 1000);
  attachTooltip(clock, () => formatLongDate(new Date()));
  clock.addEventListener('dblclick', () => launch('applet', 'datetime'));

  attachTooltip(speaker, 'Volume');
  speaker.addEventListener('click', (e) => volumePopup(e, speaker));

  wmEvents.addEventListener('change', renderTasks);
  renderTasks();
}

// ---- Start menu -----------------------------------------------------------------

function docItem(node) {
  return { label: displayName(node), icon: 'text-file', action: () => openNode(node) };
}

function startItems() {
  return [
    {
      label: '&Writeups',
      icon: 'folder',
      subIcons: true,
      items: () => [
        ...fs.writeups.map(docItem),
        '-',
        { label: 'Open Writeups Folder', icon: 'folder-open', action: () => openNode(fs.writeupsDir) },
      ],
    },
    { label: '&About Me', icon: 'text-file', action: () => openNode(fs.docs[0]), hidden: !fs.docs[0] },
    '-',
    {
      label: '&Programs',
      icon: 'programs',
      subIcons: true,
      items: [
        {
          label: 'Accessories',
          icon: 'programs',
          subIcons: true,
          items: [
            { label: 'Games', icon: 'programs', subIcons: true, items: [{ label: 'Minesweeper', icon: 'minesweeper', action: () => launch('winmine') }] },
            { label: 'Notepad', icon: 'notepad', action: () => launch('notepad', null) },
          ],
        },
        { label: 'StartUp', icon: 'programs', subIcons: true, items: [] },
        { label: 'MS-DOS Prompt', icon: 'msdos', action: () => launch('msdos') },
        { label: 'Windows Explorer', icon: 'explorer', action: () => launch('explorer', fs.C) },
      ],
    },
    {
      label: '&Documents',
      icon: 'documents',
      subIcons: true,
      items: () => [...fs.docs, ...fs.writeups].map(docItem),
    },
    {
      label: '&Settings',
      icon: 'settings',
      subIcons: true,
      items: [
        { label: '&Control Panel', icon: 'control-panel', action: () => openNode(fs.cpanel) },
        { label: '&Printers', icon: 'printers', action: () => openNode(fs.printers) },
        { label: '&Taskbar...', icon: 'settings', disabled: true },
      ],
    },
    {
      label: '&Find',
      icon: 'find',
      subIcons: true,
      items: [
        { label: '&Files or Folders...', icon: 'find', action: () => launch('find') },
        { label: '&Computer...', icon: 'my-computer', disabled: true },
      ],
    },
    { label: '&Help', icon: 'help', action: () => launch('welcome', { force: true }) },
    { label: '&Run...', icon: 'run', action: () => launch('run') },
    '-',
    { label: 'Sh&ut Down...', icon: 'shutdown', action: () => launch('shutdown') },
  ];
}

function buildStartMenu() {
  const list = h('div', { class: 'start-items' });
  for (const it of startItems()) {
    if (it === '-') list.append(h('div', { class: 'menu-sep' }));
    else if (!it.hidden) list.append(buildRow(it, true, 'start-item'));
  }
  const band = h('div', { class: 'start-band' }, h('span', null, h('b', null, 'Windows'), h('i', null, '95')));
  const el = h('div', { id: 'start-menu', hidden: true }, band, list);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return el;
}

function toggleStart() {
  if (startOpen) return closeMenus();
  startOpen = true;
  startMenu.hidden = false;
  startBtn.classList.add('pressed');
  openCustomRoot(startMenu, {
    owner: startBtn,
    onClose: () => {
      startOpen = false;
      startMenu.hidden = true;
      startBtn.classList.remove('pressed');
    },
  });
}

export const openStartMenu = () => !startOpen && toggleStart();

// ---- Task buttons -----------------------------------------------------------------

function renderTasks() {
  const act = activeWindow();
  const wins = allWindows().filter((w) => w.taskbar);
  const existing = new Map([...taskButtons.children].map((b) => [b._win, b]));
  taskButtons.replaceChildren(
    ...wins.map((w) => {
      let b = existing.get(w);
      if (!b) {
        b = h('button', { class: 'btn task-button', 'data-wid': w.id });
        b._win = w;
        b.addEventListener('pointerdown', (e) => e.preventDefault());
        b.addEventListener('click', () => {
          if (w.minimized) w.restore();
          else if (activeWindow() === w) w.minimize();
          else w.focus();
        });
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          import('./menu.js').then((m) => m.openMenu(w.systemMenu(), { x: e.clientX, y: e.clientY }));
        });
        attachTooltip(b, () => (b.querySelector('span').scrollWidth > b.querySelector('span').clientWidth ? w.title : ''));
      }
      const key = `${w.iconName}|${w.title}`;
      if (b._key !== key) {
        b._key = key;
        b.replaceChildren(w.iconName ? icon(w.iconName, 16) : '', h('span', null, w.title));
      }
      b.classList.toggle('active', w === act && !w.minimized);
      return b;
    }),
  );
}

// ---- Volume ------------------------------------------------------------------------

let volEl = null;
function volumePopup(e, anchor) {
  if (volEl) return closeVol();
  const slider = h('input', { type: 'range', min: 0, max: 100, value: Math.round(getVolume() * 100), class: 'trackbar vertical', 'aria-label': 'Volume' });
  slider.addEventListener('input', () => setVolume(slider.value / 100));
  slider.addEventListener('change', () => play('ding'));
  const mute = h('input', { type: 'checkbox', checked: isMuted() });
  mute.addEventListener('change', () => setMuted(mute.checked));
  volEl = h(
    'div',
    { class: 'volume-popup' },
    h('div', null, 'Volume'),
    slider,
    h('label', { class: 'check' }, mute, h('span', { class: 'box' }), h('span', { class: 'lbl' }, h('u', { class: 'ak' }, 'M'), 'ute')),
  );
  document.body.append(volEl);
  const r = anchor.getBoundingClientRect();
  volEl.style.left = Math.min(innerWidth - volEl.offsetWidth - 2, r.left - volEl.offsetWidth / 2) + 'px';
  volEl.style.top = r.top - volEl.offsetHeight - 6 + 'px';
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
}
function outside(e) {
  if (volEl && !volEl.contains(e.target)) closeVol();
}
function closeVol() {
  volEl?.remove();
  volEl = null;
  document.removeEventListener('pointerdown', outside, true);
}

export { isMenuOpen };

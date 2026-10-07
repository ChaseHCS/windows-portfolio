// Control Panel applets.

import { h, storage, store, formatLongDate, formatTime } from '../util.js';
import { icon } from '../icons.js';
import { messageBox, propertySheet, infoGrid } from '../dialogs.js';
import { config } from '../config.js';
import { isMuted, setMuted, play } from '../sound.js';

const DESKTOP_COLORS = [
  ['Teal (Windows Standard)', '#008080'],
  ['Black', '#000000'],
  ['Navy', '#000080'],
  ['Dark Green', '#008000'],
  ['Maroon', '#800000'],
  ['Purple', '#800080'],
  ['Olive', '#808000'],
  ['Gray', '#808080'],
  ['Silver', '#c0c0c0'],
];

export function applyDisplaySettings() {
  const s = storage('display', {});
  document.documentElement.style.setProperty('--desktop', s.color || '#008080');
  const desk = document.getElementById('desktop');
  const wp = (config.settings.wallpapers || []).find((w) => w.src === s.wallpaper);
  desk.style.backgroundImage = wp ? `url("${wp.src}")` : '';
  desk.style.backgroundRepeat = s.tile ? 'repeat' : 'no-repeat';
  desk.style.backgroundSize = s.tile ? 'auto' : s.stretch ? 'cover' : 'auto';
}

function display() {
  const s = storage('display', {});
  const wallpapers = [{ name: '(None)', src: '' }, ...(config.settings.wallpapers || [])];
  const preview = h('div', { class: 'monitor' }, h('div', { class: 'monitor-screen' }));
  const screen = preview.firstChild;
  const list = h('select', { class: 'field listbox', size: 6 }, ...wallpapers.map((w) => h('option', { value: w.src, selected: (s.wallpaper || '') === w.src }, w.name)));
  const tile = h('input', { type: 'radio', name: 'wp-mode', checked: !!s.tile });
  const center = h('input', { type: 'radio', name: 'wp-mode', checked: !s.tile });
  const colors = h('select', { class: 'field' }, ...DESKTOP_COLORS.map(([n, c]) => h('option', { value: c, selected: (s.color || '#008080') === c }, n)));
  const update = () => {
    screen.style.background = colors.value;
    if (list.value) screen.style.backgroundImage = `url("${list.value}")`;
    screen.style.backgroundSize = tile.checked ? '16px' : 'contain';
    screen.style.backgroundRepeat = tile.checked ? 'repeat' : 'no-repeat';
    screen.style.backgroundPosition = 'center';
  };
  [list, tile, center, colors].forEach((el) => el.addEventListener('change', update));
  update();
  const apply = () => {
    store('display', { wallpaper: list.value, tile: tile.checked, color: colors.value });
    applyDisplaySettings();
  };
  const background = h(
    'div',
    { class: 'display-bg' },
    preview,
    h(
      'div',
      { class: 'display-row' },
      h('fieldset', { class: 'group' }, h('legend', null, 'Wallpaper'), list, h('div', { class: 'wp-mode' }, h('label', { class: 'radio' }, tile, h('span', { class: 'box' }), h('span', { class: 'lbl' }, 'Tile')), h('label', { class: 'radio' }, center, h('span', { class: 'box' }), h('span', { class: 'lbl' }, 'Center')))),
      h('fieldset', { class: 'group' }, h('legend', null, 'Desktop color'), colors),
    ),
  );
  propertySheet({ title: 'Display Properties', tabs: [{ label: 'Background', content: background }], width: 400, onOK: apply });
}

function system() {
  const o = config.owner;
  const content = h(
    'div',
    { class: 'system-general' },
    h('div', { class: 'system-art' }, icon('system', 32)),
    infoGrid([
      ['System:', 'Microsoft Windows 95\n4.00.950'],
      ['Registered to:', `${o.name}\n${o.organization || o.title || ''}\n24796-OEM-0014736-66386`],
      ['Computer:', 'Pentium(r)\n32.0MB RAM'],
    ]),
  );
  propertySheet({ title: 'System Properties', tabs: [{ label: 'General', content }], width: 380 });
}

function sounds() {
  const mute = h('input', { type: 'checkbox', checked: !isMuted() });
  const content = h(
    'div',
    { class: 'sounds-tab' },
    h('div', null, 'Windows plays sounds for system events such as starting up, errors and shutting down.'),
    h('br'),
    h('label', { class: 'check' }, mute, h('span', { class: 'box' }), h('span', { class: 'lbl' }, 'Play system sounds')),
    h('br'),
    h('button', { class: 'btn', onclick: () => play('tada') }, 'Preview'),
  );
  propertySheet({ title: 'Sounds Properties', tabs: [{ label: 'Sounds', content }], onOK: () => setMuted(!mute.checked) });
}

function datetime() {
  const now = new Date();
  const content = infoGrid([
    ['Date:', formatLongDate(now)],
    ['Time:', formatTime(now)],
    ['Time zone:', Intl.DateTimeFormat().resolvedOptions().timeZone || ''],
  ]);
  propertySheet({ title: 'Date/Time Properties', tabs: [{ label: 'Date & Time', content }] });
}

export function openApplet(name) {
  switch (name) {
    case 'display':
      return display();
    case 'system':
      return system();
    case 'sounds':
      return sounds();
    case 'datetime':
      return datetime();
    case 'add-printer':
      return messageBox({ title: 'Add Printer Wizard', text: 'Windows could not find a printer port. Check that your printer cable is connected and try again.', icon: 'warning' });
    case 'new-connection':
      return messageBox({ title: 'Make New Connection', text: 'Dial-Up Networking requires a modem, and no modem is installed.\n\n(It is the 2020s. Try Wi-Fi.)', icon: 'info' });
  }
}

// The Win95 "Welcome" screen, repurposed as a guide to the portfolio.

import { h, storage, store } from '../util.js';
import { icon } from '../icons.js';
import { createWindow } from '../wm.js';
import { config } from '../config.js';
import { fs } from '../fs.js';
import { openNode } from '../shell.js';

function tips() {
  const o = config.owner;
  return [
    `Each text document on the desktop is one of ${o.name}'s writeups. Double-click one to open it in Notepad.`,
    'You can find every writeup in My Computer, under C:\\My Documents\\Writeups. Try View > Details to sort them by date.',
    'The MS-DOS Prompt works. Try DIR, CD WRITEUPS, TYPE, TREE, or WHOAMI.',
    'Use Start > Find > Files or Folders to search the text of every writeup.',
    'You can drag desktop icons around. Right-click the desktop and choose Arrange Icons to put them back.',
    'Links in documents are clickable. Contact.txt has the best ways to get in touch.',
    'To print a document such as Resume.txt, open it and choose File > Print.',
    'Minesweeper is in Start > Programs > Accessories > Games. Your best times are saved.',
    'On a phone or tablet, tap an icon once to open it.',
  ];
}

export function openWelcome({ force = false } = {}) {
  if (!force && (!config.settings.welcomeScreen || storage('welcome-hidden', false))) return null;
  let tipIdx = storage('welcome-tip', 0) % tips().length;
  store('welcome-tip', tipIdx + 1);

  const win = createWindow({
    key: 'welcome',
    title: 'Welcome',
    dialog: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    taskbar: true,
    center: true,
    width: 470,
    className: 'welcome',
  });
  if (win.ready) return win;
  win.ready = true;

  const tipText = h('div', { class: 'tip-text' }, tips()[tipIdx]);
  const show = h('input', { type: 'checkbox', checked: !storage('welcome-hidden', false) });
  show.addEventListener('change', () => store('welcome-hidden', !show.checked));

  const btn = (label, fn, cls = '') => {
    const b = h('button', { class: 'btn ' + cls }, label);
    b.addEventListener('click', fn);
    return b;
  };
  const doc = (i) => () => fs.docs[i] && openNode(fs.docs[i]);
  const close = btn('Close', () => win.close(), 'default');

  win.body.append(
    h(
      'div',
      { class: 'welcome-head' },
      h('span', null, 'Welcome to '),
      h('b', null, config.owner.name),
      h('span', { class: 'welcome-sub' }, `'s Portfolio`),
    ),
    h(
      'div',
      { class: 'welcome-main' },
      h(
        'div',
        { class: 'welcome-tip' },
        h('div', { class: 'tip-head' }, icon('tip', 32), h('b', null, 'Did you know...')),
        tipText,
      ),
      h(
        'div',
        { class: 'welcome-buttons' },
        btn('About Me', doc(0)),
        btn('Writeups', () => openNode(fs.writeupsDir)),
        btn('Resume', doc(1)),
        btn('Contact', doc(2)),
        h('hr', { class: 'etched' }),
        btn('Next Tip', () => {
          tipIdx = (tipIdx + 1) % tips().length;
          tipText.textContent = tips()[tipIdx];
        }),
        h('hr', { class: 'etched' }),
        close,
      ),
    ),
    h(
      'label',
      { class: 'check welcome-show' },
      show,
      h('span', { class: 'box' }),
      h('span', { class: 'lbl' }, h('u', { class: 'ak' }, 'S'), 'how this Welcome Screen next time you start Windows'),
    ),
  );
  win.el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') win.close();
  });
  close.focus();
  return win;
}

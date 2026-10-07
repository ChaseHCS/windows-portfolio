// Start > Shut Down... and the Win95 logon dialog.

import { h, sleep } from '../util.js';
import { icon } from '../icons.js';
import { createWindow, closeAll, findWindow } from '../wm.js';
import { config } from '../config.js';
import { playAndWait, play } from '../sound.js';
import { shutdownScreens, blackScreen, boot, hideBoot } from '../boot.js';
import { openMsDos } from './msdos.js';

const OPTIONS = [
  ['shutdown', '&Shut down the computer?'],
  ['restart', '&Restart the computer?'],
  ['msdos', 'Restart the computer in &MS-DOS mode?'],
  ['logoff', '&Close all programs and log on as a different user?'],
];

export function openShutdown() {
  const open = findWindow('shutdown');
  if (open) return open.focus();
  // Win95 dims the whole screen (taskbar included) with a 50% dither.
  const dither = h('div', { class: 'shutdown-dither' });
  const tbDither = h('div', { class: 'shutdown-dither' });
  document.getElementById('windows').append(dither);
  document.getElementById('taskbar').append(tbDither);

  const win = createWindow({
    key: 'shutdown',
    title: 'Shut Down Windows',
    dialog: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    taskbar: false,
    center: true,
    className: 'shutdown-dialog',
    width: 330,
    afterClose: () => {
      dither.remove();
      tbDither.remove();
    },
  });
  dither.style.zIndex = Number(win.el.style.zIndex) - 1;

  const radios = OPTIONS.map(([value, label], i) => {
    const input = h('input', { type: 'radio', name: 'shutdown-choice', value, checked: i === 0 });
    const lbl = h('label', { class: 'radio' }, input, h('span', { class: 'box' }), h('span', { class: 'lbl' }));
    lbl.lastChild.append(...renderAccel(label));
    return { input, lbl };
  });
  const yes = h('button', { class: 'btn default' }, h('u', { class: 'ak' }, 'Y'), 'es');
  const no = h('button', { class: 'btn' }, h('u', { class: 'ak' }, 'N'), 'o');
  const help = h('button', { class: 'btn' }, h('u', { class: 'ak' }, 'H'), 'elp');
  win.body.append(
    h('div', { class: 'shutdown-main' }, icon('shutdown', 32), h('div', null, h('div', { class: 'shutdown-q' }, 'Are you sure you want to:'), ...radios.map((r) => r.lbl))),
    h('div', { class: 'shutdown-buttons' }, yes, no, help),
  );
  yes.addEventListener('click', () => {
    const choice = radios.find((r) => r.input.checked).input.value;
    win.close();
    perform(choice);
  });
  no.addEventListener('click', () => win.close());
  help.addEventListener('click', () => {
    win.close();
    import('../shell.js').then((m) => m.launch('welcome', { force: true }));
  });
  win.el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') win.close();
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      yes.click();
    }
  });
  yes.focus();
  return win;
}

function renderAccel(label) {
  const out = [];
  const m = /^(.*?)&(.)(.*)$/.exec(label);
  if (!m) return [label];
  if (m[1]) out.push(m[1]);
  out.push(h('u', { class: 'ak' }, m[2]));
  if (m[3]) out.push(m[3]);
  return out;
}

function rebootPage() {
  try {
    sessionStorage.setItem('w95:forceBoot', '1');
  } catch {
    /* ignore */
  }
  location.reload();
}

async function perform(choice) {
  closeAll();
  if (choice === 'shutdown') {
    await Promise.all([playAndWait('shutdown', 4000), shutdownScreens()]);
    rebootPage();
  } else if (choice === 'restart') {
    const p = playAndWait('shutdown', 4000);
    await blackScreen(300);
    await p;
    rebootPage();
  } else if (choice === 'msdos') {
    await blackScreen(500);
    openMsDos({
      fullscreen: true,
      onExit: async () => {
        await boot({ full: false, loading: Promise.resolve() });
        hideBoot();
        play('startup');
      },
    });
    hideBoot();
  } else if (choice === 'logoff') {
    await playAndWait('logoff', 2000);
    logon();
  }
}

/** Win95 "Welcome to Windows" logon box. Like the original, Cancel lets you in anyway. */
export function logon() {
  document.body.classList.add('logged-off');
  const user = h('input', { type: 'text', class: 'field', value: config.owner.handle, 'aria-label': 'User name' });
  const pass = h('input', { type: 'password', class: 'field', 'aria-label': 'Password' });
  const ok = h('button', { class: 'btn default' }, 'OK');
  const cancel = h('button', { class: 'btn' }, 'Cancel');
  const win = createWindow({
    title: 'Welcome to Windows',
    dialog: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    helpButton: true,
    taskbar: false,
    center: true,
    width: 410,
    className: 'logon-dialog',
    afterClose: async () => {
      document.body.classList.remove('logged-off');
      await sleep(100);
      play('startup');
    },
  });
  win.body.append(
    h(
      'div',
      { class: 'logon-main' },
      icon('keys', 32, 'logon-key'),
      h(
        'div',
        { class: 'logon-fields' },
        h('div', null, 'Type a user name and password to log on to Windows.'),
        h('label', { class: 'logon-row' }, h('span', null, h('u', { class: 'ak' }, 'U'), 'ser name:'), user),
        h('label', { class: 'logon-row' }, h('span', null, h('u', { class: 'ak' }, 'P'), 'assword:'), pass),
      ),
      h('div', { class: 'logon-buttons' }, ok, cancel),
    ),
  );
  ok.addEventListener('click', () => win.close(true));
  cancel.addEventListener('click', () => win.close(true));
  win.el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      win.close(true);
    }
  });
  pass.focus();
  return win;
}

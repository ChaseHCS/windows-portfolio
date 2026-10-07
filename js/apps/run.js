// Start > Run...

import { h, storage, store } from '../util.js';
import { icon } from '../icons.js';
import { createWindow, desktopRect } from '../wm.js';
import { messageBox } from '../dialogs.js';
import { runCommand, launch } from '../shell.js';
import { openMenu } from '../menu.js';

export function openRun() {
  const desk = desktopRect();
  const win = createWindow({
    key: 'run',
    title: 'Run',
    dialog: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    taskbar: false,
    className: 'run-dialog',
    width: 347,
    x: 4,
    y: desk.h - 190,
  });
  if (win.ready) return win;
  win.ready = true;

  const history = storage('run-history', ['notepad', 'command', 'winmine']);
  const input = h('input', { type: 'text', class: 'field', value: history[0] || '', 'aria-label': 'Open' });
  const drop = h('button', { class: 'combo-btn', tabindex: '-1', 'aria-label': 'History' });
  const ok = h('button', { class: 'btn default' }, 'OK');
  const cancel = h('button', { class: 'btn' }, 'Cancel');
  const browse = h('button', { class: 'btn' }, h('u', { class: 'ak' }, 'B'), 'rowse...');

  win.body.append(
    h(
      'div',
      { class: 'run-main' },
      icon('run', 32),
      h('div', null, 'Type the name of a program, folder, or document, and Windows will open it for you.'),
    ),
    h('div', { class: 'run-row' }, h('label', null, h('u', { class: 'ak' }, 'O'), 'pen:'), h('div', { class: 'combo' }, input, drop)),
    h('div', { class: 'run-buttons' }, ok, cancel, browse),
  );

  const submit = async () => {
    const cmd = input.value.trim();
    if (!cmd) return;
    win.close();
    if (runCommand(cmd)) {
      store('run-history', [cmd, ...history.filter((x) => x !== cmd)].slice(0, 10));
    } else {
      await messageBox({
        title: cmd,
        text: `Cannot find the file '${cmd}' (or one of its components). Make sure the path and filename are correct and that all required libraries are available.`,
        icon: 'error',
      });
      openRun();
    }
  };
  ok.addEventListener('click', submit);
  cancel.addEventListener('click', () => win.close());
  browse.addEventListener('click', () => {
    win.close();
    launch('explorer', null);
  });
  drop.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = input.getBoundingClientRect();
    openMenu(
      history.map((cmd) => ({ label: cmd.replace(/&/g, '&&'), action: () => ((input.value = cmd), input.focus()) })),
      { anchorRect: r, placement: 'below', owner: drop, className: 'combo-list' },
    );
  });
  win.el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') win.close();
  });
  input.focus();
  input.select();
  return win;
}

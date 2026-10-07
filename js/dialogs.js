// Standard dialogs: message boxes, About boxes, property sheets.

import { h, accel } from './util.js';
import { icon } from './icons.js';
import { createWindow } from './wm.js';
import { play } from './sound.js';
import { config } from './config.js';

const ICON_SOUND = { error: 'chord', warning: 'chord', info: 'ding', question: 'ding' };

/**
 * messageBox({ title, text, icon: 'error'|'warning'|'info'|'question', buttons, defaultIndex, parent })
 * Resolves with the label of the button pressed (or the cancel button on Esc / close).
 */
export function messageBox({ title = '', text = '', icon: kind = null, buttons = ['OK'], defaultIndex = 0, parent = null, width } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const cancelLabel = buttons.find((b) => /^(cancel|no|ok)$/i.test(b)) || buttons[buttons.length - 1];
    const win = createWindow({
      title,
      parent,
      dialog: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      taskbar: !parent,
      center: true,
      className: 'msgbox',
      width,
      afterClose: () => resolve(result ?? cancelLabel),
    });
    const textEl = h('div', { class: 'msgbox-text' });
    for (const [i, para] of String(text).split('\n').entries()) {
      if (i) textEl.append(h('br'));
      textEl.append(para);
    }
    const btnRow = h('div', { class: 'msgbox-buttons' });
    const btnEls = buttons.map((label, i) =>
      h(
        'button',
        {
          class: 'btn' + (i === defaultIndex ? ' default' : ''),
          onclick: () => {
            result = label.replace(/&/g, '');
            win.close(true);
          },
        },
        accel(label),
      ),
    );
    btnRow.append(...btnEls);
    win.body.append(h('div', { class: 'msgbox-main' }, kind ? icon('msg-' + kind, 32, 'msgbox-icon') : null, textEl), btnRow);
    win.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        result = cancelLabel;
        win.close(true);
      }
    });
    win.center();
    // Defer focus so the key press that opened the box can't also press its button.
    setTimeout(() => btnEls[defaultIndex]?.focus(), 0);
    if (kind) play(ICON_SOUND[kind]);
  });
}

export const alertError = (title, text, parent) => messageBox({ title, text, icon: 'error', parent });

/** Win95 "Access is denied" style error used for write operations. */
export function accessDenied(what, parent) {
  return messageBox({
    title: 'Error Deleting File',
    text: `Cannot delete ${what}: Access is denied.\n\nMake sure the disk is not full or write-protected\nand that the file is not currently in use.`,
    icon: 'error',
    parent,
  });
}

/** "About <app>" dialog in the style of the Win95 shell About box. */
export function aboutBox({ app = 'Windows', appIcon = 'windows-logo', parent = null, extra = null } = {}) {
  const o = config.owner;
  const win = createWindow({
    title: `About ${app}`,
    parent,
    dialog: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    taskbar: !parent,
    className: 'about-box',
    width: 380,
  });
  const ok = h('button', { class: 'btn default', onclick: () => win.close() }, 'OK');
  win.body.append(
    h(
      'div',
      { class: 'about-main' },
      h('div', { class: 'about-logo' }, icon('windows-logo', 32)),
      h(
        'div',
        { class: 'about-text' },
        h('div', null, `Microsoft (R) ${app === 'Windows' ? 'Windows 95' : app}`),
        h('div', null, 'Windows 95'),
        h('div', null, 'Copyright (C) 1981-1995 Microsoft Corp.'),
        extra ? h('div', { class: 'about-extra' }, extra) : null,
        h(
          'div',
          { class: 'about-license' },
          h('div', { class: 'about-appicon' }, icon(appIcon, 32)),
          h('div', null, h('div', null, 'This product is licensed to:'), h('div', null, o.name), h('div', null, o.organization || o.handle || '')),
        ),
        h('hr', { class: 'etched' }),
        h('div', { class: 'about-stat' }, h('span', null, 'Physical Memory Available to Windows:'), h('span', null, '32,768 KB')),
        h('div', { class: 'about-stat' }, h('span', null, 'System Resources:'), h('span', null, '86% Free')),
      ),
      h('div', { class: 'about-ok' }, ok),
    ),
  );
  win.el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      win.close();
    }
  });
  win.center();
  ok.focus();
  return win;
}

/** Simple tab strip. tabs: [{ label, content: Element }] */
export function tabControl(tabs, active = 0) {
  const strip = h('div', { class: 'tab-strip' });
  const panel = h('div', { class: 'tab-panel' });
  const root = h('div', { class: 'tabs' }, strip, panel);
  const select = (i) => {
    [...strip.children].forEach((t, j) => t.classList.toggle('active', i === j));
    panel.replaceChildren(tabs[i].content);
    root.dispatchEvent(new CustomEvent('tabchange', { detail: i }));
  };
  tabs.forEach((t, i) => strip.append(h('div', { class: 'tab', onpointerdown: () => select(i) }, accel(t.label))));
  select(active);
  root.select = select;
  return root;
}

/** A property sheet dialog with OK / Cancel / Apply. */
export function propertySheet({ title, tabs, parent = null, width = 360, buttons = ['OK', 'Cancel', 'Apply'], onOK }) {
  const win = createWindow({
    title,
    parent,
    dialog: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    helpButton: true,
    taskbar: !parent,
    width,
    className: 'property-sheet',
  });
  const btns = buttons.map((b, i) =>
    h(
      'button',
      {
        class: 'btn' + (i === 0 ? ' default' : ''),
        disabled: b === 'Apply',
        onclick: () => {
          if (b === 'OK') onOK?.();
          if (b !== 'Apply') win.close();
        },
      },
      b,
    ),
  );
  win.body.append(tabControl(tabs), h('div', { class: 'sheet-buttons' }, ...btns));
  win.el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') win.close();
  });
  win.center();
  btns[0].focus();
  return win;
}

/** Two-column "label: value" grid used in property sheets. */
export function infoGrid(rows) {
  const grid = h('div', { class: 'info-grid' });
  for (const r of rows) {
    if (r === '-') grid.append(h('hr', { class: 'etched span2' }));
    else grid.append(h('div', { class: 'k' }, r[0]), h('div', { class: 'v selectable' }, r[1]));
  }
  return grid;
}

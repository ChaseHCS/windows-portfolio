// Notepad. Documents open read-only with clickable links; "Untitled" is editable.

import { h, linkify, storage, store, formatTime } from '../util.js';
import { createWindow, desktopRect } from '../wm.js';
import { messageBox, aboutBox } from '../dialogs.js';
import { displayName, pathOf, readText } from '../fs.js';
import { launch } from '../shell.js';
import { printText } from '../print.js';

export function openNotepad(node = null) {
  const desk = desktopRect();
  const name = node ? displayName(node) : 'Untitled';
  let wordWrap = storage('notepad-wrap', true);
  let findState = { text: '', matchCase: false, down: true };

  const win = createWindow({
    key: node ? 'notepad:' + pathOf(node) : null,
    title: `${name} - Notepad`,
    icon: 'notepad',
    width: Math.min(640, desk.w - 40),
    height: Math.min(460, desk.h - 40),
    minWidth: 200,
    minHeight: 120,
    className: 'notepad',
    menu: menuSpec(),
  });
  if (win.notepad) return win; // already open

  const area = h('div', {
    class: 'notepad-text selectable' + (wordWrap ? ' wrap' : ''),
    tabindex: '0',
    spellcheck: 'false',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': name,
  });
  if (!node) area.setAttribute('contenteditable', supportsPlaintextOnly() ? 'plaintext-only' : 'true');
  win.body.append(area);
  win.notepad = { area, node };

  if (node) {
    area.textContent = '';
    readText(node)
      .then((text) => {
        linkify(area, text.replace(/\r\n/g, '\n'));
        area.scrollTop = 0;
      })
      .catch(() => {
        win.close(true);
        messageBox({ title: 'Notepad', text: `Cannot open the ${name} file.\n\nMake sure a disk is in the drive you specified.`, icon: 'error' });
      });
  }

  win.el.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
      e.preventDefault();
      findNext();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openFind();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectAll();
    } else if (e.key === 'F5' && !node) {
      e.preventDefault();
      insertText(`${formatTime(new Date())} ${new Date().toLocaleDateString('en-US')}`);
    }
  });
  setTimeout(() => area.focus({ preventScroll: true }), 0);

  function menuSpec() {
    return [
      {
        label: '&File',
        items: [
          { label: '&New', action: () => launch('notepad', null) },
          { label: '&Open...', action: () => launch('explorer', null) },
          { label: '&Save', action: saveDenied },
          { label: 'Save &As...', action: saveDenied },
          '-',
          { label: 'Page Se&tup...', disabled: true },
          { label: '&Print', action: () => printText(name, area.innerText) },
          '-',
          { label: 'E&xit', action: () => win.close() },
        ],
      },
      {
        label: '&Edit',
        items: [
          { label: '&Undo', shortcut: 'Ctrl+Z', disabled: () => !!node, action: () => document.execCommand('undo') },
          '-',
          { label: 'Cu&t', shortcut: 'Ctrl+X', disabled: () => !!node || !hasSelection(), action: () => document.execCommand('cut') },
          { label: '&Copy', shortcut: 'Ctrl+C', disabled: () => !hasSelection(), action: copySelection },
          { label: '&Paste', shortcut: 'Ctrl+V', disabled: () => !!node, action: paste },
          { label: 'De&lete', shortcut: 'Del', disabled: () => !!node || !hasSelection(), action: () => document.execCommand('delete') },
          '-',
          { label: 'Select &All', action: selectAll },
          { label: 'Time/&Date', shortcut: 'F5', disabled: () => !!node, action: () => insertText(`${formatTime(new Date())} ${new Date().toLocaleDateString('en-US')}`) },
          '-',
          { label: '&Word Wrap', checked: () => wordWrap, action: toggleWrap },
        ],
      },
      {
        label: '&Search',
        items: [
          { label: '&Find...', action: openFind },
          { label: 'Find &Next', shortcut: 'F3', action: findNext },
        ],
      },
      {
        label: '&Help',
        items: [
          { label: '&Help Topics', action: () => launch('welcome', { force: true }) },
          '-',
          { label: '&About Notepad', action: () => aboutBox({ app: 'Notepad', appIcon: 'notepad', parent: win }) },
        ],
      },
    ];
  }

  function hasSelection() {
    const sel = getSelection();
    return sel.rangeCount && !sel.isCollapsed && area.contains(sel.anchorNode);
  }

  function selectAll() {
    const r = document.createRange();
    r.selectNodeContents(area);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function copySelection() {
    const text = getSelection().toString();
    navigator.clipboard?.writeText(text).catch(() => document.execCommand('copy'));
  }

  async function paste() {
    try {
      insertText(await navigator.clipboard.readText());
    } catch {
      /* clipboard read denied */
    }
  }

  function insertText(t) {
    area.focus();
    document.execCommand('insertText', false, t);
  }

  function toggleWrap() {
    wordWrap = !wordWrap;
    store('notepad-wrap', wordWrap);
    area.classList.toggle('wrap', wordWrap);
  }

  function saveDenied() {
    messageBox({
      title: 'Notepad',
      text: `Cannot write to ${node ? pathOf(node) : 'C:\\Untitled.txt'}.\n\nThe disk is write-protected. Remove the write-protection from the disk, or use another disk.`,
      icon: 'warning',
      parent: win,
    });
  }

  // ---- Find ----

  function openFind() {
    if (win.findWin && !win.findWin.closed) return win.findWin.focus();
    const sel = getSelection().toString();
    const input = h('input', { type: 'text', class: 'field', value: sel && sel.length < 60 ? sel : findState.text });
    const matchCase = h('input', { type: 'checkbox', checked: findState.matchCase });
    const up = h('input', { type: 'radio', name: 'dir' + Date.now(), checked: !findState.down });
    const down = h('input', { type: 'radio', name: up.name, checked: findState.down });
    const findBtn = h('button', { class: 'btn default' }, 'Find Next');
    const fw = createWindow({
      title: 'Find',
      parent: null,
      dialog: true,
      taskbar: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      className: 'find-dialog',
      x: win.x + 40,
      y: win.y + 60,
      afterClose: () => win.focus(),
    });
    win.findWin = fw;
    fw.body.append(
      h(
        'div',
        { class: 'find-layout' },
        h(
          'div',
          { class: 'find-left' },
          h('label', { class: 'find-what' }, h('span', null, 'Fi', h('u', { class: 'ak' }, 'n'), 'd what:'), input),
          h(
            'div',
            { class: 'find-opts' },
            h('label', { class: 'check' }, matchCase, h('span', { class: 'box' }), h('span', { class: 'lbl' }, 'Match ', h('u', { class: 'ak' }, 'c'), 'ase')),
            h(
              'fieldset',
              { class: 'group' },
              h('legend', null, 'Direction'),
              h('label', { class: 'radio' }, up, h('span', { class: 'box' }), h('span', { class: 'lbl' }, h('u', { class: 'ak' }, 'U'), 'p')),
              h('label', { class: 'radio' }, down, h('span', { class: 'box' }), h('span', { class: 'lbl' }, h('u', { class: 'ak' }, 'D'), 'own')),
            ),
          ),
        ),
        h('div', { class: 'find-buttons' }, findBtn, h('button', { class: 'btn', onclick: () => fw.close() }, 'Cancel')),
      ),
    );
    const go = () => {
      findState = { text: input.value, matchCase: matchCase.checked, down: down.checked };
      findNext(fw);
    };
    findBtn.addEventListener('click', go);
    fw.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        go();
      }
      if (e.key === 'Escape') fw.close();
    });
    input.focus();
    input.select();
  }

  function findNext(parent = win) {
    if (!findState.text) return openFind();
    const full = area.textContent;
    const hay = findState.matchCase ? full : full.toLowerCase();
    const needle = findState.matchCase ? findState.text : findState.text.toLowerCase();
    const caret = caretOffset();
    let idx;
    if (findState.down) idx = hay.indexOf(needle, caret.end);
    else idx = hay.lastIndexOf(needle, Math.max(0, caret.start - 1));
    if (idx < 0 || (!findState.down && idx >= caret.start)) {
      messageBox({ title: 'Notepad', text: `Cannot find "${findState.text}"`, icon: 'info', parent: parent && !parent.closed ? parent : win });
      return;
    }
    selectRange(idx, idx + needle.length);
  }

  function textPos(offset) {
    const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
    let n, acc = 0;
    while ((n = walker.nextNode())) {
      if (acc + n.length >= offset) return [n, offset - acc];
      acc += n.length;
    }
    return [area, area.childNodes.length];
  }

  function caretOffset() {
    const sel = getSelection();
    if (!sel.rangeCount || !area.contains(sel.anchorNode)) return { start: 0, end: 0 };
    const r = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(area);
    pre.setEnd(r.startContainer, r.startOffset);
    const start = pre.toString().length;
    return { start, end: start + r.toString().length };
  }

  function selectRange(a, b) {
    const [sn, so] = textPos(a);
    const [en, eo] = textPos(b);
    const r = document.createRange();
    r.setStart(sn, so);
    r.setEnd(en, eo);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    const rect = r.getBoundingClientRect();
    const ar = area.getBoundingClientRect();
    if (rect.top < ar.top || rect.bottom > ar.bottom - 16) area.scrollTop += rect.top - ar.top - ar.height / 3;
  }

  return win;
}

function supportsPlaintextOnly() {
  const d = document.createElement('div');
  d.contentEditable = 'plaintext-only';
  return d.contentEditable === 'plaintext-only';
}

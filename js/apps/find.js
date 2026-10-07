// Start > Find > Files or Folders...

import { h, formatBytes, formatDateTime } from '../util.js';
import { createWindow } from '../wm.js';
import { icon } from '../icons.js';
import { tabControl } from '../dialogs.js';
import { fs, displayName, pathOf, readText, sizeOf } from '../fs.js';
import { openNode, typeName } from '../shell.js';
import { iconItem } from '../iconitem.js';
import { contextMenu } from '../menu.js';
import { nodeMenu } from '../actions.js';

export function openFind(startIn = null) {
  const win = createWindow({
    key: 'find',
    title: 'Find: All Files',
    icon: 'find',
    width: 500,
    minWidth: 380,
    minHeight: 170,
    className: 'find-files',
    statusBar: false,
    menu: [
      { label: '&File', items: [{ label: '&Close', action: () => win.close() }] },
      { label: '&Edit', items: [{ label: 'Select &All', disabled: true }] },
      { label: '&View', items: [{ label: '&Details', checked: true, radio: true }] },
      { label: '&Options', items: [{ label: '&Case Sensitive', checked: () => caseSens, action: () => (caseSens = !caseSens) }] },
      { label: '&Help', items: [{ label: '&Help Topics', disabled: true }] },
    ],
  });
  if (win.ready) return win;
  win.ready = true;
  let caseSens = false;

  const roots = [fs.C, fs.myDocs, fs.writeupsDir, fs.desktop];
  if (startIn && !roots.includes(startIn) && startIn.isContainer) roots.unshift(startIn);
  const named = h('input', { type: 'text', class: 'field', 'aria-label': 'Named' });
  const lookIn = h('select', { class: 'field', 'aria-label': 'Look in' }, ...roots.map((r, i) => h('option', { value: i }, pathOf(r))));
  if (startIn) lookIn.value = String(Math.max(0, roots.indexOf(startIn)));
  const sub = h('input', { type: 'checkbox', checked: true });
  const containing = h('input', { type: 'text', class: 'field', 'aria-label': 'Containing text' });

  const tabs = tabControl([
    {
      label: '&Name && Location',
      content: h(
        'div',
        { class: 'find-tab' },
        h('label', { class: 'find-row' }, h('span', null, 'Na', h('u', { class: 'ak' }, 'm'), 'ed:'), named),
        h('label', { class: 'find-row' }, h('span', null, h('u', { class: 'ak' }, 'L'), 'ook in:'), lookIn),
        h('label', { class: 'check' }, sub, h('span', { class: 'box' }), h('span', { class: 'lbl' }, 'Include ', h('u', { class: 'ak' }, 's'), 'ubfolders')),
      ),
    },
    {
      label: '&Advanced',
      content: h(
        'div',
        { class: 'find-tab' },
        h('label', { class: 'find-row' }, h('span', null, 'Containing ', h('u', { class: 'ak' }, 't'), 'ext:'), containing),
      ),
    },
  ]);

  const findBtn = h('button', { class: 'btn default' }, 'F', h('u', { class: 'ak' }, 'i'), 'nd Now');
  const stopBtn = h('button', { class: 'btn', disabled: true }, 'Sto', h('u', { class: 'ak' }, 'p'));
  const newBtn = h('button', { class: 'btn' }, 'Ne', h('u', { class: 'ak' }, 'w'), ' Search');
  const results = h('div', { class: 'find-results folder-view sunken-panel view-details hidden' });
  const status = h('div', { class: 'status-bar hidden' }, h('div', { class: 'status-field' }));

  win.body.append(h('div', { class: 'find-top' }, tabs, h('div', { class: 'find-side' }, findBtn, stopBtn, newBtn, h('div', { class: 'find-glass' }, icon('find', 32)))), results, status);

  async function search() {
    const pat = named.value.trim();
    const text = containing.value;
    const root = roots[+lookIn.value] || fs.C;
    const re = pat ? new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + (pat.includes('*') || pat.includes('?') ? '$' : ''), caseSens ? '' : 'i') : null;
    const hits = [];
    const want = caseSens ? text : text.toLowerCase();
    // Walk every child (the Desktop shares nodes with My Documents), once each.
    const nodes = [];
    const seen = new Set([root]);
    (function visit(dir, depth) {
      for (const c of dir.children || []) {
        if (seen.has(c)) continue;
        seen.add(c);
        nodes.push(c);
        if (c.isContainer && sub.checked) visit(c, depth + 1);
      }
    })(root, 1);
    for (const n of nodes) {
      const name = displayName(n);
      if (re && !re.test(name) && !re.test(n.name) && !(pat && !/[*?]/.test(pat) && (caseSens ? name : name.toLowerCase()).includes(caseSens ? pat : pat.toLowerCase()))) continue;
      if (text) {
        if (n.isContainer || n.app) continue;
        let body = '';
        try {
          body = await readText(n);
        } catch {
          continue;
        }
        if (!(caseSens ? body : body.toLowerCase()).includes(want)) continue;
      }
      hits.push(n);
    }
    render(hits);
  }

  function render(hits) {
    results.classList.remove('hidden');
    status.classList.remove('hidden');
    if (!win.maximized && win.el.offsetHeight < 330) win.el.style.height = '360px';
    results.replaceChildren(
      h('div', { class: 'fv-header' }, ...['Name', 'In Folder', 'Size', 'Type', 'Modified'].map((l, i) => h('button', { class: `fv-col col-${['name', 'folder', 'size', 'type', 'date'][i]}` }, l))),
      h(
        'div',
        { class: 'fv-items' },
        ...hits.map((n) => {
          const el = iconItem(n, { className: 'fv-item fv-row', size: 16 });
          el.append(
            h('span', { class: 'col-folder' }, pathOf(n.parent)),
            h('span', { class: 'col-size' }, n.isContainer ? '' : formatBytes(Math.max(1024, sizeOf(n) || 0)).replace(/\.\d+KB/, 'KB')),
            h('span', { class: 'col-type' }, typeName(n)),
            h('span', { class: 'col-date' }, formatDateTime(n.date)),
          );
          el.addEventListener('pointerdown', () => {
            results.querySelectorAll('.selected').forEach((s) => s.classList.remove('selected'));
            el.classList.add('selected');
          });
          el.addEventListener('dblclick', () => openNode(n));
          el.addEventListener('contextmenu', (e) => contextMenu(e, nodeMenu(n)));
          return el;
        }),
      ),
    );
    status.firstChild.textContent = `${hits.length} file(s) found`;
  }

  findBtn.addEventListener('click', search);
  newBtn.addEventListener('click', () => {
    named.value = '';
    containing.value = '';
    results.classList.add('hidden');
    status.classList.add('hidden');
    named.focus();
  });
  win.el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      search();
    }
  });
  named.focus();
  return win;
}

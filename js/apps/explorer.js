// Folder windows (Win95 "My Computer" style: one window per folder).

import { h, storage, store, formatBytes, formatDateTime } from '../util.js';
import { createWindow, findWindow } from '../wm.js';
import { contextMenu } from '../menu.js';
import { aboutBox } from '../dialogs.js';
import { fs, fsEvents, displayName, pathOf, sizeOf } from '../fs.js';
import { openNode, iconFor, typeName, launch } from '../shell.js';
import { iconItem } from '../iconitem.js';
import { nodeMenu, emptyRecycleBin, showProperties, deleteNode } from '../actions.js';

const VIEWS = { large: 'Lar&ge Icons', small: 'S&mall Icons', list: '&List', details: '&Details' };

export function openFolder(node = null) {
  node = node || fs.myDocs;
  const key = 'folder:' + pathOf(node);
  const existing = findWindow(key);
  if (existing) {
    if (existing.minimized) existing.restore();
    existing.focus();
    return existing;
  }

  const prefs = storage('folder-prefs', {});
  const st = {
    view: prefs[key]?.view || (node === fs.writeupsDir ? 'details' : 'large'),
    sort: 'name',
    statusBar: true,
    selected: new Set(),
    focus: null,
  };

  const win = createWindow({
    key,
    title: displayName(node),
    icon: iconFor(node),
    width: node === fs.writeupsDir ? 520 : 440,
    height: 300,
    minWidth: 180,
    minHeight: 120,
    className: 'explorer',
    statusBar: true,
    menu: menuSpec(),
    afterClose: () => fsEvents.removeEventListener('change', render),
  });

  const view = h('div', { class: 'folder-view sunken-panel', tabindex: '0' });
  win.body.append(view);
  fsEvents.addEventListener('change', render);

  view.addEventListener('pointerdown', (e) => {
    if (e.target === view || e.target.classList.contains('fv-items')) {
      clearSel();
      updateStatus();
    }
  });
  view.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.fv-item')) return;
    contextMenu(e, backgroundMenu());
  });
  view.addEventListener('keydown', onKey);

  render();
  setTimeout(() => view.focus({ preventScroll: true }), 0);

  // ---- rendering ----

  function sorted() {
    const list = node.children.slice();
    const byName = (a, b) => (b.isContainer - a.isContainer) || displayName(a).localeCompare(displayName(b), undefined, { numeric: true });
    const cmp = {
      name: byName,
      type: (a, b) => typeName(a).localeCompare(typeName(b)) || byName(a, b),
      size: (a, b) => (sizeOf(b) ?? -1) - (sizeOf(a) ?? -1) || byName(a, b),
      date: (a, b) => (b.date || 0) - (a.date || 0) || byName(a, b),
    }[st.sort];
    // System folders (My Computer) keep their natural order.
    if (node.type === 'computer' && st.sort === 'name') return list;
    return list.sort(cmp);
  }

  function render() {
    win.setIcon(iconFor(node));
    const keep = new Set([...st.selected].map((el) => el._node));
    st.selected.clear();
    view.className = `folder-view sunken-panel view-${st.view}`;
    view.replaceChildren();
    const nodes = sorted();
    let container;
    if (st.view === 'details') {
      const header = h(
        'div',
        { class: 'fv-header' },
        ...[
          ['Name', 'name'],
          ['Size', 'size'],
          ['Type', 'type'],
          ['Modified', 'date'],
        ].map(([label, key]) => h('button', { class: `fv-col col-${key}`, onclick: () => setSort(key) }, label)),
      );
      container = h('div', { class: 'fv-items' });
      view.append(header, container);
    } else {
      container = h('div', { class: 'fv-items' });
      view.append(container);
    }
    for (const n of nodes) {
      let el;
      if (st.view === 'large') el = iconItem(n, { className: 'fv-item file-icon' });
      else {
        el = iconItem(n, { className: 'fv-item fv-row', size: 16 });
        if (st.view === 'details') {
          const size = n.isContainer || n.type === 'applet' ? '' : formatBytes(Math.max(1024, sizeOf(n) || 0)).replace(/\.\d+KB/, 'KB');
          el.append(
            h('span', { class: 'col-size' }, n.type === 'drive' ? '' : size),
            h('span', { class: 'col-type' }, typeName(n)),
            h('span', { class: 'col-date' }, n.type === 'drive' || n.type === 'applet' ? '' : formatDateTime(n.date)),
          );
        }
      }
      bindItem(el);
      container.append(el);
      if (keep.has(n)) setSel(el, true);
    }
    updateStatus();
  }

  function updateStatus() {
    if (!st.statusBar) return;
    const sel = [...st.selected];
    const nodes = sel.length ? sel.map((e) => e._node) : node.children;
    const bytes = nodes.reduce((a, n) => a + (n.isContainer ? 0 : sizeOf(n) || 0), 0);
    const left = sel.length ? `${sel.length} object(s) selected` : `${node.children.length} object(s)`;
    let right = node.type === 'computer' || node.type === 'cpanel' ? '' : formatBytes(bytes);
    if (!sel.length && (node.type === 'folder' || node.type === 'drive')) right += ` (Disk free space: 841MB)`;
    win.setStatus([left, right]);
  }

  // ---- selection ----

  function setSel(el, on) {
    el.classList.toggle('selected', on);
    if (on) st.selected.add(el);
    else st.selected.delete(el);
  }

  function clearSel() {
    for (const el of [...st.selected]) setSel(el, false);
    st.focus?.classList.remove('focused');
    st.focus = null;
  }

  function focusItem(el) {
    st.focus?.classList.remove('focused');
    st.focus = el;
    el.classList.add('focused');
    el.scrollIntoView({ block: 'nearest' });
  }

  function items() {
    return [...view.querySelectorAll('.fv-item')];
  }

  function bindItem(el) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2 && el.classList.contains('selected')) return;
      if (e.ctrlKey) setSel(el, !el.classList.contains('selected'));
      else if (e.shiftKey && st.focus) {
        const all = items();
        const [a, b] = [all.indexOf(st.focus), all.indexOf(el)].sort((x, y) => x - y);
        clearSel();
        all.slice(a, b + 1).forEach((i) => setSel(i, true));
      } else {
        clearSel();
        setSel(el, true);
      }
      focusItem(el);
      updateStatus();
    });
    el.addEventListener('click', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse' && matchMedia('(pointer: coarse)').matches) open(el._node);
    });
    el.addEventListener('dblclick', () => open(el._node));
    el.addEventListener('contextmenu', (e) => contextMenu(e, nodeMenu(el._node, { parentWin: null })));
  }

  const open = (n) => openNode(n);

  function onKey(e) {
    const all = items();
    if (!all.length) return;
    const cur = st.focus ? all.indexOf(st.focus) : -1;
    let next = null;
    if (e.key === 'Enter') {
      [...st.selected].forEach((el) => open(el._node));
    } else if (e.key === 'Backspace') {
      goUp();
    } else if (e.key === 'Delete' && st.selected.size) {
      deleteNode([...st.selected][0]._node, win);
    } else if (e.key === 'F5') {
      render();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      all.forEach((el) => setSel(el, true));
      updateStatus();
    } else if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
      const perRow = st.view === 'large' || st.view === 'small' ? Math.max(1, Math.floor(view.clientWidth / (st.view === 'large' ? 75 : 150))) : 1;
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: perRow, ArrowUp: -perRow }[e.key];
      next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : cur < 0 ? 0 : Math.max(0, Math.min(all.length - 1, cur + step));
      clearSel();
      setSel(all[next], true);
      focusItem(all[next]);
      updateStatus();
    } else return;
    e.preventDefault();
  }

  function goUp() {
    const p = node.type === 'drive' || node.type === 'cpanel' ? fs.computer : node.parent;
    if (p) openNode(p);
  }

  // ---- menus ----

  function setView(v) {
    st.view = v;
    const prefs = storage('folder-prefs', {});
    prefs[key] = { view: v };
    store('folder-prefs', prefs);
    render();
  }

  function setSort(s) {
    st.sort = s;
    render();
  }

  function arrangeItems() {
    return [
      { label: 'by &Name', action: () => setSort('name') },
      { label: 'by &Type', action: () => setSort('type') },
      { label: 'by Si&ze', action: () => setSort('size') },
      { label: 'by &Date', action: () => setSort('date') },
      '-',
      { label: '&Auto Arrange', checked: true, disabled: true },
    ];
  }

  function viewItems() {
    return Object.entries(VIEWS).map(([v, label]) => ({ label, radio: true, checked: () => st.view === v, action: () => setView(v) }));
  }

  function backgroundMenu() {
    return [
      { label: '&View', items: viewItems() },
      '-',
      { label: 'Arrange &Icons', items: arrangeItems() },
      { label: 'Line &up Icons', disabled: true },
      '-',
      { label: '&Paste', disabled: true },
      { label: 'Paste &Shortcut', disabled: true },
      '-',
      { label: 'P&roperties', action: () => showProperties(node) },
    ];
  }

  function menuSpec() {
    return [
      {
        label: '&File',
        items: () => {
          const sel = [...(st?.selected || [])].map((el) => el._node);
          return [
            { label: '&Open', default: true, disabled: !sel.length, action: () => sel.forEach(open) },
            node.type === 'recycle' ? { label: 'Empty Recycle &Bin', disabled: !node.children.length, action: () => emptyRecycleBin(win) } : null,
            '-',
            { label: 'Ne&w', disabled: true },
            '-',
            { label: 'Create &Shortcut', disabled: true },
            { label: '&Delete', disabled: !sel.length, action: () => deleteNode(sel[0], win) },
            { label: 'Rena&me', disabled: true },
            { label: 'P&roperties', action: () => showProperties(sel[0] || node, win) },
            '-',
            { label: '&Close', action: () => win.close() },
          ].filter(Boolean);
        },
      },
      {
        label: '&Edit',
        items: [
          { label: '&Undo', disabled: true },
          '-',
          { label: 'Cu&t', disabled: true },
          { label: '&Copy', disabled: true },
          { label: '&Paste', disabled: true },
          '-',
          {
            label: 'Select &All',
            shortcut: 'Ctrl+A',
            action: () => {
              items().forEach((el) => setSel(el, true));
              updateStatus();
            },
          },
          {
            label: '&Invert Selection',
            action: () => {
              items().forEach((el) => setSel(el, !el.classList.contains('selected')));
              updateStatus();
            },
          },
        ],
      },
      {
        label: '&View',
        items: () => [
          { label: '&Toolbar', disabled: true },
          {
            label: 'Status &Bar',
            checked: st.statusBar,
            action: () => {
              st.statusBar = !st.statusBar;
              win.statusBar.classList.toggle('hidden', !st.statusBar);
              updateStatus();
            },
          },
          '-',
          ...viewItems(),
          '-',
          { label: 'Arrange &Icons', items: arrangeItems() },
          { label: 'Line &up Icons', disabled: true },
          '-',
          { label: '&Refresh', action: render },
          { label: '&Options...', disabled: true },
        ],
      },
      {
        label: '&Help',
        items: [
          { label: '&Help Topics', action: () => launch('welcome', { force: true }) },
          '-',
          { label: '&About Windows 95', action: () => aboutBox({ app: 'Windows', appIcon: 'my-computer', parent: win }) },
        ],
      },
    ];
  }

  return win;
}

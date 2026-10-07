// The desktop: icon layout, selection, marquee, dragging, context menus.

import { h, drag, storage, store, isTouch } from './util.js';
import { fs, fsEvents, pathOf, displayName, sizeOf } from './fs.js';
import { openNode, typeName, launch } from './shell.js';
import { iconItem } from './iconitem.js';
import { contextMenu } from './menu.js';
import { deactivateAll, activeWindow } from './wm.js';
import { nodeMenu, deleteNode } from './actions.js';

const GRID_W = 75;
const GRID_H = 75;
const TOP = 2;

let container;
let items = [];
const selected = new Set();
let focused = null;

const keyOf = (node) => (node.type === 'computer' || node.type === 'recycle' ? node.name : pathOf(node));

export function desktopNodes() {
  const nodes = [fs.computer, fs.recycle, ...fs.desktop.children];
  const order = storage('icon-order', null);
  if (!order) return nodes;
  const rank = (n) => {
    const i = order.indexOf(keyOf(n));
    return i < 0 ? 1e6 + nodes.indexOf(n) : i;
  };
  return nodes.slice().sort((a, b) => rank(a) - rank(b));
}

export function initDesktop() {
  container = document.getElementById('desktop-icons');
  container.tabIndex = -1;
  render();

  const desk = document.getElementById('desktop');
  desk.addEventListener('pointerdown', (e) => {
    if (e.target !== desk && e.target !== container) return;
    deactivateAll();
    container.focus({ preventScroll: true });
    if (!e.ctrlKey && !e.shiftKey) clearSelection();
    if (e.button === 0) marquee(e);
  });
  desk.addEventListener('contextmenu', (e) => {
    if (e.target !== desk && e.target !== container) return;
    contextMenu(e, backgroundMenu());
  });
  container.addEventListener('keydown', onKey);
  fsEvents.addEventListener('change', render);
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(layout, 100);
  });
}

export function render() {
  const keepSel = new Set([...selected].map((el) => el._node));
  container.replaceChildren();
  selected.clear();
  items = desktopNodes().map((node) => {
    const el = iconItem(node, { className: 'desktop-icon' });
    bindIcon(el);
    container.append(el);
    if (keepSel.has(node)) select(el, true);
    return el;
  });
  layout();
}

function layout() {
  if (!container) return;
  const saved = storage('icon-pos', {});
  const rows = Math.max(1, Math.floor((container.clientHeight - TOP) / GRID_H));
  const maxX = container.clientWidth - GRID_W;
  const maxY = container.clientHeight - 40;
  let slot = 0;
  const taken = new Set();
  for (const el of items) {
    const p = saved[keyOf(el._node)];
    if (p) taken.add(`${Math.round(p.x / GRID_W)},${Math.round((p.y - TOP) / GRID_H)}`);
  }
  for (const el of items) {
    let p = saved[keyOf(el._node)];
    if (!p) {
      let col, row;
      do {
        col = Math.floor(slot / rows);
        row = slot % rows;
        slot++;
      } while (taken.has(`${col},${row}`));
      p = { x: col * GRID_W, y: TOP + row * GRID_H };
    }
    el.style.left = Math.max(0, Math.min(p.x, maxX)) + 'px';
    el.style.top = Math.max(0, Math.min(p.y, maxY)) + 'px';
  }
}

function savePositions(els) {
  const saved = storage('icon-pos', {});
  for (const el of els) saved[keyOf(el._node)] = { x: parseInt(el.style.left), y: parseInt(el.style.top) };
  store('icon-pos', saved);
}

// ---- Selection ----------------------------------------------------------------

function select(el, on = true) {
  el.classList.toggle('selected', on);
  if (on) selected.add(el);
  else selected.delete(el);
}

function clearSelection() {
  for (const el of [...selected]) select(el, false);
  setFocus(null);
}

function setFocus(el) {
  focused?.classList.remove('focused');
  focused = el;
  el?.classList.add('focused');
}

function selectOnly(el) {
  for (const s of [...selected]) if (s !== el) select(s, false);
  select(el, true);
  setFocus(el);
}

// ---- Icon interaction -----------------------------------------------------------

function bindIcon(el) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;
    deactivateAll();
    container.focus({ preventScroll: true });
    const wasSelected = el.classList.contains('selected');
    if (e.ctrlKey) {
      select(el, !wasSelected);
      setFocus(el);
    } else if (!wasSelected) selectOnly(el);
    else setFocus(el);

    const group = [...selected];
    const starts = group.map((g) => ({ g, x: parseInt(g.style.left), y: parseInt(g.style.top) }));
    const maxX = container.clientWidth - GRID_W, maxY = container.clientHeight - 40;
    drag(e, {
      threshold: 4,
      onStart: () => group.forEach((g) => g.classList.add('dragging')),
      onMove: (dx, dy) => {
        for (const s of starts) {
          s.g.style.left = Math.max(0, Math.min(s.x + dx, maxX)) + 'px';
          s.g.style.top = Math.max(0, Math.min(s.y + dy, maxY)) + 'px';
        }
      },
      onEnd: () => {
        group.forEach((g) => g.classList.remove('dragging'));
        savePositions(group);
      },
    }).then((moved) => {
      if (moved) return;
      if (e.pointerType !== 'mouse' && isTouch()) openNode(el._node);
      else if (!e.ctrlKey && wasSelected && selected.size > 1) selectOnly(el);
    });
  });
  el.addEventListener('dblclick', () => openNode(el._node));
  el.addEventListener('contextmenu', (e) => {
    if (!el.classList.contains('selected')) selectOnly(el);
    contextMenu(e, nodeMenu(el._node));
  });
}

function marquee(e) {
  const rect = container.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const box = h('div', { class: 'marquee' });
  const base = new Set(e.ctrlKey ? selected : []);
  drag(e, {
    threshold: 2,
    onStart: () => container.append(box),
    onMove: (dx, dy) => {
      const x = Math.min(sx, sx + dx), y = Math.min(sy, sy + dy);
      const w = Math.abs(dx), ht = Math.abs(dy);
      Object.assign(box.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: ht + 'px' });
      for (const el of items) {
        const ix = el.offsetLeft + 21, iy = el.offsetTop, iw = 32, ih = el.offsetHeight;
        const hit = ix < x + w && ix + iw > x && iy < y + ht && iy + ih > y;
        select(el, hit || base.has(el));
      }
    },
    onEnd: () => box.remove(),
  });
}

function onKey(e) {
  if (activeWindow()) return;
  const sel = [...selected];
  if (e.key === 'Enter' && sel.length) {
    sel.forEach((el) => openNode(el._node));
  } else if (e.key === 'Delete' && sel.length) {
    deleteNode(sel[0]._node);
  } else if (e.key === 'F5') {
    render();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    items.forEach((el) => select(el, true));
  } else if (e.key.startsWith('Arrow')) {
    const cur = focused || items[0];
    if (!cur) return;
    const cx = cur.offsetLeft, cy = cur.offsetTop;
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    let best = null, bestD = Infinity;
    for (const el of items) {
      if (el === cur && focused) continue;
      const dx = el.offsetLeft - cx, dy = el.offsetTop - cy;
      if (focused && (dir[0] && Math.sign(dx) !== dir[0] || dir[1] && Math.sign(dy) !== dir[1])) continue;
      const d = dir[0] ? Math.abs(dx) + Math.abs(dy) * 4 : Math.abs(dy) + Math.abs(dx) * 4;
      if (d < bestD) (bestD = d), (best = el);
    }
    if (!focused) best = items[0];
    if (best) selectOnly(best);
  } else return;
  e.preventDefault();
}

// ---- Context menu -----------------------------------------------------------------

function arrange(by) {
  const nodes = [fs.computer, fs.recycle, ...fs.desktop.children];
  const rest = nodes.slice(2);
  const cmp = {
    name: (a, b) => displayName(a).localeCompare(displayName(b)),
    type: (a, b) => typeName(a).localeCompare(typeName(b)) || displayName(a).localeCompare(displayName(b)),
    size: (a, b) => (sizeOf(b) || 0) - (sizeOf(a) || 0),
    date: (a, b) => (b.date || 0) - (a.date || 0),
  }[by];
  rest.sort(cmp);
  store('icon-order', [fs.computer, fs.recycle, ...rest].map(keyOf));
  store('icon-pos', {});
  render();
}

function lineUp() {
  const saved = storage('icon-pos', {});
  for (const k of Object.keys(saved)) {
    saved[k] = { x: Math.round(saved[k].x / GRID_W) * GRID_W, y: TOP + Math.round((saved[k].y - TOP) / GRID_H) * GRID_H };
  }
  store('icon-pos', saved);
  layout();
}

function backgroundMenu() {
  return [
    {
      label: 'Arrange &Icons',
      items: [
        { label: 'by &Name', action: () => arrange('name') },
        { label: 'by &Type', action: () => arrange('type') },
        { label: 'by Si&ze', action: () => arrange('size') },
        { label: 'by &Date', action: () => arrange('date') },
        '-',
        { label: '&Auto Arrange', disabled: true },
      ],
    },
    { label: 'Line &up Icons', action: lineUp },
    '-',
    { label: '&Paste', disabled: true },
    { label: 'Paste &Shortcut', disabled: true },
    '-',
    {
      label: 'Ne&w',
      items: [
        { label: '&Folder', icon: 'folder', disabled: true },
        { label: '&Shortcut', icon: 'file-generic', disabled: true },
        '-',
        { label: 'Text Document', icon: 'text-file', action: () => launch('notepad', null) },
      ],
      subIcons: true,
    },
    '-',
    { label: 'P&roperties', action: () => launch('applet', 'display') },
  ];
}

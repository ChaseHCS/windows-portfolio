// Win95 popup menus: menu bars, context menus, cascading submenus, and the
// Start menu (which registers itself as a custom root menu).
//
// Item spec:
//   { label: '&Open', action, shortcut: 'F2', disabled, checked, radio, default,
//     icon: 'folder', items: [...] | () => [...] }
//   '-' for a separator. label/disabled/checked/items may be functions.

import { h, accel, val } from './util.js';
import { icon } from './icons.js';

const SUBMENU_DELAY = 250;
const stack = []; // open menus, index = depth
let session = null; // { owner, onClose, onNavigate, openedAt }
let pressedRow = null;

export const isMenuOpen = () => stack.length > 0;

function buildMenu(items, opts) {
  const list = val(items) || [];
  const withIcons = opts.withIcons ?? list.some((i) => i && i.icon);
  const el = h('div', { class: 'menu' + (withIcons ? ' with-icons' : '') + (opts.className ? ' ' + opts.className : '') });
  let lastWasSep = true;
  for (const it of list) {
    if (it === '-' || it?.separator) {
      if (!lastWasSep) el.append(h('div', { class: 'menu-sep' }));
      lastWasSep = true;
      continue;
    }
    if (!it || val(it.hidden)) continue;
    lastWasSep = false;
    el.append(buildRow(it, withIcons, 'menu-item'));
  }
  if (!el.children.length) el.append(buildRow({ label: '(Empty)', disabled: true }, withIcons, 'menu-item'));
  return el;
}

export function buildRow(it, withIcons, cls) {
  const disabled = !!val(it.disabled);
  const checked = !!val(it.checked);
  const classes = [cls, 'mrow'];
  if (disabled) classes.push('disabled');
  if (checked) classes.push('checked');
  if (it.radio) classes.push('radio');
  if (it.items) classes.push('has-sub');
  if (it.default) classes.push('default');
  const row = h(
    'div',
    { class: classes.join(' ') },
    cls === 'menu-item' ? h('span', { class: 'mi-check' }) : null,
    withIcons ? (it.icon ? icon(it.icon, cls === 'start-item' ? 32 : 16, 'mi-icon') : h('span', { class: 'mi-icon' })) : null,
    h('span', { class: 'mi-label' }, accel(val(it.label))),
    it.shortcut ? h('span', { class: 'mi-shortcut' }, it.shortcut) : null,
    h('span', { class: 'mi-arrow' }),
  );
  row._item = it;
  row._disabled = disabled;
  return row;
}

function position(el, opts) {
  el.style.left = '0px';
  el.style.top = '0px';
  const w = el.offsetWidth, ht = el.offsetHeight;
  const vw = innerWidth, vh = innerHeight;
  let x, y;
  if (opts.anchorRect && opts.placement === 'right') {
    const r = opts.anchorRect;
    x = r.right - 3;
    y = r.top - 3;
    if (x + w > vw) x = Math.max(0, r.left - w + 3);
    if (y + ht > vh) y = Math.max(0, vh - ht);
  } else if (opts.anchorRect && opts.placement === 'above') {
    const r = opts.anchorRect;
    x = r.left;
    y = r.top - ht;
  } else if (opts.anchorRect) {
    const r = opts.anchorRect;
    x = r.left;
    y = r.bottom;
    if (y + ht > vh) y = Math.max(0, r.top - ht);
    if (x + w > vw) x = Math.max(0, vw - w);
  } else {
    x = opts.x ?? 0;
    y = opts.y ?? 0;
    if (x + w > vw) x = Math.max(0, x - w);
    if (y + ht > vh) y = Math.max(0, y - ht);
  }
  el.style.left = Math.round(x) + 'px';
  el.style.top = Math.round(y) + 'px';
}

/** Open a menu. Without opts._sub this starts a fresh menu session. */
export function openMenu(items, opts = {}) {
  if (!opts._sub) {
    closeMenus();
    session = { owner: opts.owner || null, onClose: opts.onClose || null, onNavigate: opts.onNavigate || null, openedAt: performance.now() };
  }
  const el = buildMenu(items, opts);
  document.body.append(el);
  position(el, opts);
  const entry = { el, level: stack.length, custom: false, hover: null, openRow: null, timer: 0 };
  stack.push(entry);
  bind(entry);
  if (opts.selectFirst) moveHover(entry, 1);
  return el;
}

/** Register an already-visible element (Start menu) as the root of a menu session. */
export function openCustomRoot(el, opts = {}) {
  closeMenus();
  session = { owner: opts.owner || null, onClose: opts.onClose || null, onNavigate: null, openedAt: performance.now() };
  const entry = { el, level: 0, custom: true, hover: null, openRow: null, timer: 0 };
  stack.push(entry);
  if (!el._menuBound) {
    el._menuBound = true;
    bind(entry);
  } else {
    el._entry = entry;
  }
}

export function closeMenus() {
  if (!stack.length && !session) return;
  while (stack.length) {
    const e = stack.pop();
    clearTimeout(e.timer);
    if (e.custom) e.el.querySelectorAll('.hover').forEach((r) => r.classList.remove('hover'));
    else e.el.remove();
  }
  const s = session;
  session = null;
  s?.onClose?.();
}

function closeAbove(level) {
  while (stack.length > level + 1) {
    const e = stack.pop();
    clearTimeout(e.timer);
    e.el.remove();
  }
  const parent = stack[level];
  if (parent) parent.openRow = null;
}

function setHover(entry, row) {
  if (entry.hover === row) return;
  entry.hover?.classList.remove('hover');
  entry.hover = row;
  row?.classList.add('hover');
}

function entryFor(el) {
  return stack.find((e) => e.el === el) || el._entry;
}

function bind(entry) {
  const el = entry.el;
  el._entry = entry;
  el.addEventListener('pointerover', (ev) => {
    const ent = entryFor(el);
    if (!ent || !stack.includes(ent)) return;
    const row = ev.target.closest('.mrow');
    // Pointer arrived in a submenu: keep the parent's open row highlighted.
    const parent = stack[ent.level - 1];
    if (parent) {
      clearTimeout(parent.timer);
      if (parent.openRow) setHover(parent, parent.openRow);
    }
    if (!row || !el.contains(row)) return;
    hoverRow(ent, row);
  });
  el.addEventListener('pointerleave', () => {
    const ent = entryFor(el);
    if (!ent || !stack.includes(ent)) return;
    clearTimeout(ent.timer);
    if (!ent.openRow) setHover(ent, null);
    else setHover(ent, ent.openRow);
  });
  el.addEventListener('pointerdown', (ev) => {
    pressedRow = ev.target.closest('.mrow');
    ev.preventDefault();
  });
  el.addEventListener('pointerup', (ev) => {
    const row = ev.target.closest('.mrow');
    const ent = entryFor(el);
    if (!row || !ent) return;
    const wasPressed = pressedRow === row;
    pressedRow = null;
    if (wasPressed) return activateRow(ent, row);
    // Press-drag-release from a menu bar / start button.
    if (ev.button === 0 && session && performance.now() - session.openedAt > 200) activateRow(ent, row);
  });
  el.addEventListener('contextmenu', (ev) => ev.preventDefault());
}

function hoverRow(entry, row) {
  clearTimeout(entry.timer);
  setHover(entry, row);
  if (entry.openRow === row) return;
  const hasSub = row._item?.items && !row._disabled;
  if (!hasSub && !entry.openRow) return;
  entry.timer = setTimeout(() => {
    if (!stack.includes(entry) || entry.hover !== row) return;
    closeAbove(entry.level);
    if (hasSub) openSub(entry, row);
  }, SUBMENU_DELAY);
}

function openSub(entry, row, selectFirst = false) {
  closeAbove(entry.level);
  entry.openRow = row;
  setHover(entry, row);
  openMenu(row._item.items, {
    _sub: true,
    anchorRect: row.getBoundingClientRect(),
    placement: 'right',
    withIcons: row._item.subIcons,
    selectFirst,
  });
}

function activateRow(entry, row) {
  const it = row._item;
  if (!it || row._disabled) return;
  if (it.items) {
    clearTimeout(entry.timer);
    if (entry.openRow !== row) openSub(entry, row);
    return;
  }
  closeMenus();
  if (it.action) setTimeout(() => it.action(), 0);
}

function rows(entry) {
  return [...entry.el.querySelectorAll('.mrow')];
}

function moveHover(entry, dir) {
  const rs = rows(entry);
  if (!rs.length) return;
  let i = rs.indexOf(entry.hover);
  for (let n = 0; n < rs.length; n++) {
    i = (i + dir + rs.length) % rs.length;
    if (rs[i]) break;
  }
  setHover(entry, rs[i]);
}

// Global listeners: click-away closes, keyboard navigation.
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!stack.length) return;
    if (stack.some((s) => s.el.contains(e.target))) return;
    if (session?.owner && session.owner.contains(e.target)) return;
    closeMenus();
  },
  true,
);

window.addEventListener('blur', () => closeMenus());
window.addEventListener('resize', () => closeMenus());

document.addEventListener(
  'keydown',
  (e) => {
    if (!stack.length) return;
    const top = stack[stack.length - 1];
    let handled = true;
    switch (e.key) {
      case 'ArrowDown':
        moveHover(top, 1);
        break;
      case 'ArrowUp':
        moveHover(top, -1);
        break;
      case 'ArrowRight':
        if (top.hover?._item?.items && !top.hover._disabled) openSub(top, top.hover, true);
        else session?.onNavigate?.('right');
        break;
      case 'ArrowLeft':
        if (stack.length > 1 && !(stack.length === 2 && session?.onNavigate)) closeAbove(stack.length - 2);
        else if (session?.onNavigate) session.onNavigate('left');
        else if (stack.length > 1) closeAbove(stack.length - 2);
        break;
      case 'Enter':
      case ' ':
        if (top.hover) activateRow(top, top.hover);
        break;
      case 'Escape':
        if (stack.length > 1) closeAbove(stack.length - 2);
        else closeMenus();
        break;
      default: {
        // Access keys: underlined letter.
        const k = e.key.length === 1 ? e.key.toLowerCase() : null;
        const row = k && rows(top).find((r) => r.querySelector('u.ak')?.textContent.toLowerCase() === k);
        if (row) {
          setHover(top, row);
          activateRow(top, row);
        } else handled = false;
      }
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true,
);

/** Show a context menu at a pointer event's position. */
export function contextMenu(e, items, opts = {}) {
  e.preventDefault();
  e.stopPropagation();
  return openMenu(items, { x: e.clientX, y: e.clientY, ...opts });
}

/** A window menu bar ("File  Edit  View  Help"). */
export function createMenuBar(spec) {
  const bar = h('div', { class: 'menubar' });
  let menus = [];
  let openIdx = -1;

  function render(newSpec) {
    menus = newSpec;
    bar.replaceChildren();
    menus.forEach((m, i) => {
      const it = h('div', { class: 'menubar-item' }, accel(m.label));
      it.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (openIdx === i) closeMenus();
        else openAt(i);
      });
      it.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse' && openIdx !== -1 && openIdx !== i) openAt(i);
      });
      bar.append(it);
    });
  }

  function openAt(i, selectFirst = false) {
    closeMenus();
    const item = bar.children[i];
    item.classList.add('open');
    openIdx = i;
    openMenu(menus[i].items, {
      anchorRect: item.getBoundingClientRect(),
      placement: 'below',
      owner: bar,
      selectFirst,
      onClose: () => {
        item.classList.remove('open');
        if (openIdx === i) openIdx = -1;
      },
      onNavigate: (dir) => openAt((i + (dir === 'right' ? 1 : -1) + menus.length) % menus.length, true),
    });
  }

  render(spec);
  bar.setMenus = render;
  bar.openByKey = (k) => {
    const i = menus.findIndex((m) => /&(.)/.exec(m.label)?.[1].toLowerCase() === k.toLowerCase());
    if (i >= 0) openAt(i, true);
    return i >= 0;
  };
  return bar;
}

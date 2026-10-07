// Window manager.
//
// createWindow({
//   key,                 // singleton key: an open window with this key is focused instead
//   title, icon,         // icon = registry name, shown at 16px in title bar + taskbar
//   x, y, width, height, // outer size in px; omit width/height to size to content
//   center,              // center on the desktop
//   resizable = true, minimizable = true, maximizable = true, closable = true,
//   helpButton = false,  // "?" caption button (dialogs)
//   menu,                // menu bar spec, see menu.js
//   statusBar,           // true | string | string[]
//   taskbar = true,      // show a taskbar button
//   parent,              // owning window; makes this dialog modal to it
//   maximized,
//   className, bodyClass,
//   onClose,             // return false to cancel
//   onHelp, onResize, onFocus,
// }) -> Win

import { h, clamp, drag, isSmallScreen, sleep } from './util.js';
import { icon, iconURL } from './icons.js';
import { createMenuBar, openMenu, closeMenus } from './menu.js';
import { play } from './sound.js';

export const wmEvents = new EventTarget();
const windows = []; // creation order
const byKey = new Map();
let zTop = 10;
let active = null;
let cascade = 0;
let layer = null;
let nextId = 1;

function getLayer() {
  if (!layer) layer = document.getElementById('windows');
  return layer;
}

export const allWindows = () => windows.slice();
export const activeWindow = () => active;
const emit = () => wmEvents.dispatchEvent(new Event('change'));

export function desktopRect() {
  const l = getLayer();
  return { w: l.clientWidth, h: l.clientHeight };
}

export function createWindow(opts) {
  if (opts.key && byKey.has(opts.key)) {
    const w = byKey.get(opts.key);
    if (w.minimized) w.restore();
    w.focus();
    return w;
  }
  return new Win(opts);
}

export function findWindow(key) {
  return byKey.get(key) || null;
}

export function closeAll() {
  for (const w of windows.slice()) w.close(true);
}

/** Win95 zoom rectangle animation between two rects. */
async function zoom(from, to) {
  if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = h('div', { class: 'zoom-rect' });
  const set = (b) => Object.assign(r.style, { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' });
  set(from);
  document.body.append(r);
  r.getBoundingClientRect();
  set(to);
  await sleep(190);
  r.remove();
}

class Win {
  constructor(o) {
    this.opts = o;
    this.id = nextId++;
    this.key = o.key || null;
    this.resizable = o.resizable !== false;
    this.minimizable = o.minimizable !== false && !o.parent;
    this.maximizable = o.maximizable !== false && this.resizable;
    this.showMinMax = o.minimizable !== false || o.maximizable !== false ? !o.parent && !o.dialog : false;
    this.taskbar = o.taskbar !== false && !o.parent;
    this.parent = o.parent || null;
    this.modalChild = null;
    this.minimized = false;
    this.maximized = false;
    this.closed = false;
    this.title = o.title || '';
    this.iconName = o.icon || null;

    const el = (this.el = h('div', { class: 'window' + (o.className ? ' ' + o.className : ''), tabindex: '-1', role: 'dialog' }));
    el._win = this;

    // Title bar
    this.titleIcon = this.iconName ? icon(this.iconName, 16, 'title-icon') : null;
    this.titleText = h('span', { class: 'title-text' }, this.title);
    const btns = h('div', { class: 'title-buttons' });
    if (o.helpButton) btns.append(h('button', { class: 'tb help', 'aria-label': 'Help', onclick: () => o.onHelp?.() }));
    if (this.showMinMax) {
      this.minBtn = h('button', { class: 'tb min', 'aria-label': 'Minimize', disabled: !this.minimizable, onclick: () => this.minimize() });
      this.maxBtn = h('button', { class: 'tb max', 'aria-label': 'Maximize', disabled: !this.maximizable, onclick: () => this.toggleMaximize() });
      btns.append(this.minBtn, this.maxBtn);
    }
    if (o.closable !== false || this.showMinMax || o.helpButton) {
      btns.append(h('button', { class: 'tb close', 'aria-label': 'Close', disabled: o.closable === false, onclick: () => this.close() }));
    }
    for (const b of btns.children) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.titleBar = h('div', { class: 'title-bar' }, this.titleIcon, this.titleText, btns);
    el.append(this.titleBar);

    if (o.menu) {
      this.menuBar = createMenuBar(o.menu);
      el.append(this.menuBar);
    }

    this.body = h('div', { class: 'window-body' + (o.bodyClass ? ' ' + o.bodyClass : '') });
    el.append(this.body);

    if (o.statusBar) {
      this.statusBar = h('div', { class: 'status-bar' });
      el.append(this.statusBar);
      this.setStatus(o.statusBar === true ? '' : o.statusBar);
    }

    if (this.resizable) {
      for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
        const handle = h('div', { class: `resize-handle ${dir}` });
        handle.addEventListener('pointerdown', (e) => this.startResize(e, dir));
        el.append(handle);
      }
    }

    this.bindEvents();

    // Size & position
    const desk = desktopRect();
    if (o.width) el.style.width = Math.min(o.width, desk.w) + 'px';
    if (o.height) el.style.height = Math.min(o.height, desk.h) + 'px';
    getLayer().append(el);

    const w = el.offsetWidth, ht = el.offsetHeight;
    let x = o.x, y = o.y;
    if (o.center || (this.parent && x == null)) {
      x = (desk.w - w) / 2;
      y = (desk.h - ht) / 2.4;
    } else if (x == null || y == null) {
      const step = 22;
      x = 30 + (cascade % 10) * step;
      y = 20 + (cascade % 10) * step;
      cascade++;
      if (x + w > desk.w) x = Math.max(0, desk.w - w);
      if (y + ht > desk.h) y = Math.max(0, desk.h - ht);
    }
    this.moveTo(x, y);

    windows.push(this);
    if (this.key) byKey.set(this.key, this);
    if (this.parent) this.parent.modalChild = this;

    if (o.maximized || (this.maximizable && isSmallScreen())) this.maximize(false);
    this.focus();
    emit();
  }

  bindEvents() {
    const el = this.el;
    el.addEventListener(
      'pointerdown',
      (e) => {
        if (this.modalChild && !this.modalChild.closed) {
          e.stopPropagation();
          e.preventDefault();
          this.modalChild.focus();
          this.modalChild.flash();
          play('ding');
          return;
        }
        if (active !== this) this.focus();
      },
      true,
    );

    this.titleBar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target === this.titleIcon) return;
      if (this.maximized) return;
      const sx = this.x, sy = this.y;
      const desk = desktopRect();
      drag(e, {
        threshold: 2,
        onMove: (dx, dy) => {
          const nx = clamp(sx + dx, -this.el.offsetWidth + 60, desk.w - 60);
          const ny = clamp(sy + dy, 0, desk.h - 20);
          this.moveTo(nx, ny);
        },
      });
    });
    this.titleBar.addEventListener('dblclick', (e) => {
      if (e.target === this.titleIcon) return this.close();
      if (this.maximizable) this.toggleMaximize();
    });
    this.titleBar.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openMenu(this.systemMenu(), { x: e.clientX, y: e.clientY });
    });
    this.titleIcon?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const r = this.titleIcon.getBoundingClientRect();
      openMenu(this.systemMenu(), { x: r.left - 2, y: r.bottom + 2, owner: this.titleIcon });
    });

    el.addEventListener('keydown', (e) => {
      if (e.altKey && e.key.length === 1 && this.menuBar && !e.ctrlKey && !e.metaKey) {
        if (this.menuBar.openByKey(e.key)) e.preventDefault();
      }
    });
  }

  systemMenu() {
    return [
      { label: '&Restore', disabled: !(this.maximized || this.minimized), action: () => this.restore() },
      { label: '&Move', disabled: true },
      { label: '&Size', disabled: true },
      { label: 'Mi&nimize', disabled: !this.minimizable, action: () => this.minimize() },
      { label: 'Ma&ximize', disabled: !this.maximizable || this.maximized, action: () => this.maximize() },
      '-',
      { label: '&Close', default: true, shortcut: 'Alt+F4', action: () => this.close() },
    ];
  }

  startResize(e, dir) {
    if (e.button !== 0 || this.maximized) return;
    e.stopPropagation();
    e.preventDefault();
    const sx = this.x, sy = this.y, sw = this.el.offsetWidth, sh = this.el.offsetHeight;
    const minW = this.opts.minWidth || 160, minH = this.opts.minHeight || 80;
    const desk = desktopRect();
    drag(e, {
      onMove: (dx, dy) => {
        let x = sx, y = sy, w = sw, ht = sh;
        if (dir.includes('e')) w = Math.max(minW, sw + dx);
        if (dir.includes('s')) ht = Math.max(minH, Math.min(sh + dy, desk.h - sy));
        if (dir.includes('w')) {
          w = Math.max(minW, sw - dx);
          x = sx + sw - w;
        }
        if (dir.includes('n')) {
          ht = Math.max(minH, sh - dy);
          y = sy + sh - ht;
          if (y < 0) (ht += y), (y = 0);
        }
        this.moveTo(x, y);
        this.el.style.width = w + 'px';
        this.el.style.height = ht + 'px';
        this.opts.onResize?.(this);
      },
    });
  }

  /** Make the size-grip element (e.g. in a status bar) resize the window. */
  attachGrip(grip) {
    grip.addEventListener('pointerdown', (e) => this.startResize(e, 'se'));
  }

  moveTo(x, y) {
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.el.style.left = this.x + 'px';
    this.el.style.top = this.y + 'px';
  }

  center() {
    const desk = desktopRect();
    this.moveTo(Math.max(0, (desk.w - this.el.offsetWidth) / 2), Math.max(0, (desk.h - this.el.offsetHeight) / 2.4));
  }

  setTitle(t) {
    this.title = t;
    this.titleText.textContent = t;
    emit();
  }

  setIcon(name) {
    this.iconName = name;
    if (this.titleIcon) this.titleIcon.src = iconURL(name, 16);
    emit();
  }

  setMenu(spec) {
    this.menuBar?.setMenus(spec);
  }

  setStatus(fields) {
    if (!this.statusBar) return;
    const list = Array.isArray(fields) ? fields : [fields];
    this.statusBar.replaceChildren(
      ...list.map((f, i) => h('div', { class: 'status-field', style: i === 0 && list.length > 1 ? { flex: '2' } : null }, f)),
    );
    if (this.resizable) {
      const grip = h('div', { class: 'size-grip' });
      this.attachGrip(grip);
      this.statusBar.append(h('div', { class: 'status-field grip' }, grip));
    }
  }

  flash() {
    let n = 0;
    const t = setInterval(() => {
      this.el.classList.toggle('inactive');
      if (++n >= 6) {
        clearInterval(t);
        this.el.classList.toggle('inactive', active !== this);
      }
    }, 70);
  }

  focus() {
    if (this.closed) return;
    if (this.modalChild && !this.modalChild.closed) return this.modalChild.focus();
    closeMenus();
    if (active && active !== this) {
      active.el.classList.add('inactive');
      active.opts.onBlur?.(active);
    }
    active = this;
    this.el.classList.remove('inactive');
    this.el.style.zIndex = ++zTop;
    if (this.parent) this.parent.el.style.zIndex = zTop - 1;
    if (this.parent) this.el.style.zIndex = ++zTop;
    if (!this.el.contains(document.activeElement)) this.el.focus({ preventScroll: true });
    this.opts.onFocus?.(this);
    emit();
  }

  blur() {
    if (active === this) {
      active = null;
      this.el.classList.add('inactive');
      emit();
    }
  }

  taskButtonRect() {
    const b = document.querySelector(`.task-button[data-wid="${this.id}"]`);
    return b?.getBoundingClientRect();
  }

  async minimize() {
    if (!this.minimizable || this.minimized) return;
    const from = this.el.getBoundingClientRect();
    const to = this.taskButtonRect();
    this.minimized = true;
    this.el.classList.add('minimized');
    this.el.classList.add('inactive');
    if (active === this) {
      active = null;
      focusTopmost(this);
    }
    emit();
    await zoom(from, to);
  }

  async restore() {
    if (this.minimized) {
      const from = this.taskButtonRect();
      this.el.classList.remove('minimized');
      const to = this.el.getBoundingClientRect();
      this.el.style.visibility = 'hidden';
      this.minimized = false;
      this.focus();
      await zoom(from, to);
      this.el.style.visibility = '';
      return;
    }
    if (this.maximized) this.unmaximize();
  }

  toggleMaximize() {
    if (this.maximized) this.unmaximize();
    else this.maximize();
  }

  maximize(animate = true) {
    if (!this.maximizable || this.maximized) return;
    const from = this.el.getBoundingClientRect();
    this.prevRect = { x: this.x, y: this.y, w: this.el.style.width, h: this.el.style.height };
    this.maximized = true;
    this.el.classList.add('maximized');
    Object.assign(this.el.style, { left: '0px', top: '0px', width: '100%', height: '100%' });
    if (this.maxBtn) this.maxBtn.setAttribute('aria-label', 'Restore');
    this.opts.onResize?.(this);
    if (animate) zoom(from, this.el.getBoundingClientRect());
    emit();
  }

  unmaximize() {
    if (!this.maximized) return;
    const from = this.el.getBoundingClientRect();
    this.maximized = false;
    this.el.classList.remove('maximized');
    const p = this.prevRect;
    this.el.style.width = p.w;
    this.el.style.height = p.h;
    this.moveTo(p.x, p.y);
    if (this.maxBtn) this.maxBtn.setAttribute('aria-label', 'Maximize');
    this.opts.onResize?.(this);
    zoom(from, this.el.getBoundingClientRect());
    emit();
  }

  close(force = false) {
    if (this.closed) return;
    if (!force && this.modalChild && !this.modalChild.closed) return this.modalChild.focus();
    if (!force && this.opts.onClose && this.opts.onClose(this) === false) return;
    if (this.modalChild && !this.modalChild.closed) this.modalChild.close(true);
    this.closed = true;
    this.el.remove();
    windows.splice(windows.indexOf(this), 1);
    if (this.key && byKey.get(this.key) === this) byKey.delete(this.key);
    if (this.parent && this.parent.modalChild === this) this.parent.modalChild = null;
    if (active === this) {
      active = null;
      if (this.parent && !this.parent.closed) this.parent.focus();
      else focusTopmost(this);
    }
    this.opts.afterClose?.(this);
    emit();
  }
}

function focusTopmost(except) {
  const candidates = windows.filter((w) => w !== except && !w.minimized && !w.closed);
  candidates.sort((a, b) => (+b.el.style.zIndex || 0) - (+a.el.style.zIndex || 0));
  if (candidates[0]) candidates[0].focus();
  else emit();
}

// Keep windows reachable when the browser window shrinks.
window.addEventListener('resize', () => {
  const desk = desktopRect();
  for (const w of windows) {
    if (w.maximized) continue;
    const x = clamp(w.x, -w.el.offsetWidth + 60, Math.max(0, desk.w - 60));
    const y = clamp(w.y, 0, Math.max(0, desk.h - 20));
    if (x !== w.x || y !== w.y) w.moveTo(x, y);
  }
});

/** Deactivate all windows (e.g. clicking the desktop). */
export function deactivateAll() {
  if (active) active.blur();
}

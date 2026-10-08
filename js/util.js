// Small DOM + formatting helpers shared across the shell.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

/** Win95 access-key label: "&File" renders with the F underlined. "&&" is a literal ampersand. */
export function accel(label) {
  const frag = document.createDocumentFragment();
  if (label == null) return frag;
  const s = String(label);
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '&' && i + 1 < s.length) {
      if (s[i + 1] === '&') { buf += '&'; i++; continue; }
      if (buf) frag.append(buf), (buf = '');
      frag.append(h('u', { class: 'ak' }, s[i + 1]));
      i++;
    } else buf += s[i];
  }
  if (buf) frag.append(buf);
  return frag;
}

export const stripAccel = (s) => String(s ?? '').replace(/&(.)/g, '$1');

/** Evaluate a value that may be a thunk. */
export const val = (v, ...args) => (typeof v === 'function' ? v(...args) : v);

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function formatBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 2 : 1).replace(/\.?0+$/, '')}KB`;
  return `${(n / 1048576).toFixed(2).replace(/\.?0+$/, '')}MB`;
}

export const withCommas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** "10/7/26 3:04 PM" — Win95 short date/time. */
export function formatDateTime(d) {
  if (!d) return '';
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)} ${formatTime(d)}`;
}

export function formatTime(d) {
  let hr = d.getHours();
  const ap = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  return `${hr}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

export function formatLongDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: '2-digit' });
}

export function storage(key, fallback) {
  try {
    const v = localStorage.getItem('w95:' + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function store(key, value) {
  try {
    localStorage.setItem('w95:' + key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode, blocked) */
  }
}

export const isTouch = () => matchMedia('(pointer: coarse)').matches;
export const isSmallScreen = () => innerWidth < 700 || innerHeight < 500;

/**
 * Pointer drag helper. onMove receives (dx, dy, event); returns a cleanup promise
 * that resolves with whether the pointer actually moved past the threshold.
 */
export function drag(e, { onStart, onMove, onEnd, threshold = 0 } = {}) {
  const sx = e.clientX, sy = e.clientY;
  let started = threshold === 0;
  const target = e.currentTarget || e.target;
  try { target.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  if (started) onStart?.(e);
  return new Promise((resolve) => {
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!started) {
        if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
        started = true;
        onStart?.(ev);
      }
      onMove?.(dx, dy, ev);
    };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (started) onEnd?.(ev);
      resolve(started);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  });
}

const URL_RE = /\b(https?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]}*])|\b([\w.+-]+@[\w-]+(?:\.[\w-]+)+)\b/g;

/** Append text to el, turning URLs and e-mail addresses into links. */
export function linkify(el, text) {
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) el.append(text.slice(last, m.index));
    const href = m[1] ? m[1] : `mailto:${m[2]}`;
    el.append(h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) el.append(text.slice(last));
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

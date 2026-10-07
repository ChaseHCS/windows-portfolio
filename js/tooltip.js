// Win95 yellow tooltips.

import { h } from './util.js';

let tipEl = null;
let timer = 0;

export function hideTooltip() {
  clearTimeout(timer);
  tipEl?.remove();
  tipEl = null;
}

/** text may be a string or a function evaluated when the tip appears. */
export function attachTooltip(el, text, { delay = 500 } = {}) {
  let x = 0, y = 0;
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX;
    y = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const t = typeof text === 'function' ? text() : text;
      if (!t) return;
      hideTooltip();
      tipEl = h('div', { class: 'tooltip' }, t);
      document.body.append(tipEl);
      const w = tipEl.offsetWidth, ht = tipEl.offsetHeight;
      let tx = x, ty = y + 20;
      if (tx + w > innerWidth) tx = innerWidth - w - 2;
      if (ty + ht > innerHeight) ty = y - ht - 4;
      tipEl.style.left = tx + 'px';
      tipEl.style.top = ty + 'px';
    }, delay);
  });
  el.addEventListener('pointermove', (e) => {
    x = e.clientX;
    y = e.clientY;
  });
  el.addEventListener('pointerleave', hideTooltip);
  el.addEventListener('pointerdown', hideTooltip);
}

// A labelled icon as used on the desktop and in folder windows.

import { h } from './util.js';
import { iconWrap } from './icons.js';
import { displayName } from './fs.js';
import { iconFor } from './shell.js';

export function iconItem(node, { className = 'file-icon', size = 32 } = {}) {
  const el = h(
    'div',
    { class: className, role: 'button', 'aria-label': displayName(node) },
    iconWrap(iconFor(node), { shortcut: node.type === 'link', size }),
    h('span', { class: 'label' }, displayName(node)),
  );
  el._node = node;
  return el;
}

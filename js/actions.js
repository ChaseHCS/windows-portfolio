// Shared file actions: context menus, Properties sheets, Recycle Bin.

import { h, formatBytes, withCommas, formatDateTime } from './util.js';
import { icon } from './icons.js';
import { fs, displayName, pathOf, shortName, sizeOf, notifyFS, walk } from './fs.js';
import { openNode, iconFor, typeName, launch } from './shell.js';
import { messageBox, propertySheet, infoGrid } from './dialogs.js';
import { play } from './sound.js';
import { printText } from './print.js';

export function nodeMenu(node, { parentWin = null } = {}) {
  if (node.type === 'computer') {
    return [
      { label: '&Open', default: true, action: () => openNode(node) },
      { label: '&Explore', action: () => launch('explorer', fs.C) },
      { label: '&Find...', action: () => launch('find') },
      '-',
      { label: 'Map &Network Drive...', disabled: true },
      { label: '&Disconnect Network Drive...', disabled: true },
      '-',
      { label: 'Create &Shortcut', disabled: true },
      { label: 'Rena&me', disabled: true },
      '-',
      { label: 'P&roperties', action: () => launch('applet', 'system') },
    ];
  }
  if (node.type === 'recycle') {
    return [
      { label: '&Open', default: true, action: () => openNode(node) },
      { label: '&Explore', action: () => openNode(node) },
      { label: 'Empty Recycle &Bin', disabled: () => !node.children.length, action: () => emptyRecycleBin(parentWin) },
      '-',
      { label: 'Create &Shortcut', disabled: true },
      '-',
      { label: 'P&roperties', action: () => showProperties(node, parentWin) },
    ];
  }
  if (node.type === 'drive') {
    return [
      { label: '&Open', default: true, action: () => openNode(node) },
      { label: '&Explore', action: () => openNode(node) },
      { label: '&Find...', action: () => launch('find', node) },
      '-',
      { label: 'Format...', action: () => formatDenied(node, parentWin) },
      '-',
      { label: 'Create &Shortcut', disabled: true },
      '-',
      { label: 'P&roperties', action: () => showProperties(node, parentWin) },
    ];
  }
  const isText = node.type === 'file' && !node.app;
  return [
    { label: '&Open', default: true, action: () => openNode(node) },
    isText ? { label: '&Print', action: () => printNode(node) } : null,
    node.isContainer ? { label: '&Explore', action: () => openNode(node) } : null,
    node.isContainer ? { label: '&Find...', action: () => launch('find', node) } : null,
    '-',
    { label: 'Se&nd To', items: [{ label: '3½ Floppy (A)', icon: 'drive-floppy', action: () => openNode(fs.A) }], subIcons: true },
    '-',
    { label: 'Cu&t', disabled: true },
    { label: '&Copy', disabled: true },
    '-',
    { label: 'Create &Shortcut', disabled: true },
    { label: '&Delete', action: () => deleteNode(node, parentWin) },
    { label: 'Rena&me', disabled: true },
    '-',
    { label: 'P&roperties', action: () => showProperties(node, parentWin) },
  ].filter(Boolean);
}

export async function printNode(node) {
  const { readText } = await import('./fs.js');
  printText(displayName(node), await readText(node));
}

export async function deleteNode(node, parentWin) {
  const r = await messageBox({
    title: 'Confirm File Delete',
    text: `Are you sure you want to send '${displayName(node)}' to the Recycle Bin?`,
    icon: 'question',
    buttons: ['&Yes', '&No'],
    parent: parentWin,
  });
  if (r !== 'Yes') return;
  await messageBox({
    title: 'Error Deleting File',
    text: `Cannot delete ${displayName(node)}: Access is denied.\n\nMake sure the disk is not full or write-protected\nand that the file is not currently in use.`,
    icon: 'error',
    parent: parentWin,
  });
}

async function formatDenied(node, parentWin) {
  await messageBox({
    title: `Format ${displayName(node)}`,
    text: node.ready
      ? `Windows cannot format this drive. Quit any disk utilities or other programs that are using this drive, and make sure that no window is displaying the contents of the drive. Then try formatting again.`
      : `${node.letter}:\\ is not accessible.\n\nThe device is not ready.`,
    icon: node.ready ? 'warning' : 'error',
    parent: parentWin,
  });
}

export async function emptyRecycleBin(parentWin) {
  const n = fs.recycle.children.length;
  if (!n) return;
  const what = n === 1 ? `'${displayName(fs.recycle.children[0])}'` : `these ${n} items`;
  const r = await messageBox({
    title: 'Confirm File Delete',
    text: `Are you sure you want to delete ${what}?`,
    icon: 'question',
    buttons: ['&Yes', '&No'],
    parent: parentWin,
  });
  if (r !== 'Yes') return;
  fs.recycle.children.length = 0;
  play('recycle');
  notifyFS();
}

function folderStats(node) {
  let files = 0, folders = 0, bytes = 0;
  walk(node, (n) => {
    if (n === node) return;
    if (n.isContainer) folders++;
    else {
      files++;
      bytes += sizeOf(n) || 0;
    }
  });
  return { files, folders, bytes };
}

export function showProperties(node, parentWin = null) {
  const name = displayName(node);
  const head = h('div', { class: 'prop-head' }, icon(iconFor(node), 32), h('input', { type: 'text', class: 'field', value: name, readonly: true }));
  const rows = [];
  if (node.type === 'drive') {
    const used = folderStats(node).bytes + 412_000_000;
    const cap = 1_281_982_464;
    rows.push(['Label:', node.label || ''], ['Type:', typeName(node)], '-', ['Used space:', `${withCommas(used)} bytes   ${formatBytes(used)}`], ['Free space:', `${withCommas(cap - used)} bytes   ${formatBytes(cap - used)}`], '-', ['Capacity:', `${withCommas(cap)} bytes   ${formatBytes(cap)}`]);
  } else if (node.isContainer) {
    const s = folderStats(node);
    rows.push(['Type:', typeName(node)], ['Location:', node.parent ? pathOf(node.parent) : ''], ['Size:', `${formatBytes(s.bytes)} (${withCommas(s.bytes)} bytes)`], ['Contains:', `${s.files} Files, ${s.folders} Folders`], '-', ['MS-DOS name:', shortName(node)], ['Created:', formatDateTime(node.date)]);
  } else {
    const size = sizeOf(node) || 0;
    rows.push(['Type:', typeName(node)], ['Location:', pathOf(node.parent)], ['Size:', `${formatBytes(size)} (${withCommas(size)} bytes)`], '-', ['MS-DOS name:', shortName(node)], ['Created:', formatDateTime(node.date)], ['Modified:', formatDateTime(node.date)], ['Accessed:', formatDateTime(new Date()).split(' ')[0]]);
    if (node.type === 'url') rows.push('-', ['Target URL:', node.url]);
  }
  const attrs = node.type === 'drive' ? null : h(
    'div',
    { class: 'prop-attrs' },
    h('div', { class: 'k' }, 'Attributes:'),
    ...[
      ['Read-only', true],
      ['Hidden', false],
      ['Archive', !node.isContainer],
      ['System', !!node.app],
    ].map(([label, on]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: on, disabled: true }), h('span', { class: 'box' }), h('span', { class: 'lbl' }, label))),
  );
  const content = h('div', { class: 'prop-general' }, head, h('hr', { class: 'etched' }), infoGrid(rows), attrs ? h('hr', { class: 'etched' }) : null, attrs);
  return propertySheet({ title: `${name} Properties`, tabs: [{ label: 'General', content }], parent: parentWin });
}

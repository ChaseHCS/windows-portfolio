// The shell: app registry, file associations, icons and type names.

import { fs, resolve, displayName, pathOf } from './fs.js';
import { messageBox } from './dialogs.js';

const apps = new Map();

export function registerApp(name, fn) {
  apps.set(name, fn);
}

export function launch(name, ...args) {
  const fn = apps.get(name);
  if (!fn) {
    messageBox({
      title: name,
      text: `Cannot find the file '${name}' (or one of its components). Make sure the path and filename are correct and that all required libraries are available.`,
      icon: 'error',
    });
    return null;
  }
  return fn(...args);
}

export const hasApp = (name) => apps.has(name);

const TEXT_EXT = new Set(['txt', 'md', 'ini', 'bat', 'sys', 'log', 'cfg']);

export async function openNode(node, opts = {}) {
  if (!node) return;
  switch (node.type) {
    case 'computer':
    case 'folder':
    case 'recycle':
    case 'cpanel':
      return launch('explorer', node, opts);
    case 'drive':
      if (!node.ready) {
        const r = await messageBox({
          title: displayName(node),
          text: `${node.letter}:\\ is not accessible.\n\nThe device is not ready.`,
          icon: 'error',
          buttons: ['&Retry', 'Cancel'],
        });
        if (r === 'Retry') return openNode(node, opts);
        return;
      }
      return launch('explorer', node, opts);
    case 'link':
      if (node.app) return launch(node.app, ...(node.args || []));
      return openNode(resolve(node.target), opts);
    case 'url':
      window.open(node.url, '_blank', 'noopener,noreferrer');
      return;
    case 'applet':
      return launch('applet', node.applet, node);
    case 'file':
      if (node.app === 'dos-only') {
        return messageBox({
          title: displayName(node),
          text: 'This program cannot be run in Windows.\n\nRun it from the MS-DOS Prompt instead.',
          icon: 'warning',
        });
      }
      if (node.app) return launch(node.app);
      if (TEXT_EXT.has(node.ext) || node.src || node.content != null) return launch('notepad', node);
      return messageBox({ title: 'Open With', text: `There is no program associated with ${displayName(node)}.`, icon: 'info' });
  }
}

export function iconFor(node) {
  if (!node) return 'file-generic';
  if (node.icon) return node.icon;
  switch (node.type) {
    case 'computer':
      return 'my-computer';
    case 'drive':
      return 'drive-' + node.kind;
    case 'folder':
      return 'folder';
    case 'recycle':
      return node.children.length ? 'recycle-bin-full' : 'recycle-bin-empty';
    case 'url':
      return 'internet-link';
    case 'link':
      return node.app ? 'file-exe' : iconFor(resolve(node.target));
  }
  if (node.app === 'msdos') return 'msdos';
  if (node.app === 'notepad') return 'notepad';
  if (node.app === 'winmine') return 'minesweeper';
  if (node.app === 'explorer') return 'explorer';
  switch (node.ext) {
    case 'txt':
    case 'md':
    case 'log':
      return 'text-file';
    case 'ini':
    case 'sys':
      return 'file-sys';
    case 'bat':
      return 'file-bat';
    case 'exe':
    case 'com':
      return 'file-exe';
  }
  return 'file-generic';
}

export function typeName(node) {
  switch (node.type) {
    case 'computer':
      return 'System Folder';
    case 'drive':
      return { floppy: '3½ Inch Floppy Disk', hdd: 'Local Disk', cdrom: 'CD-ROM Disc' }[node.kind];
    case 'folder':
      return 'File Folder';
    case 'recycle':
    case 'cpanel':
      return 'System Folder';
    case 'url':
      return 'Internet Shortcut';
    case 'link':
      return 'Shortcut';
    case 'applet':
      return 'Control Panel Item';
  }
  switch (node.ext) {
    case 'txt':
    case 'md':
      return 'Text Document';
    case 'ini':
      return 'Configuration Settings';
    case 'sys':
      return 'System file';
    case 'bat':
      return 'MS-DOS Batch File';
    case 'exe':
    case 'com':
      return 'Application';
    case 'log':
      return 'Text Document';
  }
  return node.ext ? `${node.ext.toUpperCase()} File` : 'File';
}

/** Interpret a Run-dialog / DOS "start" command. Returns false if nothing matched. */
export function runCommand(input, cwd = fs.C) {
  const cmd = input.trim();
  if (!cmd) return true;
  if (/^(https?:\/\/|mailto:)/i.test(cmd)) {
    window.open(cmd, '_blank', 'noopener,noreferrer');
    return true;
  }
  if (/^www\./i.test(cmd)) {
    window.open('https://' + cmd, '_blank', 'noopener,noreferrer');
    return true;
  }
  const [head, ...rest] = cmd.match(/"[^"]*"|\S+/g) || [];
  const name = head.replace(/"/g, '').toLowerCase().replace(/\.(exe|com)$/, '');
  const arg = rest.join(' ').replace(/^"|"$/g, '');
  const aliases = {
    notepad: () => launch('notepad', arg ? resolve(arg, cwd) : null),
    command: () => launch('msdos'),
    cmd: () => launch('msdos'),
    msdos: () => launch('msdos'),
    winmine: () => launch('winmine'),
    minesweeper: () => launch('winmine'),
    explorer: () => openNode(arg ? resolve(arg, cwd) : fs.C),
    control: () => openNode(fs.cpanel),
    welcome: () => launch('welcome'),
  };
  if (aliases[name]) {
    aliases[name]();
    return true;
  }
  const node = resolve(cmd, cwd);
  if (node) {
    openNode(node);
    return true;
  }
  // Match a document by display name anywhere (e.g. "resume").
  const doc = [...fs.docs, ...fs.writeups].find((d) => displayName(d).toLowerCase() === cmd.toLowerCase());
  if (doc) {
    openNode(doc);
    return true;
  }
  return false;
}

export { pathOf };

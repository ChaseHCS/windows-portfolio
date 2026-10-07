// Virtual file system. Built from content/manifest.json plus a sprinkling of
// authentic Win95 system files.

import { config } from './config.js';

/** Fires 'change' whenever the tree is modified (e.g. Recycle Bin emptied). */
export const fsEvents = new EventTarget();
export const notifyFS = () => fsEvents.dispatchEvent(new Event('change'));

export const WIN95_DATE = new Date(1995, 6, 11, 9, 50);
const CONTAINERS = new Set(['computer', 'drive', 'folder', 'recycle', 'cpanel']);
const KNOWN_EXT = new Set(['txt', 'md', 'exe', 'com', 'bat', 'sys', 'ini', 'lnk', 'url', 'dll', 'log']);
const ALWAYS_HIDE_EXT = new Set(['lnk', 'url']);

export class FsNode {
  constructor(name, type, props = {}) {
    this.name = name;
    this.type = type;
    this.parent = null;
    this.date = WIN95_DATE;
    Object.assign(this, props);
    if (CONTAINERS.has(type)) this.children = this.children || [];
  }

  get isContainer() {
    return CONTAINERS.has(this.type);
  }

  get ext() {
    if (this.isContainer || this.type === 'applet') return '';
    const i = this.name.lastIndexOf('.');
    return i > 0 ? this.name.slice(i + 1).toLowerCase() : '';
  }

  add(...nodes) {
    for (const n of nodes.flat()) {
      if (!n) continue;
      if (!n.parent) n.parent = this;
      this.children.push(n);
    }
    return this;
  }

  remove(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
  }
}

/** Display name as Explorer shows it (extensions hidden, 8.3 caps prettified). */
export function displayName(node) {
  if (node.type === 'drive') {
    const label = node.label ? prettify83(node.label) + ' ' : '';
    if (node.kind === 'floppy') return `3\u00BD Floppy (${node.letter}:)`;
    return `${label}(${node.letter}:)`;
  }
  let name = node.name;
  if (/^[A-Z0-9_~$!#%&'()@^`{}-]{1,8}(\.[A-Z0-9_~$!#%&'()@^`{}-]{1,3})?$/.test(name)) name = prettify83(name);
  const ext = node.ext;
  if (ext && (ALWAYS_HIDE_EXT.has(ext) || (!config.settings.showExtensions && KNOWN_EXT.has(ext)))) {
    name = name.slice(0, name.length - ext.length - 1);
  }
  return name;
}

function prettify83(s) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

// ---- 8.3 short names --------------------------------------------------------

const VALID_83 = /^[A-Z0-9_~$!#%&'()@^`{}-]{1,8}(\.[A-Z0-9_~$!#%&'()@^`{}-]{1,3})?$/;

export function shortName(node) {
  if (node.type === 'drive') return node.letter + ':';
  const parent = node.parent;
  if (!parent) return node.name.toUpperCase();
  if (!parent._short) parent._short = new Map();
  if (parent._short.has(node)) return parent._short.get(node);
  const upper = node.name.toUpperCase();
  let result;
  if (VALID_83.test(upper)) result = upper;
  else {
    const dot = node.isContainer ? -1 : upper.lastIndexOf('.');
    const base = (dot > 0 ? upper.slice(0, dot) : upper).replace(/[^A-Z0-9_~$!#%&'()@^`{}-]/g, '');
    const ext = dot > 0 ? upper.slice(dot + 1).replace(/[^A-Z0-9_~$!#%&'()@^`{}-]/g, '').slice(0, 3) : '';
    const taken = new Set(parent._short.values());
    let n = 1;
    do {
      const tail = '~' + n;
      result = base.slice(0, 8 - tail.length) + tail + (ext ? '.' + ext : '');
      n++;
    } while (taken.has(result));
  }
  parent._short.set(node, result);
  return result;
}

// ---- Tree -------------------------------------------------------------------

export const fs = {};

const file = (name, props) => new FsNode(name, 'file', props);
const folder = (name, props) => new FsNode(name, 'folder', props);

function parseDate(s) {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0);
}

export function buildFS() {
  const owner = config.owner;
  const computer = new FsNode('My Computer', 'computer');
  const A = new FsNode('A:', 'drive', { letter: 'A', kind: 'floppy', ready: false });
  const C = new FsNode('C:', 'drive', { letter: 'C', kind: 'hdd', ready: true, label: config.settings.driveLabel || '' });
  const D = new FsNode('D:', 'drive', { letter: 'D', kind: 'cdrom', ready: false });

  // C:\My Documents
  const myDocs = folder('My Documents');
  const writeupsDir = folder('Writeups');
  const docs = config.documents.map((d) => file(d.name, { src: d.src, date: parseDate(d.date), onDesktop: d.desktop !== false }));
  const writeups = config.writeups.map((w) =>
    file(w.name, { src: w.src, date: parseDate(w.date), onDesktop: w.desktop !== false, writeup: true }),
  );
  myDocs.add(docs, writeupsDir);
  writeupsDir.add(writeups);

  // C:\WINDOWS
  const windows = folder('WINDOWS');
  const desktop = folder('Desktop');
  const links = config.links.map((l) => new FsNode(l.name + '.url', 'url', { url: l.url, onDesktop: l.desktop !== false, date: new Date() }));
  const msdosLnk = new FsNode('MS-DOS Prompt.lnk', 'link', { app: 'msdos', icon: 'msdos' });
  const mineLnk = new FsNode('Minesweeper.lnk', 'link', { app: 'winmine', icon: 'minesweeper' });
  desktop.add(
    docs.filter((n) => n.onDesktop),
    writeups.filter((n) => n.onDesktop),
    msdosLnk,
    mineLnk,
    links.filter((n) => n.onDesktop),
  );
  const favorites = folder('Favorites');
  favorites.add(links);

  windows.add(
    folder('COMMAND').add(
      file('ATTRIB.EXE', { size: 15252, app: 'dos-only' }),
      file('EDIT.COM', { size: 69886, app: 'dos-only' }),
      file('FORMAT.COM', { size: 40135, app: 'dos-only' }),
      file('MEM.EXE', { size: 32146, app: 'dos-only' }),
    ),
    desktop,
    favorites,
    folder('FONTS'),
    folder('SYSTEM').add(file('USER.EXE', { size: 264016, app: 'dos-only' }), file('GDI.EXE', { size: 311136, app: 'dos-only' })),
    folder('TEMP'),
    file('COMMAND.COM', { size: 92870, app: 'msdos' }),
    file('EXPLORER.EXE', { size: 204288, app: 'explorer' }),
    file('NOTEPAD.EXE', { size: 34304, app: 'notepad' }),
    file('WINMINE.EXE', { size: 24064, app: 'winmine' }),
    file('WIN.INI', {
      content: `[windows]\r\nload=\r\nrun=\r\nNullPort=None\r\n\r\n[Desktop]\r\nWallpaper=(None)\r\nTileWallpaper=0\r\n\r\n[intl]\r\niCountry=1\r\n\r\n[Portfolio]\r\nOwner=${owner.name}\r\nHandle=${owner.handle}\r\n`,
    }),
    file('SYSTEM.INI', {
      content: `[boot]\r\nshell=Explorer.exe\r\nsystem.drv=system.drv\r\n\r\n[386Enh]\r\nmouse=*vmouse, msmouse.vxd\r\n`,
    }),
  );

  const programFiles = folder('Program Files').add(folder('Accessories'), folder('Plus!'));

  const recycle = new FsNode('Recycle Bin', 'recycle', { realName: 'RECYCLED' });
  recycle.add(
    file('passwords.txt', {
      content:
        'Nice try.\r\n\r\nNobody keeps their passwords in a text file on the desktop...\r\n\r\n...right?\r\n\r\n(Use a password manager. And turn on MFA.)\r\n',
      date: new Date(),
      deletedFrom: 'C:\\WINDOWS\\Desktop',
    }),
  );

  C.add(
    myDocs,
    programFiles,
    windows,
    recycle,
    file('AUTOEXEC.BAT', {
      content: `@ECHO OFF\r\nSET BLASTER=A220 I5 D1 T4\r\nPATH C:\\WINDOWS;C:\\WINDOWS\\COMMAND\r\nSET TEMP=C:\\WINDOWS\\TEMP\r\nLH C:\\WINDOWS\\COMMAND\\MSCDEX.EXE /D:MSCD001\r\nREM Portfolio of ${owner.name}\r\n`,
    }),
    file('COMMAND.COM', { size: 92870, app: 'msdos' }),
    file('CONFIG.SYS', {
      content: `DEVICE=C:\\WINDOWS\\HIMEM.SYS\r\nDEVICE=C:\\WINDOWS\\EMM386.EXE NOEMS\r\nDOS=HIGH,UMB\r\nFILES=40\r\nBUFFERS=30\r\nDEVICEHIGH=C:\\WINDOWS\\COMMAND\\CDROM.SYS /D:MSCD001\r\n`,
    }),
  );

  // Control Panel, Printers, Dial-Up Networking (special folders)
  const cpanel = new FsNode('Control Panel', 'cpanel', { icon: 'control-panel' });
  cpanel.add(
    new FsNode('Display', 'applet', { icon: 'display', applet: 'display' }),
    new FsNode('Sounds', 'applet', { icon: 'speaker', applet: 'sounds' }),
    new FsNode('System', 'applet', { icon: 'system', applet: 'system' }),
  );
  const printers = new FsNode('Printers', 'cpanel', { icon: 'printers' });
  printers.add(new FsNode('Add Printer', 'applet', { icon: 'printers', applet: 'add-printer' }));
  const dialup = new FsNode('Dial-Up Networking', 'cpanel', { icon: 'dialup' });
  dialup.add(new FsNode('Make New Connection', 'applet', { icon: 'dialup', applet: 'new-connection' }));

  computer.add(A, C, D, cpanel, printers, dialup);

  Object.assign(fs, { computer, A, C, D, myDocs, writeupsDir, windows, desktop, recycle, cpanel, printers, dialup, docs, writeups, links });
  return fs;
}

// ---- Paths --------------------------------------------------------------------

export function pathOf(node) {
  if (!node) return '';
  if (node.type === 'computer' || node.type === 'cpanel') return node.name;
  if (node.type === 'drive') return node.letter + ':\\';
  const parts = [];
  let n = node;
  while (n && n.type !== 'drive') {
    parts.unshift(n.realName || n.name);
    n = n.parent;
  }
  if (!n) return parts.join('\\');
  return n.letter + ':\\' + parts.join('\\');
}

/** DOS-style path using 8.3 names. */
export function shortPath(node) {
  if (node.type === 'drive') return node.letter + ':\\';
  const parts = [];
  let n = node;
  while (n && n.type !== 'drive') {
    parts.unshift(n.realName || shortName(n));
    n = n.parent;
  }
  return (n ? n.letter : 'C') + ':\\' + parts.join('\\');
}

export function driveOf(node) {
  let n = node;
  while (n && n.type !== 'drive') n = n.parent;
  return n;
}

export function findChild(dir, name) {
  if (!dir?.children) return null;
  const want = name.toLowerCase();
  return (
    dir.children.find((c) => (c.realName || c.name).toLowerCase() === want) ||
    dir.children.find((c) => shortName(c).toLowerCase() === want) ||
    dir.children.find((c) => displayName(c).toLowerCase() === want) ||
    null
  );
}

/** Resolve a DOS/Windows path relative to cwd. Returns null if not found. */
export function resolve(path, cwd = fs.C) {
  if (path == null) return null;
  let p = String(path).trim().replace(/^"|"$/g, '').replace(/\//g, '\\');
  if (!p) return cwd;
  if (/^my computer$/i.test(p)) return fs.computer;
  if (/^control panel$/i.test(p)) return fs.cpanel;
  if (/^recycle bin$/i.test(p)) return fs.recycle;
  if (/^desktop$/i.test(p)) return fs.desktop;
  let node;
  const m = /^([a-z]):(.*)$/i.exec(p);
  if (m) {
    node = fs[m[1].toUpperCase()];
    if (!node) return null;
    p = m[2];
    if (!p.startsWith('\\') && driveOf(cwd) === node) node = cwd;
  } else node = cwd;
  if (p.startsWith('\\')) node = driveOf(node) || fs.C;
  for (const part of p.split('\\')) {
    if (!part || part === '.') continue;
    if (/^\.{2,}$/.test(part)) {
      for (let i = 1; i < part.length; i++) if (node.parent && node.type !== 'drive') node = node.parent;
      continue;
    }
    node = findChild(node, part);
    if (!node) return null;
  }
  return node;
}

// ---- Content ------------------------------------------------------------------

const encoder = new TextEncoder();

export function sizeOf(node) {
  if (node.isContainer) return null;
  if (node.content != null) return encoder.encode(node.content).length;
  return node.size ?? 0;
}

export async function readText(node) {
  if (node.content != null) return node.content;
  if (!node.src) return '';
  const res = await fetch(node.src, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = (await res.text()).replace(/\r?\n/g, '\r\n');
  node.content = text;
  return text;
}

/** Fetch every text document up front so sizes, dir listings and Find work. */
export async function preloadContent() {
  const all = [];
  (function walk(n) {
    if (n.src && n.content == null) all.push(n);
    n.children?.forEach((c) => c.parent === n && walk(c));
  })(fs.computer);
  await Promise.all(all.map((n) => readText(n).catch(() => (n.content = null))));
}

export function walk(node, fn, depth = 0) {
  fn(node, depth);
  node.children?.forEach((c) => c.parent === node && walk(c, fn, depth + 1));
}

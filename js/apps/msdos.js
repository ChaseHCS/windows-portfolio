// MS-DOS Prompt: a small COMMAND.COM over the virtual file system.

import { h, withCommas, sleep } from '../util.js';
import { createWindow, desktopRect } from '../wm.js';
import { config } from '../config.js';
import { fs, resolve, shortName, shortPath, displayName, readText, sizeOf, driveOf, pathOf } from '../fs.js';
import { openNode, launch, runCommand } from '../shell.js';

const BANNER = '\nMicrosoft(R) Windows 95\n   (C)Copyright Microsoft Corp 1981-1995.\n\n';
const FREE = 881_557_504;

class Terminal {
  constructor(root) {
    this.root = root;
    this.screen = h('div', { class: 'dos-screen' });
    this.out = document.createTextNode('');
    this.line = h('span', { class: 'dos-line' });
    this.cursor = h('span', { class: 'dos-cursor' }, '_');
    this.input = h('textarea', {
      class: 'dos-input',
      autocapitalize: 'off',
      autocomplete: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      'aria-label': 'MS-DOS command input',
      rows: '1',
    });
    this.screen.append(this.out, this.line, this.cursor);
    root.append(this.screen, this.input);
    this.history = [];
    this.histIdx = 0;
    this.pending = null;
    this.completer = null;

    root.addEventListener('pointerup', () => {
      if (!getSelection().toString()) this.input.focus({ preventScroll: true });
    });
    this.input.addEventListener('input', () => this.sync());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.cursor.style.visibility = 'hidden';
  }

  focus() {
    this.input.focus({ preventScroll: true });
  }

  print(text = '') {
    this.out.appendData(String(text).replace(/\r\n/g, '\n'));
    if (this.out.length > 120_000) this.out.deleteData(0, this.out.length - 100_000);
    this.scroll();
  }

  println(text = '') {
    this.print(text + '\n');
  }

  clear() {
    this.out.data = '';
  }

  scroll() {
    this.root.scrollTop = this.root.scrollHeight;
  }

  sync() {
    const v = this.input.value.replace(/\n/g, '');
    if (this.pending?.mode === 'key') {
      if (v) {
        this.input.value = '';
        const p = this.pending;
        this.pending = null;
        this.line.textContent = '';
        this.print(v[0] + '\n');
        p.resolve(v[0]);
      }
      return;
    }
    this.line.textContent = (this.pending?.prompt ?? '') + v;
    this.scroll();
  }

  onKey(e) {
    if (!this.pending) {
      if (e.key.length === 1 || e.key === 'Enter') e.preventDefault();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      if (getSelection().toString()) return;
      e.preventDefault();
      this.input.value = '';
      this.finish('^C', true);
      return;
    }
    if (this.pending.mode === 'key') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      this.finish(this.input.value.replace(/\n/g, ''));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.history.length) return;
      this.histIdx = Math.max(0, Math.min(this.history.length, this.histIdx + (e.key === 'ArrowUp' ? -1 : 1)));
      this.input.value = this.history[this.histIdx] ?? '';
      this.sync();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.input.value = '';
      this.sync();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const done = this.completer?.(this.input.value);
      if (done != null) {
        this.input.value = done;
        this.sync();
      }
    }
  }

  finish(value, cancelled = false) {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.input.value = '';
    this.line.textContent = '';
    this.print(p.prompt + value + '\n');
    if (!cancelled && value.trim() && p.history) {
      this.history.push(value);
      if (this.history.length > 50) this.history.shift();
    }
    this.histIdx = this.history.length;
    this.cursor.style.visibility = 'hidden';
    p.resolve(cancelled ? null : value);
  }

  readLine(prompt = '', { history = true } = {}) {
    return new Promise((resolve) => {
      this.pending = { mode: 'line', prompt, resolve, history };
      this.cursor.style.visibility = '';
      this.sync();
    });
  }

  readKey(prompt = '') {
    this.print(prompt);
    return new Promise((resolve) => {
      this.pending = { mode: 'key', prompt: '', resolve };
      this.cursor.style.visibility = '';
    });
  }
}

export function openMsDos({ fullscreen = false, onExit = null } = {}) {
  let root, win = null, overlay = null;
  if (fullscreen) {
    overlay = h('div', { class: 'dos-fullscreen' });
    root = h('div', { class: 'dos-term' });
    overlay.append(root);
    document.body.append(overlay);
  } else {
    const desk = desktopRect();
    win = createWindow({
      title: 'MS-DOS Prompt',
      icon: 'msdos',
      width: Math.min(660, desk.w - 20),
      height: Math.min(430, desk.h - 20),
      minWidth: 200,
      minHeight: 100,
      className: 'msdos',
      onFocus: () => setTimeout(() => term.focus(), 0),
      afterClose: () => (closed = true),
    });
    root = h('div', { class: 'dos-term' });
    win.body.append(root);
  }

  const term = new Terminal(root);
  const env = {
    COMSPEC: 'C:\\WINDOWS\\COMMAND.COM',
    PROMPT: '$p$g',
    PATH: 'C:\\WINDOWS;C:\\WINDOWS\\COMMAND',
    TEMP: 'C:\\WINDOWS\\TEMP',
    TMP: 'C:\\WINDOWS\\TEMP',
    WINBOOTDIR: 'C:\\WINDOWS',
    WINDIR: 'C:\\WINDOWS',
    BLASTER: 'A220 I5 D1 T4',
  };
  let cwd = fullscreen ? fs.C : fs.windows;
  let closed = false;

  term.completer = (value) => {
    const m = /^(.*?)([^\s"]*)$/.exec(value);
    const [, head, frag] = m;
    const slash = frag.lastIndexOf('\\');
    const dirPart = slash >= 0 ? frag.slice(0, slash + 1) : '';
    const base = frag.slice(slash + 1).toLowerCase();
    const dir = dirPart ? resolve(dirPart, cwd) : cwd;
    if (!dir?.children) return null;
    const hit = dir.children.map((c) => shortName(c)).find((n) => n.toLowerCase().startsWith(base));
    return hit ? head + dirPart + hit : null;
  };

  const promptStr = () =>
    env.PROMPT.replace(/\$p/gi, shortPath(cwd))
      .replace(/\$g/gi, '>')
      .replace(/\$l/gi, '<')
      .replace(/\$n/gi, (driveOf(cwd)?.letter || 'C'))
      .replace(/\$d/gi, dosDate(new Date()))
      .replace(/\$t/gi, new Date().toTimeString().slice(0, 8))
      .replace(/\$_/g, '\n')
      .replace(/\$\$/g, '$');

  function close() {
    closed = true;
    if (overlay) {
      overlay.remove();
      onExit?.();
    } else win?.close(true);
  }

  // ---- commands ----

  const cmds = {
    help() {
      term.println(
        [
          'Commands available in this MS-DOS session:',
          '',
          '  CD       Changes the current directory        DIR      Lists files and folders',
          '  CLS      Clears the screen                    TYPE     Displays a text file',
          '  START    Opens a file or program              TREE     Shows the folder structure',
          '  ECHO     Displays a message                   SET      Shows environment variables',
          '  DATE     Shows the date                       TIME     Shows the time',
          '  VER      Shows the Windows version            VOL      Shows the disk label',
          '  MEM      Shows memory usage                   PROMPT   Changes the prompt',
          '  EDIT     Opens a file in Notepad              EXIT     Closes MS-DOS Prompt',
          '',
          'Portfolio shortcuts:  WHOAMI  ABOUT  RESUME  CONTACT  WRITEUPS',
          '',
          'Tip: try TYPE followed by a writeup name (Tab completes file names).',
        ].join('\n'),
      );
    },
    cls: () => term.clear(),
    ver: () => term.println('\nWindows 95. [Version 4.00.950]\n'),
    vol(args) {
      const d = args[0] ? fs[args[0][0]?.toUpperCase()] : driveOf(cwd);
      if (!d) return term.println('Invalid drive specification');
      if (!d.ready) return notReady(d.letter);
      term.println(` Volume in drive ${d.letter} ${d.label ? 'is ' + d.label.toUpperCase() : 'has no label'}\n Volume Serial Number is 1F2E-3D4C\n`);
    },
    echo(args, raw) {
      if (!raw.trim()) term.println('ECHO is on');
      else term.println(raw.replace(/^[.\s]/, ''));
    },
    'echo.': () => term.println(''),
    date: async () => {
      const d = new Date();
      term.println(`Current date is ${d.toLocaleDateString('en-US', { weekday: 'short' })} ${dosDate(d, true)}`);
      await term.readLine('Enter new date (mm-dd-yy): ', { history: false });
    },
    time: async () => {
      const d = new Date();
      term.println(`Current time is ${dosTime(d)}`);
      await term.readLine('Enter new time: ', { history: false });
    },
    set(args, raw) {
      if (!raw.trim()) {
        for (const [k, v] of Object.entries(env)) term.println(`${k}=${v}`);
        return;
      }
      const m = /^([^=]+)=(.*)$/.exec(raw.trim());
      if (!m) return term.println(env[raw.trim().toUpperCase()] ? `${raw.trim().toUpperCase()}=${env[raw.trim().toUpperCase()]}` : 'Environment variable not defined');
      if (m[2]) env[m[1].toUpperCase()] = m[2];
      else delete env[m[1].toUpperCase()];
    },
    path(args, raw) {
      if (raw.trim()) env.PATH = raw.trim().replace(/^=/, '');
      else term.println(`PATH=${env.PATH}`);
    },
    prompt(args, raw) {
      env.PROMPT = raw.trim() || '$p$g';
    },
    rem() {},
    mem() {
      term.println(
        [
          '',
          'Memory Type        Total  =   Used   +   Free',
          '----------------  -------   -------   -------',
          'Conventional         640K       38K      602K',
          'Upper                155K      155K        0K',
          'Reserved             384K      384K        0K',
          'Extended (XMS)    31,589K      ???K   ??,???K',
          '----------------  -------   -------   -------',
          'Total memory      32,768K      ???K   ??,???K',
          '',
          'Largest executable program size       602K (616,256 bytes)',
          'MS-DOS is resident in the high memory area.',
          '',
        ].join('\n'),
      );
    },
    async cd(args) {
      if (!args.length) return term.println(shortPath(cwd));
      const target = args.join(' ');
      if (/^[a-z]:$/i.test(target)) return term.println(shortPath(fs[target[0].toUpperCase()] || cwd));
      const n = resolve(target, cwd);
      if (!n || !n.isContainer) return term.println('Invalid directory');
      const d = driveOf(n);
      if (d && !d.ready) return notReady(d.letter);
      cwd = n;
    },
    async dir(args) {
      const wide = args.some((a) => /^\/w$/i.test(a));
      const target = args.filter((a) => !a.startsWith('/')).join(' ');
      let dir = cwd, pattern = null;
      if (target) {
        const n = resolve(target, cwd);
        if (n?.isContainer) dir = n;
        else if (n) (dir = n.parent), (pattern = n);
        else if (/[*?]/.test(target)) pattern = globRe(target);
        else return term.println('\nFile not found\n');
      }
      const drive = driveOf(dir) || fs.C;
      if (!drive.ready) return notReady(drive.letter);
      term.println(`\n Volume in drive ${drive.letter} ${drive.label ? 'is ' + drive.label.toUpperCase() : 'has no label'}`);
      term.println(` Volume Serial Number is 1F2E-3D4C`);
      term.println(` Directory of ${shortPath(dir)}\n`);
      let entries = dir.children.map((c) => ({ node: c, short: shortName(c), dir: c.isContainer }));
      if (dir.type !== 'drive') entries.unshift({ dot: '.', dir: true, date: dir.date }, { dot: '..', dir: true, date: dir.parent?.date || dir.date });
      if (pattern instanceof RegExp) entries = entries.filter((e) => !e.dot && pattern.test(e.short));
      else if (pattern) entries = entries.filter((e) => e.node === pattern);
      let files = 0, dirs = 0, bytes = 0;
      const wideCells = [];
      for (const e of entries) {
        if (e.dir) dirs++;
        else {
          files++;
          bytes += sizeOf(e.node) || 0;
        }
        if (wide) {
          const nm = e.dot || e.short;
          wideCells.push((e.dir ? `[${nm}]` : nm).padEnd(16));
          continue;
        }
        if (e.dot) {
          term.println(`${e.dot.padEnd(15)}<DIR>        ${dosDate(e.date)}  ${dosTime12(e.date)} ${e.dot}`);
          continue;
        }
        const [base, ext = ''] = e.short.split('.');
        const date = e.node.date || new Date();
        const mid = e.dir ? '   <DIR>      ' : withCommas(sizeOf(e.node) || 0).padStart(14);
        term.println(`${base.padEnd(8)} ${ext.padEnd(3)}${mid}  ${dosDate(date)}  ${dosTime12(date)} ${e.node.realName || e.node.name}`);
      }
      if (wide) for (let i = 0; i < wideCells.length; i += 5) term.println(wideCells.slice(i, i + 5).join(''));
      if (!entries.length) term.println('File not found');
      term.println(`${String(files).padStart(10)} file(s)${withCommas(bytes).padStart(15)} bytes`);
      term.println(`${String(dirs).padStart(10)} dir(s)${withCommas(FREE).padStart(16)} bytes free\n`);
    },
    async type(args) {
      if (!args.length) return term.println('Required parameter missing');
      const n = resolve(args.join(' '), cwd);
      if (!n) return term.println('File not found - ' + args.join(' '));
      if (n.isContainer) return term.println('Access denied');
      if (n.app || n.type === 'link') return term.println(binaryGarbage());
      if (n.type === 'url') return term.println(`[InternetShortcut]\nURL=${n.url}`);
      try {
        term.println((await readText(n)).replace(/\r\n/g, '\n').replace(/\n?$/, '\n'));
      } catch {
        term.println('Error reading file');
      }
    },
    tree(args) {
      const start = args.filter((a) => !a.startsWith('/')).length ? resolve(args.filter((a) => !a.startsWith('/')).join(' '), cwd) : cwd;
      const showFiles = args.some((a) => /^\/f$/i.test(a));
      if (!start?.isContainer) return term.println('Invalid path - ' + args.join(' '));
      term.println(`Directory PATH listing\nVolume Serial Number is 1F2E-3D4C\n${shortPath(start)}`);
      const rec = (dir, prefix) => {
        const kids = dir.children.filter((c) => c.parent === dir && (showFiles || c.isContainer));
        kids.forEach((c, i) => {
          const last = i === kids.length - 1;
          if (c.isContainer) {
            term.println(`${prefix}${last ? '\u2514' : '\u251C'}\u2500\u2500\u2500${c.realName || c.name}`);
            rec(c, prefix + (last ? '    ' : '\u2502   '));
          } else term.println(`${prefix}${last ? '    ' : '\u2502   '}${c.name}`);
        });
      };
      rec(start, '');
      term.println('');
    },
    start(args, raw) {
      const target = raw.trim();
      if (!target) return launch('msdos');
      if (!runCommand(target, cwd)) term.println('Bad command or file name');
    },
    edit(args) {
      const n = args.length ? resolve(args.join(' '), cwd) : null;
      if (args.length && !n) return term.println('File not found');
      launch('notepad', n);
    },
    notepad: (args) => cmds.edit(args),
    winmine: () => launch('winmine'),
    explorer: (args) => openNode(args.length ? resolve(args.join(' '), cwd) || cwd : cwd),
    win() {
      if (fullscreen) return close();
      term.println('You are already running Windows.');
    },
    exit: () => close(),
    command: () => term.print(BANNER),
    attrib(args) {
      const target = args.length ? resolve(args.join(' '), cwd) : cwd;
      const list = target?.isContainer ? target.children.filter((c) => !c.isContainer) : target ? [target] : [];
      for (const n of list) term.println(`  A  R     ${pathOf(n)}`);
    },
    async format(args) {
      const d = (args[0] || '').toUpperCase();
      if (!/^[A-Z]:$/.test(d)) return term.println('Required parameter missing');
      const drv = fs[d[0]];
      if (!drv) return term.println('Invalid drive specification');
      if (!drv.ready) return notReady(drv.letter);
      term.println(`\nWARNING, ALL DATA ON NON-REMOVABLE DISK\nDRIVE ${d} WILL BE LOST!`);
      const k = await term.readKey('Proceed with Format (Y/N)?');
      if (k?.toLowerCase() === 'y') {
        term.print('\nChecking existing disk format.\n');
        await sleep(900);
        term.println('Nice try. This disk is write-protected.\n');
      }
    },
    async deltree(args) {
      if (!args.length) return term.println('Required parameter missing');
      const k = await term.readKey(`Delete directory "${args.join(' ')}" and all its subdirectories? [yn] `);
      if (k?.toLowerCase() === 'y') term.println('Access denied');
    },
    del: () => term.println('Access denied'),
    erase: () => term.println('Access denied'),
    copy: () => term.println('Write protect error writing drive C\nAbort, Retry, Fail?F\n        0 file(s) copied'),
    md: () => term.println('Unable to create directory'),
    mkdir: () => term.println('Unable to create directory'),
    rd: () => term.println('Invalid path, not directory,\nor directory not empty'),
    ren: () => term.println('Access denied'),
    async ping(args) {
      const host = args[0];
      if (!host) return term.println('\nUsage: ping [-t] [-n count] destination-list\n');
      const ip = /^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : host.toLowerCase() === 'localhost' ? '127.0.0.1' : `10.${(host.length * 7) % 255}.${(host.charCodeAt(0) * 3) % 255}.${(host.length * 31) % 255}`;
      term.println(`\nPinging ${host} [${ip}] with 32 bytes of data:\n`);
      for (let i = 0; i < 4 && !closed; i++) {
        await sleep(700);
        term.println(`Reply from ${ip}: bytes=32 time${ip === '127.0.0.1' ? '<10ms' : '=' + (20 + ((i * 13) % 17)) + 'ms'} TTL=${ip === '127.0.0.1' ? 128 : 54}`);
      }
      term.println(`\nPing statistics for ${ip}:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),\n`);
    },
    async nmap(args) {
      const target = args.filter((a) => !a.startsWith('-')).pop() || 'localhost';
      term.println(`Starting Nmap ( https://nmap.org ) at ${dosDate(new Date())} ${dosTime(new Date()).slice(0, 5)}`);
      await sleep(1200);
      term.println(
        [
          `Nmap scan report for ${target}`,
          'Host is up (0.00042s latency).',
          'Not shown: 995 closed tcp ports (reset)',
          'PORT     STATE SERVICE',
          '21/tcp   open  ftp         (anonymous login: no)',
          '80/tcp   open  http        portfolio',
          '139/tcp  open  netbios-ssn (it is 1995 after all)',
          '1337/tcp open  waste',
          '31337/tcp filtered Elite',
          '',
          'Nmap done: 1 IP address (1 host up) scanned in 1.21 seconds',
          '',
        ].join('\n'),
      );
    },
    whoami() {
      const o = config.owner;
      term.println(`${o.handle}\n${o.name}${o.title ? ' - ' + o.title : ''}\n\nType ABOUT, RESUME, CONTACT or WRITEUPS to learn more.\n`);
    },
    about: () => openDoc(0),
    resume: () => openDoc(1),
    contact: () => openDoc(2),
    writeups() {
      term.println(`\n Directory of ${shortPath(fs.writeupsDir)}\n`);
      fs.writeups.forEach((w) => term.println(`  ${shortName(w).padEnd(14)}${displayName(w)}`));
      term.println(`\nUse TYPE <name> to read one here, or START <name> to open it in Notepad.\n`);
      cwd = fs.writeupsDir;
    },
    sudo: () => term.println("Bad command or file name\n(This is MS-DOS. There are no users. You were root all along.)"),
    ssh: () => term.println('Bad command or file name\n(Try again in about 25 years.)'),
    async hack() {
      for (let i = 0; i < 14 && !closed; i++) {
        term.println(Array.from({ length: 8 }, () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0').toUpperCase()).join(' '));
        await sleep(60);
      }
      term.println('\nACCESS DENIED.\n\n(Real hacking is mostly reading. Try the writeups.)\n');
    },
  };
  Object.assign(cmds, {
    chdir: cmds.cd,
    ls: (a) => cmds.dir(['/w', ...a]),
    cat: cmds.type,
    more: cmds.type,
    clear: cmds.cls,
    pwd: () => term.println(shortPath(cwd)),
    cmd: cmds.command,
    quit: cmds.exit,
    logout: cmds.exit,
    ipconfig: () => term.println('Bad command or file name\n(In Windows 95 it was called WINIPCFG.)'),
    winipcfg: () => term.println('\nWindows 95 IP Configuration\n\n   IP Address. . . . . . . . : 192.168.0.95\n   Subnet Mask . . . . . . . : 255.255.255.0\n   Default Gateway . . . . . : 192.168.0.1\n'),
  });

  function openDoc(i) {
    const n = fs.docs[i];
    if (!n) return term.println('File not found');
    term.println(`Opening ${displayName(n)}...`);
    openNode(n);
  }

  function notReady(letter) {
    return (async () => {
      for (;;) {
        term.println(`\nNot ready reading drive ${letter}`);
        const k = (await term.readKey('Abort, Retry, Fail?'))?.toLowerCase();
        if (k !== 'r') break;
      }
      term.println('');
    })();
  }

  async function exec(line) {
    if (line == null) return;
    let raw = line.trim();
    if (!raw) return;
    raw = raw.replace(/%([^%]+)%/g, (_, k) => env[k.toUpperCase()] ?? '');
    // "cd.." and "cd\" without a space
    let m = /^(cd|chdir)([.\\].*)$/i.exec(raw);
    if (m) raw = `${m[1]} ${m[2]}`;
    m = /^echo\.(.*)$/i.exec(raw);
    if (m) return term.println(m[1]);
    if (/^[a-z]:$/i.test(raw)) {
      const d = fs[raw[0].toUpperCase()];
      if (!d) return term.println('Invalid drive specification');
      if (!d.ready) return notReady(d.letter);
      cwd = d;
      return;
    }
    const firstSpace = raw.search(/\s/);
    const head = (firstSpace < 0 ? raw : raw.slice(0, firstSpace)).toLowerCase();
    const rest = firstSpace < 0 ? '' : raw.slice(firstSpace + 1);
    const args = (rest.match(/"[^"]*"|\S+/g) || []).map((a) => a.replace(/^"|"$/g, ''));
    const name = head.replace(/\.(exe|com|bat)$/, '');
    if (Object.hasOwn(cmds, name)) return cmds[name](args, rest);

    // Executables & batch files in cwd or PATH
    const exe = findExecutable(head);
    if (exe) {
      if (exe.ext === 'bat') return runBatch(exe);
      if (exe.app && exe.app !== 'dos-only') return launch(exe.app);
      if (exe.app === 'dos-only') return term.println(`${exe.name}: This program requires a newer version of the portfolio.`);
    }
    term.println('Bad command or file name');
  }

  function findExecutable(name) {
    const dirs = [cwd, ...env.PATH.split(';').map((p) => resolve(p, cwd)).filter(Boolean)];
    for (const d of dirs) {
      for (const ext of /\.\w+$/.test(name) ? [''] : ['.com', '.exe', '.bat']) {
        const n = resolve(name + ext, d);
        if (n && !n.isContainer && ['com', 'exe', 'bat'].includes(n.ext)) return n;
      }
    }
    return null;
  }

  async function runBatch(node) {
    const lines = (await readText(node)).split(/\r?\n/);
    let echo = true;
    for (let l of lines) {
      l = l.trim();
      if (!l) continue;
      const quiet = l.startsWith('@');
      if (quiet) l = l.slice(1);
      if (/^echo\s+off$/i.test(l)) {
        echo = false;
        continue;
      }
      if (echo && !quiet) term.println(promptStr() + l);
      if (/^(lh|loadhigh)\s+.*mscdex/i.test(l)) {
        term.println('MSCDEX Version 2.25\nCopyright (C) Microsoft Corp. 1986-1995. All rights reserved.\n        Drive D: = Driver MSCD001 unit 0');
        continue;
      }
      await exec(l);
    }
  }

  (async () => {
    term.print(fullscreen ? '\n' : BANNER);
    if (fullscreen) term.println('Type WIN or EXIT to return to Windows.\n');
    term.focus();
    while (!closed) {
      const line = await term.readLine(promptStr());
      if (closed) break;
      try {
        await exec(line);
      } catch (err) {
        console.error(err);
        term.println('General failure reading drive C');
      }
      if (!closed && term.out.data && !term.out.data.endsWith('\n\n') && line?.trim() && !/^cls$/i.test(line.trim())) term.println('');
    }
  })();

  return win;
}

function dosDate(d, long = false) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}-${long ? d.getFullYear() : String(d.getFullYear()).slice(-2)}`;
}

function dosTime(d) {
  return `${String(d.getHours()).padStart(2, ' ')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(Math.floor(d.getMilliseconds() / 10)).padStart(2, '0')}`;
}

function dosTime12(d) {
  let hr = d.getHours();
  const ap = hr >= 12 ? 'p' : 'a';
  hr = hr % 12 || 12;
  return `${String(hr).padStart(2)}:${String(d.getMinutes()).padStart(2, '0')}${ap}`;
}

function globRe(pattern) {
  const p = pattern.split('\\').pop().toUpperCase();
  const [b, e] = p.includes('.') ? p.split('.') : [p, '*'];
  const conv = (s) => s.replace(/[.+^${}()|[\]]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${conv(b)}(\\.${conv(e)})?$`, 'i');
}

function binaryGarbage() {
  return 'MZ\u0090\u0000\u0003\u0000\u0000\u0000\u0004\u0000\u0000\u0000\u00FF\u00FF\u0000\u0000\u00B8\u0000\u0000\u0000\u0000\u0000\u0000\u0000@\u0000\u0000\u0000\u0000\u0000\u0000\u0000This program cannot be run in DOS mode.\u0007\u0000\u0000';
}

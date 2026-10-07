// Minesweeper — a recreation of the Windows 95 WINMINE.EXE.
//
// Geometry follows the original exactly: 12px side margins, a 37px LED panel,
// the board at (12, 55) in a 3px sunken frame, 16x16 cells, 13x23 LED digits
// and a 24x24 face button inside a 1px gray outline. All artwork is pixel art
// generated here as SVG (crisp edges) so nothing depends on bitmap assets.

import { createWindow, desktopRect } from '../wm.js';
import { messageBox, aboutBox } from '../dialogs.js';
import { h, storage, store, clamp, accel } from '../util.js';

const LEVELS = {
  beginner: { w: 9, h: 9, mines: 10, label: 'Beginner' },
  intermediate: { w: 16, h: 16, mines: 40, label: 'Intermediate' },
  expert: { w: 30, h: 16, mines: 99, label: 'Expert' },
};
const RANKED = ['beginner', 'intermediate', 'expert'];

const PREFS_KEY = 'minesweeper';
const BEST_KEY = 'minesweeper-best';
const DEFAULT_PREFS = { level: 'beginner', width: 9, height: 9, mines: 10, marks: true, color: true, name: 'Anonymous' };
const defaultBest = () => Object.fromEntries(RANKED.map((l) => [l, { time: 999, name: 'Anonymous' }]));

// Cell states.
const COVERED = 0, FLAG = 1, QUESTION = 2, OPEN = 3, MINE = 4, HIT = 5, WRONG = 6;

const LONG_PRESS_MS = 400;
const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);

/* --------------------------------------------------------------------------
   Pixel art
   -------------------------------------------------------------------------- */

const C = {
  black: '#000000', white: '#ffffff', red: '#ff0000', yellow: '#ffff00',
  n1: '#0000ff', n2: '#008000', n3: '#ff0000', n4: '#000080',
  n5: '#800000', n6: '#008080', n7: '#000000', n8: '#808080',
};

/** Overlay ASCII-art layers ({ rows, pal, x, y }) onto a w×h grid of colors. */
function compose(w, ht, layers) {
  const grid = Array.from({ length: ht }, () => new Array(w).fill(null));
  for (const { rows, pal, x = 0, y = 0 } of layers) {
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const color = pal[row[rx]];
        if (color && grid[y + ry]?.[x + rx] !== undefined) grid[y + ry][x + rx] = color;
      }
    });
  }
  return grid;
}

/** Grid of colors -> SVG markup, one path per color built from horizontal runs. */
function gridSVG(grid, extra = '') {
  const ht = grid.length, w = grid[0].length;
  const paths = new Map();
  grid.forEach((row, y) => {
    for (let x = 0; x < w; ) {
      const c = row[x];
      let end = x + 1;
      while (end < w && row[end] === c) end++;
      if (c) paths.set(c, (paths.get(c) || '') + `M${x} ${y}h${end - x}v1h${x - end}z`);
      x = end;
    }
  });
  const body = [...paths].map(([c, d]) => `<path fill="${c}" d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}" shape-rendering="crispEdges"${extra}>${body}</svg>`;
}

const cssURL = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

// Cell numbers: chunky 2px-stroke digits, 8x10, drawn at (4, 3) of the cell.
const DIGITS = {
  1: ['...##...', '..###...', '.####...', '...##...', '...##...', '...##...', '...##...', '...##...', '.######.', '.######.'],
  2: ['.######.', '########', '##....##', '.....###', '...####.', '.####...', '###.....', '##......', '########', '########'],
  3: ['#######.', '########', '......##', '......##', '..#####.', '..#####.', '......##', '......##', '########', '#######.'],
  4: ['.##..##.', '.##..##.', '##...##.', '##...##.', '########', '########', '.....##.', '.....##.', '.....##.', '.....##.'],
  5: ['########', '########', '##......', '##......', '#######.', '########', '......##', '......##', '########', '#######.'],
  6: ['.######.', '########', '##......', '##......', '#######.', '########', '##....##', '##....##', '########', '.######.'],
  7: ['########', '########', '......##', '.....##.', '....##..', '....##..', '...##...', '...##...', '..##....', '..##....'],
  8: ['.######.', '########', '##....##', '##....##', '.######.', '########', '##....##', '##....##', '########', '.######.'],
};

const MINE_ART = [
  '......#......',
  '......#......',
  '..#.#####.#..',
  '...#######...',
  '..##ww#####..',
  '..##ww#####..',
  '#############',
  '..#########..',
  '..#########..',
  '...#######...',
  '..#.#####.#..',
  '......#......',
  '......#......',
];
const MINE_LAYER = { rows: MINE_ART, pal: { '#': C.black, w: C.white }, x: 2, y: 2 };

const FLAG_ART = [
  '...rr...',
  '.rrrr...',
  'rrrrr...',
  '.rrrr...',
  '...rr...',
  '....#...',
  '....#...',
  '..####..',
  '########',
  '########',
];

const QUESTION_ART = [
  '.####.',
  '##..##',
  '##..##',
  '....##',
  '...##.',
  '..##..',
  '..##..',
  '......',
  '..##..',
  '..##..',
];

function crossLayer() {
  const rows = Array.from({ length: 16 }, () => new Array(16).fill('.'));
  for (let i = 0; i < 10; i++) {
    const y = 3 + i;
    rows[y][3 + i] = rows[y][4 + i] = 'r';
    rows[y][12 - i] = rows[y][13 - i] = 'r';
  }
  return { rows: rows.map((r) => r.join('')), pal: { r: C.red } };
}

function cellArt() {
  const art = {};
  for (let n = 1; n <= 8; n++) art['n' + n] = gridSVG(compose(16, 16, [{ rows: DIGITS[n], pal: { '#': C['n' + n] }, x: 4, y: 3 }]));
  art.mine = gridSVG(compose(16, 16, [MINE_LAYER]));
  art.wrong = gridSVG(compose(16, 16, [MINE_LAYER, crossLayer()]));
  art.flag = gridSVG(compose(16, 16, [{ rows: FLAG_ART, pal: { r: C.red, '#': C.black }, x: 4, y: 3 }]));
  art.question = gridSVG(compose(16, 16, [{ rows: QUESTION_ART, pal: { '#': C.black }, x: 5, y: 3 }]));
  return art;
}

// Face button: a 17x17 yellow disc with features drawn on top.
const FACE_BASE = [
  '......#####......',
  '....##YYYYY##....',
  '...#YYYYYYYYY#...',
  '..#YYYYYYYYYYY#..',
  '.#YYYYYYYYYYYYY#.',
  '.#YYYYYYYYYYYYY#.',
  '#YYYYYYYYYYYYYYY#',
  '#YYYYYYYYYYYYYYY#',
  '#YYYYYYYYYYYYYYY#',
  '#YYYYYYYYYYYYYYY#',
  '#YYYYYYYYYYYYYYY#',
  '.#YYYYYYYYYYYYY#.',
  '.#YYYYYYYYYYYYY#.',
  '..#YYYYYYYYYYY#..',
  '...#YYYYYYYYY#...',
  '....##YYYYY##....',
  '......#####......',
];
const FACE_FEATURES = {
  smile: [
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
    '.....##...##.....',
    '.....##...##.....',
    '.................',
    '.................',
    '.................',
    '....#.......#....',
    '.....#.....#.....',
    '......#####......',
  ],
  ooh: [
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
    '.....##...##.....',
    '.....##...##.....',
    '.................',
    '.................',
    '.................',
    '.......###.......',
    '......#...#......',
    '......#...#......',
    '.......###.......',
  ],
  dead: [
    '.................',
    '.................',
    '.................',
    '.................',
    '....#.#...#.#....',
    '.....#.....#.....',
    '....#.#...#.#....',
    '.................',
    '.................',
    '.................',
    '......#####......',
    '.....#.....#.....',
    '....#.......#....',
  ],
  cool: [
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
    '.###############.',
    '...#####.#####...',
    '....###...###....',
    '.................',
    '.................',
    '....#.......#....',
    '.....#.....#.....',
    '......#####......',
  ],
};

function faceArt() {
  const out = {};
  for (const [name, rows] of Object.entries(FACE_FEATURES)) {
    out[name] = gridSVG(compose(17, 17, [{ rows: FACE_BASE, pal: { '#': C.black, Y: C.yellow } }, { rows, pal: { '#': C.black } }]), ' class="ms-face-img" aria-hidden="true"');
  }
  return out;
}

// Seven-segment LED digit, 13x23. Each segment is a tapered 3px bar.
const SEGMENTS = {
  a: [[2, 1, 9], [3, 2, 7], [4, 3, 5]].map(([x, y, w]) => [x, y, w, 1]),
  d: [[2, 21, 9], [3, 20, 7], [4, 19, 5]].map(([x, y, w]) => [x, y, w, 1]),
  g: [[3, 10, 7], [2, 11, 9], [3, 12, 7]].map(([x, y, w]) => [x, y, w, 1]),
  f: [[1, 2, 9], [2, 3, 7], [3, 4, 5]].map(([x, y, n]) => [x, y, 1, n]),
  b: [[11, 2, 9], [10, 3, 7], [9, 4, 5]].map(([x, y, n]) => [x, y, 1, n]),
  e: [[1, 12, 9], [2, 13, 7], [3, 14, 5]].map(([x, y, n]) => [x, y, 1, n]),
  c: [[11, 12, 9], [10, 13, 7], [9, 14, 5]].map(([x, y, n]) => [x, y, 1, n]),
};
const SEG_ORDER = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const LED_ON = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg',
  6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '',
};

function ledDigit() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ width: 13, height: 23, viewBox: '0 0 13 23', 'shape-rendering': 'crispEdges', class: 'ms-digit', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  svg.innerHTML =
    '<rect width="13" height="23" fill="#000"/>' +
    SEG_ORDER.map((s) => `<path data-seg="${s}" d="${SEGMENTS[s].map(([x, y, w, ht]) => `M${x} ${y}h${w}v${ht}h${-w}z`).join('')}"/>`).join('');
  svg._segs = [...svg.querySelectorAll('path')];
  svg._ch = null;
  return svg;
}

function setDigit(svg, ch) {
  if (svg._ch === ch) return;
  svg._ch = ch;
  const on = LED_ON[ch] ?? '';
  svg._segs.forEach((p, i) => p.classList.toggle('on', on.includes(SEG_ORDER[i])));
}

let ART = null;
let FACES = null;

/* --------------------------------------------------------------------------
   Game
   -------------------------------------------------------------------------- */

export function openMinesweeper() {
  const game = new Minesweeper();
  return game.win;
}

class Minesweeper {
  constructor() {
    this.prefs = { ...DEFAULT_PREFS, ...storage(PREFS_KEY, {}) };
    if (this.prefs.level !== 'custom' && !LEVELS[this.prefs.level]) this.prefs.level = 'beginner';

    const win = createWindow({
      key: 'winmine',
      title: 'Minesweeper',
      icon: 'minesweeper',
      resizable: false,
      maximizable: false,
      className: 'minesweeper',
      menu: this.menuSpec(),
      afterClose: () => this.destroy(),
    });
    this.win = win;
    if (win.minesweeper) return; // already open: createWindow focused it
    win.minesweeper = this;

    ART ||= cellArt();
    FACES ||= faceArt();

    this.press = null; // { chord, cell, touch }
    this.pressed = new Set();
    this.touch = null;
    this.lastTouch = -Infinity;
    this.timer = 0;
    this.cheat = { typed: '', on: false, pixel: null };

    this.build();
    this.newGame();
    this.bind();
  }

  /* ---------- Menus ---------- */

  menuSpec() {
    const lvl = (level) => ({
      label: '&' + LEVELS[level].label,
      checked: () => this.prefs.level === level,
      action: () => this.setLevel(level),
    });
    return [
      {
        label: '&Game',
        items: [
          { label: '&New', shortcut: 'F2', action: () => this.newGame() },
          '-',
          lvl('beginner'),
          lvl('intermediate'),
          lvl('expert'),
          { label: '&Custom...', checked: () => this.prefs.level === 'custom', action: () => this.openCustom() },
          '-',
          { label: '&Marks (?)', checked: () => this.prefs.marks, action: () => this.setPref('marks', !this.prefs.marks) },
          { label: 'Co&lor', checked: () => this.prefs.color, action: () => this.setPref('color', !this.prefs.color) },
          '-',
          { label: 'Best &Times...', action: () => this.openBestTimes() },
          '-',
          { label: 'E&xit', action: () => this.win.close() },
        ],
      },
      {
        label: '&Help',
        items: [
          { label: '&Contents', shortcut: 'F1', action: () => this.openHelp() },
          { label: '&Search for Help on...', disabled: true },
          { label: '&Using Help', disabled: true },
          '-',
          { label: '&About Minesweeper...', action: () => aboutBox({ app: 'Minesweeper', appIcon: 'minesweeper', parent: this.win, extra: 'by Robert Donner and Curt Johnson' }) },
        ],
      },
    ];
  }

  setPref(key, value) {
    this.prefs[key] = value;
    store(PREFS_KEY, this.prefs);
    if (key === 'color') this.game.classList.toggle('mono', !value);
  }

  setLevel(level, custom) {
    this.prefs.level = level;
    if (custom) Object.assign(this.prefs, custom);
    store(PREFS_KEY, this.prefs);
    this.newGame();
  }

  dims() {
    const p = this.prefs;
    if (p.level === 'custom') return { w: p.width, h: p.height, mines: p.mines };
    return LEVELS[p.level];
  }

  /* ---------- DOM ---------- */

  build() {
    const art = Object.entries(ART).map(([k, svg]) => `--ms-${k}:${cssURL(svg)}`).join(';');
    this.mineDigits = [ledDigit(), ledDigit(), ledDigit()];
    this.timeDigits = [ledDigit(), ledDigit(), ledDigit()];
    this.faceEl = h('button', { class: 'ms-face', type: 'button', tabindex: '-1', 'aria-label': 'New game' });
    this.boardEl = h('div', { class: 'ms-board', role: 'grid', 'aria-label': 'Minefield' });
    this.game = h(
      'div',
      { class: 'ms-game' + (this.prefs.color ? '' : ' mono'), style: art },
      h(
        'div',
        { class: 'ms-panel' },
        h('div', { class: 'ms-led', 'aria-label': 'Mines remaining' }, this.mineDigits),
        this.faceEl,
        h('div', { class: 'ms-led', 'aria-label': 'Time' }, this.timeDigits),
      ),
      h('div', { class: 'ms-field' }, this.boardEl),
    );
    this.win.body.append(this.game);
  }

  buildBoard() {
    const { w, h: rows } = this.size;
    this.boardEl.style.gridTemplateColumns = `repeat(${w}, 16px)`;
    const frag = document.createDocumentFragment();
    this.cells = [];
    for (let i = 0; i < w * rows; i++) {
      const el = document.createElement('div');
      el._c = '';
      this.cells.push(el);
      frag.append(el);
    }
    this.boardEl.replaceChildren(frag);
  }

  newGame() {
    this.stopTimer();
    this.endPress();
    const d = this.dims();
    const resized = !this.size || this.size.w !== d.w || this.size.h !== d.h;
    this.size = { w: d.w, h: d.h };
    this.mineCount = d.mines;
    const n = d.w * d.h;
    this.state = new Uint8Array(n);
    this.mines = new Uint8Array(n);
    this.counts = new Uint8Array(n);
    this.started = false;
    this.over = false;
    this.won = false;
    this.opened = 0;
    this.flags = 0;
    this.time = 0;
    this.placeMines();
    if (resized || !this.cells) this.buildBoard();
    for (let i = 0; i < n; i++) this.render(i);
    this.setFace('smile');
    this.updateMineCounter();
    this.updateTime();
    if (resized) this.keepOnScreen();
  }

  keepOnScreen() {
    const win = this.win;
    if (win.closed || win.maximized) return;
    const desk = desktopRect();
    const w = win.el.offsetWidth, ht = win.el.offsetHeight;
    let { x, y } = win;
    if (x + w > desk.w) x = Math.max(0, desk.w - w);
    if (y + ht > desk.h) y = Math.max(0, desk.h - ht);
    if (x !== win.x || y !== win.y) win.moveTo(x, y);
  }

  /* ---------- Board model ---------- */

  placeMines() {
    const n = this.mines.length;
    const order = Array.from({ length: n }, (_, i) => i);
    for (let k = 0; k < this.mineCount; k++) {
      const j = k + Math.floor(Math.random() * (n - k));
      [order[k], order[j]] = [order[j], order[k]];
      this.mines[order[k]] = 1;
    }
    this.computeCounts();
  }

  computeCounts() {
    for (let i = 0; i < this.mines.length; i++) {
      let c = 0;
      for (const j of this.neighbors(i)) c += this.mines[j];
      this.counts[i] = c;
    }
  }

  neighbors(i) {
    const { w, h: rows } = this.size;
    const x = i % w, y = (i / w) | 0;
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if ((dx || dy) && nx >= 0 && nx < w) out.push(ny * w + nx);
      }
    }
    return out;
  }

  /** First click: like the original, a mine under the first click moves to the first free square from the top-left. */
  start(i) {
    this.started = true;
    if (this.mines[i]) {
      const free = this.mines.findIndex((m, j) => !m && j !== i);
      this.mines[i] = 0;
      this.mines[free] = 1;
      this.computeCounts();
    }
    this.startTimer();
  }

  reveal(i) {
    const s = this.state[i];
    if (s === OPEN) return this.chord(i); // convenience: click a satisfied number
    if (s !== COVERED && s !== QUESTION) return;
    if (!this.started) this.start(i);
    if (this.mines[i]) return this.lose([i]);
    this.flood(i);
    this.checkWin();
  }

  flood(i) {
    const stack = [i];
    while (stack.length) {
      const j = stack.pop();
      const s = this.state[j];
      if ((s !== COVERED && s !== QUESTION) || this.mines[j]) continue;
      this.state[j] = OPEN;
      this.opened++;
      this.render(j);
      if (this.counts[j] === 0) for (const k of this.neighbors(j)) if (this.state[k] === COVERED || this.state[k] === QUESTION) stack.push(k);
    }
  }

  /** Reveal all unflagged neighbors when the number of flags matches. */
  chord(i) {
    if (this.state[i] !== OPEN || !this.counts[i]) return;
    const nb = this.neighbors(i);
    if (nb.filter((j) => this.state[j] === FLAG).length !== this.counts[i]) return;
    const hits = [];
    for (const j of nb) {
      const s = this.state[j];
      if (s !== COVERED && s !== QUESTION) continue;
      if (this.mines[j]) hits.push(j);
      else this.flood(j);
    }
    if (hits.length) this.lose(hits);
    else this.checkWin();
  }

  cycleMark(i) {
    const s = this.state[i];
    if (s === COVERED) {
      this.state[i] = FLAG;
      this.flags++;
    } else if (s === FLAG) {
      this.state[i] = this.prefs.marks ? QUESTION : COVERED;
      this.flags--;
    } else if (s === QUESTION) {
      this.state[i] = COVERED;
    } else return;
    this.render(i);
    this.updateMineCounter();
  }

  lose(hits) {
    this.over = true;
    this.stopTimer();
    for (let i = 0; i < this.state.length; i++) {
      if (this.mines[i] && this.state[i] !== FLAG) this.state[i] = MINE;
      else if (!this.mines[i] && this.state[i] === FLAG) this.state[i] = WRONG;
    }
    for (const i of hits) this.state[i] = HIT;
    for (let i = 0; i < this.state.length; i++) this.render(i);
    this.setFace('dead');
  }

  checkWin() {
    if (this.over || this.opened !== this.state.length - this.mineCount) return;
    this.over = this.won = true;
    this.stopTimer();
    for (let i = 0; i < this.state.length; i++) {
      if (this.mines[i] && this.state[i] !== FLAG) {
        this.state[i] = FLAG;
        this.render(i);
      }
    }
    this.flags = this.mineCount;
    this.updateMineCounter();
    this.setFace('cool');
    const level = this.prefs.level;
    if (RANKED.includes(level) && this.time < this.loadBest()[level].time) {
      const time = this.time;
      setTimeout(() => this.promptName(level, time), 0);
    }
  }

  /* ---------- Rendering ---------- */

  cellClass(i) {
    switch (this.state[i]) {
      case COVERED: return this.pressed.has(i) ? 'o' : '';
      case FLAG: return 'f';
      case QUESTION: return this.pressed.has(i) ? 'o q' : 'q';
      case OPEN: return this.counts[i] ? 'o n' + this.counts[i] : 'o';
      case MINE: return 'o m';
      case HIT: return 'o m x';
      case WRONG: return 'o w';
    }
    return '';
  }

  render(i) {
    const el = this.cells[i];
    const c = this.cellClass(i);
    if (el._c !== c) {
      el._c = c;
      el.className = c;
    }
  }

  setFace(name) {
    this.face = name;
    if (!this.facePressed) this.faceEl.innerHTML = FACES[name];
  }

  updateMineCounter() {
    const n = this.mineCount - this.flags;
    const s = n < 0 ? '-' + String(-n % 100).padStart(2, '0') : String(Math.min(n, 999)).padStart(3, '0');
    this.mineDigits.forEach((d, k) => setDigit(d, s[k]));
  }

  updateTime() {
    const s = String(Math.min(this.time, 999)).padStart(3, '0');
    this.timeDigits.forEach((d, k) => setDigit(d, s[k]));
  }

  startTimer() {
    this.time = 1;
    this.updateTime();
    this.timer = setInterval(() => {
      if (this.win.minimized || this.time >= 999) return; // the original pauses while minimized
      this.time++;
      this.updateTime();
    }, 1000);
  }

  stopTimer() {
    clearInterval(this.timer);
    this.timer = 0;
  }

  /* ---------- Input ---------- */

  bind() {
    const board = this.boardEl;
    this.onDocMove = (e) => this.mouseMove(e);
    this.onDocUp = (e) => this.mouseUp(e);

    board.addEventListener('mousedown', (e) => this.mouseDown(e));
    board.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') this.touchDown(e);
    });
    board.addEventListener('pointermove', (e) => {
      if (this.touch && e.pointerId === this.touch.id) this.touchMove(e);
      else if (e.pointerType === 'mouse' && this.cheat.on) this.cheatProbe(e);
    });
    board.addEventListener('pointerup', (e) => this.touchEnd(e, false));
    board.addEventListener('pointercancel', (e) => this.touchEnd(e, true));
    for (const el of [this.game, board]) {
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('dragstart', (e) => e.preventDefault());
    }
    this.game.addEventListener('mousedown', (e) => {
      if (e.target === this.game || e.target.closest('.ms-panel, .ms-field')) e.preventDefault();
    });

    // Face button
    const face = this.faceEl;
    face.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.blocked()) return;
      e.preventDefault();
      this.focusWin();
      face.setPointerCapture?.(e.pointerId);
      this.setFacePressed(true);
      const inside = (ev) => {
        const r = face.getBoundingClientRect();
        return ev.clientX >= r.left && ev.clientX < r.right && ev.clientY >= r.top && ev.clientY < r.bottom;
      };
      const move = (ev) => this.setFacePressed(inside(ev));
      const up = (ev) => {
        face.removeEventListener('pointermove', move);
        face.removeEventListener('pointerup', up);
        face.removeEventListener('pointercancel', up);
        const hit = ev.type === 'pointerup' && inside(ev);
        this.setFacePressed(false);
        if (hit) this.newGame();
      };
      face.addEventListener('pointermove', move);
      face.addEventListener('pointerup', up);
      face.addEventListener('pointercancel', up);
    });

    this.win.el.addEventListener('keydown', (e) => this.keyDown(e));
  }

  setFacePressed(on) {
    if (this.facePressed === on) return;
    this.facePressed = on;
    this.faceEl.classList.toggle('pressed', on);
    this.faceEl.innerHTML = FACES[on ? 'smile' : this.face];
  }

  keyDown(e) {
    if (e.key === 'F2') {
      e.preventDefault();
      this.newGame();
    } else if (e.key === 'F1') {
      e.preventDefault();
      this.openHelp();
    } else if (e.key === 'Enter' && e.shiftKey && this.cheat.typed.endsWith('xyzzy')) {
      this.enableCheat();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      this.cheat.typed = (this.cheat.typed + e.key.toLowerCase()).slice(-5);
    }
  }

  blocked() {
    const m = this.win.modalChild;
    return !!(m && !m.closed);
  }

  focusWin() {
    if (!this.win.el.contains(document.activeElement)) this.win.el.focus({ preventScroll: true });
  }

  cellAt(clientX, clientY) {
    const r = this.boardEl.getBoundingClientRect();
    const { w, h: rows } = this.size;
    const x = Math.floor(((clientX - r.left) / r.width) * w);
    const y = Math.floor(((clientY - r.top) / r.height) * rows);
    return x < 0 || y < 0 || x >= w || y >= rows ? -1 : y * w + x;
  }

  // Mouse: mousedown/mouseup fire for every button, which makes chording
  // (left+right together) straightforward.
  mouseDown(e) {
    if (this.blocked() || performance.now() - this.lastTouch < 800) return; // emulated from touch
    e.preventDefault();
    this.focusWin();
    if (this.over) return;
    let button = e.button;
    if (button === 0 && e.ctrlKey && isMac) button = 2; // Ctrl+click is right-click on a Mac
    const cell = this.cellAt(e.clientX, e.clientY);

    if (button === 2) {
      if (this.press) {
        this.press.chord = true; // right pressed while left is held
        this.updatePressed();
      } else if (cell >= 0) this.cycleMark(cell);
      return;
    }
    if (button !== 0 && button !== 1) return;
    if (this.press) {
      this.press.chord = true;
      this.updatePressed();
      return;
    }
    this.press = { chord: button === 1 || (e.buttons & 2) !== 0 || e.shiftKey, cell };
    this.setFace('ooh');
    this.updatePressed();
    document.addEventListener('mousemove', this.onDocMove, true);
    document.addEventListener('mouseup', this.onDocUp, true);
  }

  mouseMove(e) {
    if (!this.press || this.press.touch) return;
    if (!e.buttons) {
      // Released outside the page: cancel the press.
      this.endPress();
      if (!this.over) this.setFace('smile');
      return;
    }
    const cell = this.cellAt(e.clientX, e.clientY);
    if (cell !== this.press.cell) {
      this.press.cell = cell;
      this.updatePressed();
    }
    if (this.cheat.on) this.cheatProbe(e);
  }

  mouseUp(e) {
    const p = this.press;
    if (!p || p.touch) return;
    this.endPress();
    if (this.over) return;
    this.setFace('smile');
    const cell = this.cellAt(e.clientX, e.clientY);
    if (cell < 0) return;
    if (p.chord) this.chord(cell);
    else this.reveal(cell);
  }

  endPress() {
    this.press = null;
    document.removeEventListener('mousemove', this.onDocMove, true);
    document.removeEventListener('mouseup', this.onDocUp, true);
    this.updatePressed();
  }

  /** Depress the cell under the pointer (or its 3x3 block when chording). */
  updatePressed() {
    const next = new Set();
    const p = this.press;
    if (p && p.cell >= 0 && !this.over) {
      const s = this.state[p.cell];
      const chord = p.chord || (s === OPEN && this.counts[p.cell] > 0);
      for (const j of chord ? [p.cell, ...this.neighbors(p.cell)] : [p.cell]) {
        if (this.state[j] === COVERED || this.state[j] === QUESTION) next.add(j);
      }
    }
    const old = this.pressed;
    this.pressed = next;
    for (const j of old) if (!next.has(j)) this.render(j);
    for (const j of next) if (!old.has(j)) this.render(j);
  }

  // Touch & pen: tap reveals (or chords on a number), long-press flags.
  touchDown(e) {
    e.preventDefault();
    if (this.blocked() || this.over || this.touch) return;
    this.focusWin();
    const cell = this.cellAt(e.clientX, e.clientY);
    try { this.boardEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.touch = { id: e.pointerId, cell, timer: 0, fired: false };
    this.press = { chord: false, cell, touch: true };
    this.setFace('ooh');
    this.updatePressed();
    this.armLongPress();
  }

  armLongPress() {
    const t = this.touch;
    clearTimeout(t.timer);
    t.timer = setTimeout(() => {
      if (this.touch !== t || t.cell < 0 || this.over) return;
      const s = this.state[t.cell];
      if (s === OPEN) return;
      t.fired = true;
      this.press = null;
      this.updatePressed();
      this.setFace('smile');
      this.cycleMark(t.cell);
      navigator.vibrate?.(15);
    }, LONG_PRESS_MS);
  }

  touchMove(e) {
    const t = this.touch;
    if (t.fired) return;
    const cell = this.cellAt(e.clientX, e.clientY);
    if (cell === t.cell) return;
    t.cell = cell;
    this.press.cell = cell;
    this.updatePressed();
    this.armLongPress();
  }

  touchEnd(e, cancelled) {
    const t = this.touch;
    if (!t || e.pointerId !== t.id) return;
    clearTimeout(t.timer);
    this.touch = null;
    this.lastTouch = performance.now();
    const wasPress = this.press;
    this.press = null;
    this.updatePressed();
    if (this.over) return;
    this.setFace('smile');
    if (cancelled || t.fired || !wasPress || t.cell < 0) return;
    this.reveal(t.cell);
  }

  /* ---------- xyzzy ---------- */

  enableCheat() {
    if (this.cheat.on) return;
    this.cheat.on = true;
    this.cheat.pixel = h('div', { class: 'ms-xyzzy', 'aria-hidden': 'true' });
    document.body.append(this.cheat.pixel);
  }

  cheatProbe(e) {
    const cell = this.cellAt(e.clientX, e.clientY);
    this.cheat.pixel.style.background = cell >= 0 && this.mines[cell] ? '#000' : '#fff';
  }

  /* ---------- Dialogs ---------- */

  dialog(title, className, extra = {}) {
    return createWindow({
      title,
      parent: this.win,
      dialog: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      className: 'minesweeper ms-dialog ' + className,
      ...extra,
    });
  }

  centerOver(dlg) {
    const desk = desktopRect();
    const p = this.win;
    const w = dlg.el.offsetWidth, ht = dlg.el.offsetHeight;
    const x = clamp(p.x + (p.el.offsetWidth - w) / 2, 0, Math.max(0, desk.w - w));
    const y = clamp(p.y + (p.el.offsetHeight - ht) / 2, 0, Math.max(0, desk.h - ht));
    dlg.moveTo(x, y);
  }

  /** Alt+<letter> focuses the field whose label has that access key. */
  accessKeys(dlg) {
    dlg.el.addEventListener('keydown', (e) => {
      if (!e.altKey || e.key.length !== 1) return;
      const k = e.key.toLowerCase();
      for (const u of dlg.el.querySelectorAll('u.ak')) {
        if (u.textContent.toLowerCase() !== k) continue;
        const target = u.closest('label')?.control || u.closest('button');
        if (!target) continue;
        e.preventDefault();
        if (target.tagName === 'BUTTON') target.click();
        else (target.focus(), target.select?.());
        return;
      }
    });
  }

  openCustom() {
    const d = this.dims();
    const dlg = this.dialog('Custom Field', 'ms-custom-dlg');
    const field = (id, label, value) => {
      const input = h('input', { type: 'text', class: 'field', id, value: String(value), inputmode: 'numeric', maxlength: '3', autocomplete: 'off' });
      return [h('label', { for: id }, accel(label)), input];
    };
    const uid = 'ms' + Math.random().toString(36).slice(2, 7);
    const [hl, hIn] = field(uid + 'h', '&Height:', d.h);
    const [wl, wIn] = field(uid + 'w', '&Width:', d.w);
    const [ml, mIn] = field(uid + 'm', '&Mines:', d.mines);
    const ok = h('button', { class: 'btn default', type: 'button' }, 'OK');
    const cancel = h('button', { class: 'btn', type: 'button' }, 'Cancel');
    dlg.body.append(
      h('div', { class: 'ms-custom' }, h('div', { class: 'ms-custom-fields' }, hl, hIn, wl, wIn, ml, mIn), h('div', { class: 'ms-custom-buttons' }, ok, cancel)),
    );
    const num = (input, fallback) => {
      const v = parseInt(input.value, 10);
      return Number.isFinite(v) ? v : fallback;
    };
    const accept = () => {
      const height = clamp(num(hIn, 0), 9, 24);
      const width = clamp(num(wIn, 0), 9, 30);
      const mines = clamp(num(mIn, 0), 10, (width - 1) * (height - 1));
      dlg.close(true);
      this.setLevel('custom', { width, height, mines });
    };
    ok.addEventListener('click', accept);
    cancel.addEventListener('click', () => dlg.close(true));
    dlg.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        accept();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        dlg.close(true);
      }
    });
    this.accessKeys(dlg);
    this.centerOver(dlg);
    hIn.focus();
    hIn.select();
    return dlg;
  }

  loadBest() {
    const best = defaultBest();
    const saved = storage(BEST_KEY, {});
    for (const l of RANKED) {
      const s = saved?.[l];
      if (s && Number.isFinite(s.time)) best[l] = { time: clamp(Math.round(s.time), 0, 999), name: String(s.name ?? 'Anonymous').slice(0, 32) };
    }
    return best;
  }

  promptName(level, time) {
    if (this.win.closed) return;
    const dlg = this.dialog('', 'ms-name-dlg', { closable: false });
    const input = h('input', { type: 'text', class: 'field', value: this.prefs.name || 'Anonymous', maxlength: '32', 'aria-label': 'Name', spellcheck: 'false', autocomplete: 'off' });
    const ok = h('button', { class: 'btn default', type: 'button' }, 'OK');
    dlg.body.append(
      h(
        'div',
        { class: 'ms-name' },
        h('div', { class: 'ms-name-text' }, 'You have the fastest time', h('br'), `for ${level} level.`, h('br'), 'Please enter your name.'),
        input,
        ok,
      ),
    );
    const accept = () => {
      const name = input.value.trim() || 'Anonymous';
      const best = this.loadBest();
      best[level] = { time, name };
      store(BEST_KEY, best);
      this.prefs.name = name;
      store(PREFS_KEY, this.prefs);
      dlg.close(true);
      this.openBestTimes();
    };
    ok.addEventListener('click', accept);
    dlg.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        accept();
      }
    });
    this.centerOver(dlg);
    input.focus();
    input.select();
    return dlg;
  }

  openBestTimes() {
    if (this.win.closed) return;
    const dlg = this.dialog('Fastest Mine Sweepers', 'ms-best-dlg');
    const grid = h('div', { class: 'ms-best-grid' });
    const fill = () => {
      const best = this.loadBest();
      grid.replaceChildren(
        ...RANKED.flatMap((l) => [
          h('div', null, LEVELS[l].label + ':'),
          h('div', null, `${best[l].time} seconds`),
          h('div', { class: 'ms-best-name' }, best[l].name),
        ]),
      );
    };
    fill();
    const reset = h('button', { class: 'btn', type: 'button' }, accel('&Reset Scores'));
    const ok = h('button', { class: 'btn default', type: 'button' }, 'OK');
    reset.addEventListener('click', () => {
      store(BEST_KEY, defaultBest());
      fill();
    });
    ok.addEventListener('click', () => dlg.close(true));
    dlg.body.append(h('div', { class: 'ms-best' }, grid, h('div', { class: 'ms-best-buttons' }, reset, ok)));
    dlg.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        dlg.close(true);
      }
    });
    this.accessKeys(dlg);
    this.centerOver(dlg);
    ok.focus();
    return dlg;
  }

  openHelp() {
    if (this.blocked()) return;
    messageBox({
      title: 'Minesweeper Help',
      icon: 'info',
      parent: this.win,
      width: 380,
      text: [
        'The object of Minesweeper is to find all the mines as quickly as possible without uncovering any of them.',
        '',
        'Click a square to uncover it. A number tells you how many mines touch that square.',
        'Right-click a square to flag it as a mine (right-click again for a question mark). On a touch screen, press and hold.',
        'When a number has as many flags around it as it shows, click it with both buttons (or the middle button) to uncover the rest of its neighbors.',
        '',
        'Click the smiley face or press F2 to start a new game.',
      ].join('\n'),
    });
  }

  /* ---------- Teardown ---------- */

  destroy() {
    this.stopTimer();
    if (this.touch?.timer) clearTimeout(this.touch.timer);
    document.removeEventListener('mousemove', this.onDocMove, true);
    document.removeEventListener('mouseup', this.onDocUp, true);
    this.cheat.pixel?.remove();
  }
}

// Entry point: load content, boot, then bring up the shell.

import { loadConfig, config } from './config.js';
import { buildFS, preloadContent } from './fs.js';
import { loadIcons, iconURL } from './icons.js';
import { registerApp } from './shell.js';
import { initDesktop } from './desktop.js';
import { initTaskbar } from './taskbar.js';
import { boot, hideBoot } from './boot.js';
import { play, setSoundEnabled } from './sound.js';
import { openNotepad } from './apps/notepad.js';
import { openFolder } from './apps/explorer.js';
import { openMsDos } from './apps/msdos.js';
import { openMinesweeper } from './apps/minesweeper.js';
import { openRun } from './apps/run.js';
import { openFind } from './apps/find.js';
import { openShutdown } from './apps/shutdown.js';
import { openWelcome } from './apps/welcome.js';
import { openApplet, applyDisplaySettings } from './apps/applets.js';

registerApp('notepad', openNotepad);
registerApp('explorer', openFolder);
registerApp('msdos', () => openMsDos());
registerApp('winmine', openMinesweeper);
registerApp('run', openRun);
registerApp('find', openFind);
registerApp('shutdown', openShutdown);
registerApp('welcome', openWelcome);
registerApp('applet', openApplet);

function shouldFullBoot() {
  let forced = false, seen = false;
  try {
    forced = sessionStorage.getItem('w95:forceBoot') === '1';
    sessionStorage.removeItem('w95:forceBoot');
    seen = sessionStorage.getItem('w95:booted') === '1';
    sessionStorage.setItem('w95:booted', '1');
  } catch {
    /* storage blocked */
  }
  if (new URLSearchParams(location.search).has('boot')) return true;
  const mode = config.settings.bootScreen;
  if (forced) return mode !== 'never';
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  return !seen;
}

async function start() {
  await loadConfig();
  const o = config.owner;
  document.title = `${o.name} - ${o.title || 'Portfolio'}`;
  setSoundEnabled(config.settings.sounds !== false);
  buildFS();

  const loading = Promise.all([loadIcons(), preloadContent()]);
  await boot({ full: shouldFullBoot(), loading });

  const fav = document.querySelector('link[rel="icon"]');
  if (fav) fav.href = iconURL('windows-logo', 16);

  applyDisplaySettings();
  initDesktop();
  initTaskbar();
  hideBoot();
  play('startup');
  setTimeout(() => openWelcome(), 600);

  // Deep links: index.html#open=Resume.txt opens a document directly.
  const m = /open=([^&]+)/.exec(location.hash);
  if (m) {
    const { runCommand } = await import('./shell.js');
    runCommand(decodeURIComponent(m[1]));
  }
}

start().catch((err) => {
  console.error(err);
  const el = document.getElementById('boot');
  el.hidden = false;
  el.className = 'boot bsod';
  el.innerHTML = `<div class="bsod-box"><span class="bsod-title">Windows</span><p>A fatal exception 0E has occurred at 0028:C0011E36 in VXD VMM(01) +
00010E36. The current application will be terminated.</p><p>*  Press any key to terminate the current application.<br>*  Press CTRL+ALT+DEL again to restart your computer. You will<br>&nbsp;&nbsp;&nbsp;lose any unsaved information in all applications.</p><p style="text-align:center">Press any key to continue _</p></div>`;
  document.addEventListener('keydown', () => location.reload(), { once: true });
  document.addEventListener('pointerdown', () => location.reload(), { once: true });
});

# windows-portfolio

A security research portfolio that runs entirely in the browser as a Windows 95
desktop. Writeups are text documents on the desktop that open in Notepad.

It's plain HTML, CSS and JavaScript (ES modules) with no build step, no
framework and no dependencies, so it can be hosted on any static host
(GitHub Pages, Netlify, S3, nginx, ...).

## What's in it

- **Desktop**: icons you can drag (positions are saved), marquee and
  Ctrl-click selection, right-click menus, Arrange Icons, and keyboard
  navigation.
- **Windows**: drag, resize from any edge, minimize/maximize with the Win95
  zoom animation, system menu, modal dialogs, and taskbar buttons.
- **Start menu**: Writeups, Programs, Documents, Settings, Find, Help, Run
  and Shut Down, with cascading submenus.
- **Notepad**: shows each writeup as raw text. It supports Word Wrap, Find /
  Find Next (F3) and Print, and links are clickable.
- **My Computer / Explorer**: one window per folder with Large Icons, Small
  Icons, List and Details views, sorting, Properties sheets and a status
  bar. Drives A: and D: are "not ready", as they should be.
- **MS-DOS Prompt**: `dir`, `cd`, `type`, `tree`, `set`, `ver`, `mem`, Tab
  completion and history over a virtual C:\ drive with real 8.3 short names,
  plus a few extras for security folks (try `whoami`, `nmap`, `sudo`,
  `format c:`).
- **Minesweeper**: all three levels plus Custom, Marks, best times, and
  chording.
- **Find: All Files**: searches file names and the full text of every writeup.
- **Boot and shutdown**: Award BIOS POST, the "Starting Windows 95..." splash,
  the dithered Shut Down dialog, "It's now safe to turn off your computer",
  restart in MS-DOS mode, and the 1995 logon box where Cancel lets you in.
- A Welcome screen with "Did you know..." tips that orient first-time
  visitors.

## Run it locally

ES modules and `fetch()` need a web server; opening `index.html` from disk
won't work.

```sh
python3 -m http.server 8000
# or: npx serve .
```

Then open http://localhost:8000. Add `?boot` to the URL to force the full BIOS
boot sequence.

## Adding a writeup

1. Put a Markdown or plain-text file in `content/writeups/`, e.g.
   `content/writeups/htb-something.md`. It is shown raw in Notepad, so write
   it to read well as plain text (no need to hard-wrap lines; Notepad wraps).
2. Add an entry to `writeups` in `content/manifest.json`:

   ```json
   { "name": "HTB - Something.txt", "src": "content/writeups/htb-something.md", "date": "2026-10-07", "desktop": true }
   ```

   - `name` is the file name shown on the desktop and in Explorer. Keep the
     `.txt` so it gets the text-document icon and opens in Notepad.
   - `date` (YYYY-MM-DD) appears in Details view, `dir`, and Properties.
   - `desktop: false` keeps it out of the desktop but still in
     `C:\My Documents\Writeups`, the Start menu and Find.

The same goes for `documents` (About Me, Resume, Contact) and `links` (internet
shortcuts on the desktop).

## Configuration (`content/manifest.json`)

| Key | Meaning |
| --- | --- |
| `owner.name`, `owner.handle`, `owner.title`, `owner.organization` | Shown in the title, BIOS, About boxes, System Properties, `whoami` |
| `settings.bootScreen` | `"once"` (full BIOS boot on the first visit per browser session), `"always"`, or `"never"` |
| `settings.showExtensions` | Show `.txt` etc. in Explorer (Win95 hides them by default) |
| `settings.sounds` | Enable system sounds |
| `settings.welcomeScreen` | Show the Welcome screen at startup (visitors can also untick it) |
| `settings.driveLabel` | Volume label for C: |
| `settings.wallpapers` | Optional `[{ "name": "Clouds", "src": "assets/wallpapers/clouds.png" }]` for Display Properties |

Deep link straight to a document with `#open=Resume.txt`.

## Original Windows 95 assets

Out of the box the site uses lookalike icons and fonts. To make it 1:1, drop
the original icons, fonts, sounds, cursors and boot screens into `assets/`
using the file names listed in [`assets/README.md`](assets/README.md), then run:

```sh
node scripts/scan-assets.mjs   # updates assets/manifest.json
```

## Deploying to GitHub Pages

Settings → Pages → *Build and deployment* → *Deploy from a branch* → pick the
branch and `/ (root)`. No build step is needed. The site is served at
`https://<user>.github.io/windows-portfolio/`. All paths are relative, so it
works under that subpath or on a custom domain.

- Keep the empty `.nojekyll` file in the repo root. Without it, GitHub Pages
  runs Jekyll, whose default plugins turn `content/**/*.md` into HTML pages,
  and the writeups would fail to load in Notepad.
- GitHub Pages is case-sensitive: `assets/icons/My-Computer.png` is not
  `my-computer.png`.
- On a free GitHub plan, Pages requires the repository to be public. Private
  repositories need GitHub Pro or a paid organization plan, and the published
  site is public either way.

## Layout

```
index.html
css/        win95.css (chrome), apps.css, boot.css, apps/minesweeper.css
js/         main.js (entry), wm.js (windows), menu.js, desktop.js, taskbar.js,
            fs.js (virtual C:\ drive), shell.js (file associations), dialogs.js
js/apps/    notepad, explorer, msdos, minesweeper, run, find, shutdown, welcome, applets
content/    manifest.json, about/resume/contact, writeups/
assets/     drop-in slots for original Win95 icons, fonts, sounds, cursors, boot screens
scripts/    scan-assets.mjs (regenerates assets/manifest.json)
```

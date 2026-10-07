# Original Windows 95 assets

The site ships with built-in lookalike icons, a CSS boot splash and system-font
fallbacks. To use the originals:

1. Drop the files into the folders below **using these exact names**.
2. Run `node scripts/scan-assets.mjs`. It rewrites `assets/manifest.json` with
   the files that are present.
3. Commit both the files and `manifest.json`.

Any slot without a file keeps its lookalike. The manifest exists so visitors'
browsers never request files that aren't there (no 404s in the console). If
you delete `manifest.json`, the site falls back to probing every slot.

These are Microsoft's copyrighted or trademarked assets. You supply them and
host them at your own discretion.

## icons/ (PNG with transparency)

Each slot is `<name>.png` at 32x32. Optionally add `<name>-16.png` at 16x16
for title bars, the taskbar and menus. Without it, the 32px icon is scaled down.

| Slot | Original Win95 icon |
| --- | --- |
| `my-computer` | My Computer |
| `recycle-bin-empty` / `recycle-bin-full` | Recycle Bin (empty / full) |
| `folder` / `folder-open` | Closed / open folder |
| `text-file` | Text document (Notepad document). Used for every writeup. |
| `notepad` | Notepad application |
| `msdos` | MS-DOS Prompt |
| `minesweeper` / `mine` | Minesweeper |
| `drive-floppy` / `drive-hdd` / `drive-cdrom` | 3½ floppy, hard disk, CD-ROM drives |
| `control-panel` / `printers` / `dialup` | Control Panel, Printers, Dial-Up Networking folders |
| `windows-logo` | Windows flag (Start button, About boxes, favicon) |
| `programs` / `documents` / `settings` / `find` / `help` / `run` / `shutdown` | Start menu items |
| `msg-error` / `msg-warning` / `msg-info` / `msg-question` | Message box icons |
| `internet-link` | Internet shortcut (.url) |
| `explorer` | Windows Explorer |
| `file-generic` / `file-exe` / `file-sys` / `file-bat` | Generic file, application, system file, batch file |
| `shortcut-overlay` | The little shortcut arrow (transparent except the arrow, bottom-left) |
| `tip` | Light bulb from the Welcome screen |
| `speaker` | Tray volume icon |
| `system` / `display` / `network` | System, Display, Network Neighborhood |
| `keys` | Logon dialog keys |

## fonts/

| File | Used for |
| --- | --- |
| `ms-sans-serif.woff2` (or `.ttf`) | All UI text, 8pt (11px) |
| `ms-sans-serif-bold.woff2` (or `.ttf`) | Title bars, default buttons |
| `fixedsys.woff2` (or `.ttf`) | Notepad |
| `dos.woff2` (or `.ttf`) | MS-DOS Prompt and BIOS screen |

If your Fixedsys or DOS font is designed for a different pixel size, tune
`--fixed-size` / `--fixed-line` / `--dos-size` / `--dos-line` in
`css/apps.css`.

## sounds/ (WAV)

| File | Plays on |
| --- | --- |
| `startup.wav` | Desktop appears (The Microsoft Sound) |
| `shutdown.wav` | Shut down / restart |
| `logoff.wav` | "Log on as a different user" |
| `ding.wav` | Info / question message boxes, clicking outside a modal dialog |
| `chord.wav` | Error / warning message boxes |
| `tada.wav` | Sounds Properties preview |
| `recycle.wav` | Emptying the Recycle Bin |

Browsers block audio until the visitor has interacted with the page, so the
startup sound is only heard after a click or key press (for example after
skipping the BIOS screen, or after a reboot).

## cursors/

`arrow.cur` (normal pointer) and `busy.cur` (hourglass during boot).
Animated `.ani` cursors aren't supported by browsers.

## boot/ (PNG, any size; stretched to fill the screen like the originals)

| File | Screen |
| --- | --- |
| `splash.png` | Startup logo (LOGO.SYS) |
| `shutting-down.png` | "Please wait while your computer shuts down." (LOGOW.SYS) |
| `safe-to-turn-off.png` | "It's now safe to turn off your computer." (LOGOS.SYS) |

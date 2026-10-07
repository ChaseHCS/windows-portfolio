// Print a plain-text document (Notepad File > Print) via a hidden iframe.

import { escapeHTML } from './util.js';

export function printText(title, text) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(title)}</title>
<style>
  @page { margin: 2cm; }
  body { font: 11pt/1.35 "Courier New", monospace; color: #000; }
  header { text-align: center; margin-bottom: 1em; }
  footer { text-align: center; margin-top: 2em; }
  pre { white-space: pre-wrap; word-wrap: break-word; font: inherit; margin: 0; }
</style></head><body><header>${escapeHTML(title)}</header><pre>${escapeHTML(text.replace(/\r\n/g, '\n'))}</pre></body></html>`);
  doc.close();
  frame.contentWindow.focus();
  setTimeout(() => {
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  }, 50);
}

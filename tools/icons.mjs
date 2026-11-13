#!/usr/bin/env node
/**
 * icons.mjs - write the icon files the site ships, from the instrument's own geometry.
 *
 * The picture is public/app/drawing/icon.js (the Helion's ring: the core's
 * arcs in the Astrolabe colours of the token table). This tool asks the core
 * through the binding in Node, writes the SVG, and has headless Chrome
 * rasterise it for the platforms that want PNGs:
 *
 *   public/icons/icon.svg              favicon (rounded plate)
 *   public/icons/apple-touch-icon.png  180 x 180, full square (iOS rounds it)
 *   public/icons/icon-192.png          the manifest's icons, full square
 *   public/icons/icon-512.png
 *   public/icons/icon-maskable-512.png the ring inside the maskable safe circle
 *
 * The files are kept in the repository (a static host serves them as they
 * are); run `make icons` again only when the picture or the tokens change.
 * test/app.test.js holds icon.svg equal to what icon.js draws now.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load } from '../public/lib/fractonica.js';
import { THEMES } from '../public/app/design/tokens.js';
import { iconSvg } from '../public/app/drawing/icon.js';
import { haveChrome, launchChrome, CHROME } from './chrome.mjs';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const OUT = resolve(WEB, 'public/icons');

/** [file, CSS px, the icon's shape] */
const PNGS = [
  ['apple-touch-icon.png', 180, { rounded: false, weight: 1.1 }],
  ['icon-192.png', 192, { rounded: false, weight: 1.1 }],
  ['icon-512.png', 512, { rounded: false, weight: 0.8 }],
  ['icon-maskable-512.png', 512, { rounded: false, extent: 10, weight: 0.8 }],
];

/** The favicon exactly as the site ships it (also used by the test that holds the file to the drawing). */
export async function faviconSvg() {
  const frc = await load();
  return `${iconSvg(frc, THEMES.astrolabe.color)}\n`;
}

if (import.meta.url === new URL(`file://${resolve(process.argv[1] ?? '')}`).href) {
  const frc = await load();
  const color = THEMES.astrolabe.color;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'icon.svg'), await faviconSvg());
  console.log('icons: wrote public/icons/icon.svg');
  if (!haveChrome()) {
    console.error(`icons: no browser at ${CHROME} (set CHROME=): the PNGs were not written`);
    process.exit(1);
  }
  const chrome = await launchChrome();
  try {
    for (const [file, size, shape] of PNGS) {
      const svg = iconSvg(frc, color, shape);
      const html = `<!doctype html><html data-ready="1"><body style="margin:0"><img alt="" width="${size}" height="${size}" style="display:block" src="data:image/svg+xml,${encodeURIComponent(svg)}"></body></html>`;
      const page = await chrome.open(`data:text/html,${encodeURIComponent(html)}`, { width: size, height: size, scale: 1 });
      await page.screenshot(resolve(OUT, file));
      await page.close();
      console.log(`icons: wrote public/icons/${file} (${size} x ${size})`);
    }
  } finally {
    await chrome.close();
  }
}

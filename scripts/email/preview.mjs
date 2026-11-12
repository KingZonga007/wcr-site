#!/usr/bin/env node
// node scripts/email/preview.mjs <email.md> [--out <dir>] [--screenshot]
// Renders any campaign, sequence step or example to HTML and plain text, with
// images loaded from public/ on disk so new photos show before they're deployed.
// --screenshot also saves desktop and phone PNGs (needs Playwright installed).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadEmailFile } from '../../email/lib/content.mjs';
import { renderEmail } from '../../email/lib/template.mjs';
import { CONFIG } from '../../email/lib/config.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out');
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(os.tmpdir(), 'wcr-email-preview');
const wantShots = args.includes('--screenshot');

async function screenshot(htmlPath, base) {
  let chromium;
  try {
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    console.log('Skipping screenshots: Playwright is not installed (npm i -g playwright).');
    return;
  }
  const browser = await chromium.launch();
  for (const [label, width] of [['desktop', 760], ['phone', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' }).catch(() => {});
    const out = `${base}-${label}.png`;
    await page.screenshot({ path: out, fullPage: true });
    console.log(`Wrote ${out}`);
  }
  await browser.close();
}

async function main() {
  if (!file) {
    console.error('Usage: node scripts/email/preview.mjs <email.md> [--out <dir>] [--screenshot]');
    process.exitCode = 1;
    return;
  }
  const email = loadEmailFile(path.resolve(file));
  const { html, text } = renderEmail({
    campaignId: email.id,
    bodyMarkdown: email.body,
    meta: email.meta,
    unsubscribeUrl: `${CONFIG.siteUrl}/api/unsubscribe?token=PREVIEW`,
    assetBase: pathToFileURL(path.join(REPO, 'public')).href,
  });
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, email.id);
  fs.writeFileSync(`${base}.html`, html);
  fs.writeFileSync(`${base}.txt`, `Subject: ${email.subject}\n\n${text}\n`);
  console.log(`Subject: ${email.subject}`);
  console.log(`Wrote ${base}.html`);
  console.log(`Wrote ${base}.txt`);
  if (wantShots) await screenshot(`${base}.html`, base);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

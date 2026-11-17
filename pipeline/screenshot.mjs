// Headless visual check: serves dist/ with `vite preview`, opens each scene in Chrome
// (software WebGL is fine, just slow) and writes screenshots to .cache/screens.
// Usage: npm run build && npm run verify:screens
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.cache', 'screens');
await mkdir(outDir, { recursive: true });

const port = 4179;
const server = spawn(join(root, 'node_modules', '.bin', 'vite'), ['preview', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});
await new Promise((resolve) => setTimeout(resolve, 2500));

const settle = Number(process.env.SETTLE_MS ?? 25000);
// CHROME_CHANNEL='' uses Playwright's bundled Chromium. ANGLE=gl-egl renders on a GPU in a headless
// Linux VM; the default is SwiftShader software rendering.
const angle = process.env.ANGLE ?? 'swiftshader';
const browser = await chromium.launch({
  channel: (process.env.CHROME_CHANNEL ?? 'chrome') || undefined,
  args: [`--use-angle=${angle}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  // QUALITY=low captures the fallback tier that weak GPUs switch to.
  const quality = process.env.QUALITY ? `&quality=${process.env.QUALITY}` : '';
  for (const name of ['morning', 'forest', 'dusk', 'impact', 'aftermath', 'fossil']) {
    const shot = { name };
    await page.goto(`http://localhost:${port}/?scene=${name}${quality}`);
    await page.waitForFunction(() => !document.querySelector('.loader'), null, { timeout: 180000 });
    await page.waitForTimeout(settle);
    await page.screenshot({ path: join(outDir, `${shot.name}${quality ? '-low' : ''}.png`), timeout: 300000 });
    console.log(`captured ${shot.name}`);
  }
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) console.log(`console messages:\n${[...new Set(errors)].slice(0, 40).join('\n')}`);

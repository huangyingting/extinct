// Real-time frame-rate measurement for each outdoor scene and quality tier.
// Serves dist/ with `vite preview`, opens Chrome with GPU flags, reports the WebGL
// renderer (so a software fallback is obvious) and frame-time statistics.
// Usage: npm run build && npm run measure:fps
//   HEADED=1  run with a visible window (needs a display), useful if headless lacks GPU access
//   SECONDS=  sampling window per scene (default 15)
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 4181;
const seconds = Number(process.env.SECONDS ?? 15);
const server = spawn(join(root, 'node_modules', '.bin', 'vite'), ['preview', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});
await new Promise((resolve) => setTimeout(resolve, 2500));

const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? 'chrome',
  headless: !process.env.HEADED,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vsync-for-tests'],
});

const results = [];
try {
  for (const quality of ['high', 'low']) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`http://localhost:${port}/?quality=${quality}`);
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    for (const [scene, button] of [['morning', null], ['dusk', 'River margin, dusk']]) {
      if (button) await page.getByRole('button', { name: button }).click({ timeout: 180000, force: true });
      await page.waitForFunction(() => !document.querySelector('.loader'), null, { timeout: 180000 });
      await page.waitForTimeout(4000); // let shaders compile and the camera settle
      const stats = await page.evaluate((ms) => new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        const end = last + ms;
        const tick = (now) => {
          times.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else {
            const sorted = [...times].sort((a, b) => a - b);
            const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
            const mean = times.reduce((a, b) => a + b, 0) / times.length;
            resolve({ frames: times.length, avgFps: +(1000 / mean).toFixed(1), p50Ms: +pct(0.5).toFixed(1), p95Ms: +pct(0.95).toFixed(1), worstMs: +sorted.at(-1).toFixed(1) });
          }
        };
        requestAnimationFrame(tick);
      }), seconds * 1000);
      results.push({ quality, scene, renderer, ...stats });
      console.log(JSON.stringify(results.at(-1)));
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

if (results.some((r) => /swiftshader|llvmpipe|software/i.test(r.renderer))) {
  console.log('\nWARNING: software renderer in use; these numbers do not reflect GPU performance.');
}
console.table(results);

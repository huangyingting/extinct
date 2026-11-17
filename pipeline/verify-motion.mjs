// Motion regression check: serves dist/ with `vite preview`, loads the walking scenes and fails if
//  - a planted foot slides (stance-foot speed over the ground: median > 0.05 m/s or p90 > 0.2 m/s),
//  - the Triceratops tail tip drops below 0.3 m (the source walk drags it on the ground),
//  - any scene-graph transform becomes NaN, or the page throws.
// Usage: npm run build && npm run verify:motion   (ANGLE=gl-egl CHROME_CHANNEL= for a headless GPU)
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 4183;
const server = spawn(join(root, 'node_modules', '.bin', 'vite'), ['preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
await new Promise((resolve) => setTimeout(resolve, 2500));

const angle = process.env.ANGLE ?? 'swiftshader';
const browser = await chromium.launch({
  channel: (process.env.CHROME_CHANNEL ?? 'chrome') || undefined,
  args: [`--use-angle=${angle}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const seconds = Number(process.env.SECONDS ?? 12);
const MAX_SLIP = 0.05;
const MAX_SLIP_P90 = 0.2;
const MIN_TAIL = 0.3;
const failures = [];

try {
  for (const scene of ['morning', 'forest', 'dusk']) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${port}/?scene=${scene}&debug`);
    await page.waitForFunction(() => !document.querySelector('.loader') && window.__dinos?.length, null, { timeout: 300000 });
    await page.waitForTimeout(2000);
    const result = await page.evaluate((ms) => new Promise((resolve) => {
      // Planted-foot slip read from the gait system itself: how fast each foot moves over the
      // ground while its leg is in stance (not swinging).
      const dinos = window.__dinos.filter((d) => d.bones.gait);
      const V = dinos[0].mixer._root.position.constructor;
      const { scene } = window.__three;
      const tails = [];
      scene.traverse((o) => {
        if (o.name !== 'Bone011_Armature') return;
        let r = o;
        while (r.parent && r.parent.type !== 'Scene') r = r.parent;
        tails.push({ o, r });
      });
      const slip = new Map();
      const prev = new Map();
      let tailMin = Infinity;
      let nan = 0;
      let last = performance.now();
      const end = last + ms;
      const tick = (now) => {
        const dt = (now - last) / 1000;
        last = now;
        scene.traverse((o) => { if (o.matrixWorld.elements.some((v) => !Number.isFinite(v))) nan++; });
        for (const t of tails) tailMin = Math.min(tailMin, t.o.getWorldPosition(new V()).y - t.r.position.y);
        for (const d of dinos) {
          for (const leg of d.bones.gait.legs) {
            const key = `${d.id}:${leg.spec.contact}`;
            const p = leg.contact.getWorldPosition(new V());
            const q = prev.get(key);
            if (q && q.planted && !leg.swinging && dt > 0 && dt < 0.1) {
              if (!slip.has(d.id)) slip.set(d.id, []);
              slip.get(d.id).push(Math.hypot(p.x - q.p.x, p.z - q.p.z) / dt);
            }
            prev.set(key, { p, planted: !leg.swinging });
          }
        }
        if (now < end) requestAnimationFrame(tick);
        else resolve({
          nan,
          tailMin: tails.length ? +tailMin.toFixed(2) : null,
          animals: [...slip].map(([name, values]) => {
            const sorted = values.sort((x, y) => x - y);
            return { name, samples: sorted.length, slipMedian: +sorted[sorted.length >> 1].toFixed(3), slipP90: +sorted[Math.floor(sorted.length * 0.9)].toFixed(3) };
          }),
        });
      };
      requestAnimationFrame(tick);
    }), seconds * 1000);
    console.log(scene, JSON.stringify(result));
    if (errors.length) failures.push(`${scene}: page errors: ${errors.join(' | ')}`);
    if (result.nan) failures.push(`${scene}: ${result.nan} NaN transforms`);
    if (result.tailMin !== null && result.tailMin < MIN_TAIL) failures.push(`${scene}: Triceratops tail tip down to ${result.tailMin} m`);
    for (const a of result.animals) {
      if (a.samples >= 30 && (a.slipMedian > MAX_SLIP || a.slipP90 > MAX_SLIP_P90)) failures.push(`${scene}: ${a.name} planted-foot slip median ${a.slipMedian}, p90 ${a.slipP90} m/s`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

if (failures.length) {
  console.error(`motion check failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('motion check passed');

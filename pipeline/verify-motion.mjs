// Motion regression check: serves dist/ with `vite preview`, loads the walking scenes and fails if
//  - a planted foot slides (median planted-foot speed while the body walks > 0.15 m/s),
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
const MAX_SLIP = 0.15;
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
      const FEET = ['T-Rex_RLegDigit11_032', 'T-Rex_LLegDigit11_038', 'Bone029_Armature', 'Bone031_Armature', 'Bone028_Armature', 'Bone030_Armature'];
      const TAIL = 'Bone011_Armature';
      const { scene } = window.__three;
      const topOf = (o) => { let r = o; while (r.parent && r.parent.type !== 'Scene') r = r.parent; return r; };
      const feet = [];
      const tails = [];
      scene.traverse((o) => {
        if (FEET.includes(o.name)) feet.push({ o, r: topOf(o) });
        if (o.name === TAIL) tails.push({ o, r: topOf(o) });
      });
      const animals = [...new Set(feet.map((f) => f.r))].map((r) => ({
        r, feet: feet.filter((f) => f.r === r).map((f) => f.o), name: feet.find((f) => f.r === r).o.name.startsWith('T-Rex') ? 'trex' : 'triceratops',
        prev: null, body: null, slip: [],
      }));
      const V = feet[0].o.position.constructor;
      let tailMin = Infinity;
      let nan = 0;
      let last = performance.now();
      const end = last + ms;
      const tick = (now) => {
        const dt = (now - last) / 1000;
        last = now;
        scene.traverse((o) => { if (o.matrixWorld.elements.some((v) => !Number.isFinite(v))) nan++; });
        for (const t of tails) tailMin = Math.min(tailMin, t.o.getWorldPosition(new V()).y - t.r.position.y);
        for (const a of animals) {
          const pos = a.feet.map((f) => f.getWorldPosition(new V()));
          const minY = Math.min(...pos.map((p) => p.y));
          const planted = pos.map((p, i) => (p.y - minY < 0.03 ? i : -1)).filter((i) => i >= 0);
          const body = a.r.position.clone();
          if (a.prev && dt > 0 && dt < 0.1 && Math.hypot(body.x - a.body.x, body.z - a.body.z) / dt > 0.3) {
            for (const i of planted) if (a.prev.planted.includes(i)) a.slip.push(Math.hypot(pos[i].x - a.prev.pos[i].x, pos[i].z - a.prev.pos[i].z) / dt);
          }
          a.prev = { pos, planted };
          a.body = body;
        }
        if (now < end) requestAnimationFrame(tick);
        else resolve({
          nan,
          tailMin: tails.length ? +tailMin.toFixed(2) : null,
          animals: animals.map((a) => {
            const sorted = [...a.slip].sort((x, y) => x - y);
            return { name: a.name, samples: sorted.length, slipMedian: sorted.length ? +sorted[Math.floor(sorted.length / 2)].toFixed(3) : null };
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
      if (a.samples >= 30 && a.slipMedian > MAX_SLIP) failures.push(`${scene}: ${a.name} planted-foot slip ${a.slipMedian} m/s`);
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

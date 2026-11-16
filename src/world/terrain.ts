// Procedural Hell Creek floodplain: gentle relief, a meandering river channel and
// distant uplands. Everything is deterministic so placement, animal paths and the
// rendered terrain agree on the same height function.

// 2D simplex noise (after Stefan Gustavson's public-domain implementation).
const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1],
];
const PERM = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  const random = mulberry32(1905);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export function simplex(x: number, y: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  let n = 0;
  for (const [dx, dy, gi] of [
    [x0, y0, PERM[ii + PERM[jj]]],
    [x1, y1, PERM[ii + i1 + PERM[jj + j1]]],
    [x2, y2, PERM[ii + 1 + PERM[jj + 1]]],
  ]) {
    const tt = 0.5 - dx * dx - dy * dy;
    if (tt > 0) {
      const g = GRAD[gi % 8];
      n += tt ** 4 * (g[0] * dx + g[1] * dy);
    }
  }
  return 70 * n;
}

export function fbm(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * simplex(x * frequency, y * frequency);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return sum;
}

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const WORLD_SIZE = 1600;
export const WATER_LEVEL = -0.7;
const RIVER_HALF_WIDTH = 13;

/** X coordinate of the river centreline at a given Z. */
export function riverX(z: number): number {
  return -38 + 26 * Math.sin(z / 95) + 9 * Math.sin(z / 37 + 1.3);
}

export function riverDistance(x: number, z: number): number {
  return Math.abs(x - riverX(z));
}

export function terrainHeight(x: number, z: number): number {
  const relief = fbm(x / 240, z / 240) * 6 + fbm(x / 55 + 7, z / 55 - 3, 3) * 0.9;
  const d = riverDistance(x, z);
  const halfWidth = RIVER_HALF_WIDTH + 4 * simplex(z / 70, 3.1);
  const bank = smoothstep(halfWidth * 0.55, halfWidth + 26, d);
  const floodplain = 0.4 + Math.max(relief, -1.5) * smoothstep(halfWidth, halfWidth + 120, d);
  let h = -2.1 + (floodplain + 2.1) * bank;
  const r = Math.hypot(x, z);
  h += smoothstep(320, 720, r) * (28 + 34 * fbm(x / 300 - 11, z / 300 + 5, 3));
  return h;
}

/** 0 on dry ground, 1 on wet river-margin mud; used to blend ground textures. */
export function mudMask(x: number, z: number): number {
  const d = riverDistance(x, z);
  return 1 - smoothstep(RIVER_HALF_WIDTH + 2, RIVER_HALF_WIDTH + 16 + 6 * simplex(x / 30, z / 30), d);
}

export interface Placement {
  x: number;
  z: number;
  y: number;
  rotation: number;
  scale: number;
}

interface ScatterOptions {
  seed: number;
  count: number;
  radius: number;
  centre?: [number, number];
  minRiverDistance?: number;
  maxRiverDistance?: number;
  scale: [number, number];
  /** Optional density mask in [0, 1]; candidates are kept with this probability. */
  density?: (x: number, z: number) => number;
  avoid?: (x: number, z: number) => boolean;
  sink?: number;
}

/** Deterministic rejection sampling of instance placements on the terrain. */
export function scatter(options: ScatterOptions): Placement[] {
  const random = mulberry32(options.seed);
  const [cx, cz] = options.centre ?? [0, 0];
  const result: Placement[] = [];
  let attempts = 0;
  while (result.length < options.count && attempts < options.count * 40) {
    attempts++;
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * options.radius;
    const x = cx + Math.cos(angle) * distance;
    const z = cz + Math.sin(angle) * distance;
    const river = riverDistance(x, z);
    if (river < (options.minRiverDistance ?? RIVER_HALF_WIDTH + 3)) continue;
    if (options.maxRiverDistance !== undefined && river > options.maxRiverDistance) continue;
    if (options.density && random() > options.density(x, z)) continue;
    if (options.avoid?.(x, z)) continue;
    const y = terrainHeight(x, z);
    if (y < WATER_LEVEL + 0.25) continue;
    const [lo, hi] = options.scale;
    result.push({
      x,
      z,
      y: y - (options.sink ?? 0),
      rotation: random() * Math.PI * 2,
      scale: lo + (hi - lo) * random(),
    });
  }
  return result;
}

/** Closed loop of XZ points for an animal to walk, following the river at an offset. */
export function riverLoop(zFrom: number, zTo: number, offsetNear: number, offsetFar: number, steps = 14) {
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const z = zFrom + ((zTo - zFrom) * i) / steps;
    points.push([riverX(z) + offsetNear + 2 * Math.sin(i * 1.7), z]);
  }
  for (let i = steps; i >= 0; i--) {
    const z = zFrom + ((zTo - zFrom) * i) / steps;
    points.push([riverX(z) + offsetFar + 3 * Math.sin(i * 1.3 + 2), z]);
  }
  return points;
}

/** Distance from (x, z) to a polyline loop, used to keep trees off the walking paths. */
export function distanceToLoop(points: [number, number][], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[(i + 1) % points.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

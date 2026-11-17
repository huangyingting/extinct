import { BufferAttribute, BufferGeometry, Group, Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { mulberry32 } from '../world/terrain';

/**
 * A low-cost fern clump for dense ground cover: arched frond cards radiating from a crown,
 * textured with a single-frond image (UV u across the frond, v from base to tip).
 * About 36 triangles, against 560 for the full fern model it borrows its material from.
 */
export function fernClump(source: Object3D, fronds = 7, segments = 3, seed = 3): Object3D {
  let material: MeshStandardMaterial | undefined;
  source.traverse((o) => {
    if (!material && (o as Mesh).isMesh) material = (o as Mesh).material as MeshStandardMaterial;
  });
  const random = mulberry32(seed);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  for (let f = 0; f < fronds; f++) {
    const azimuth = (f / fronds) * Math.PI * 2 + random() * 0.6;
    const length = 0.8 + random() * 0.5;
    const width = length * 0.42;
    const rise = 1.0 + random() * 0.35; // initial angle above horizontal (radians)
    const droop = 0.3 + random() * 0.25;
    const dx = Math.cos(azimuth);
    const dz = Math.sin(azimuth);
    // Side vector across the frond, tilted a little so the blade is not edge-on to the sky.
    const sx = -dz;
    const sz = dx;
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const s = i / segments;
      const out = length * s * Math.cos(rise) + length * 0.25 * s * s;
      const up = length * (s * Math.sin(rise) - droop * s * s);
      const half = (width / 2) * (1 - 0.65 * s * s);
      for (const side of [-1, 1]) {
        positions.push(dx * out + sx * half * side, Math.max(0.02, up + 0.04 * side * s), dz * out + sz * half * side);
        // Normals lean up and outwards: foliage lit like a soft dome, not like a thin card.
        normals.push(dx * 0.35, 0.92, dz * 0.35);
        uvs.push(side < 0 ? 0 : 1, 1 - s); // glTF UVs: v = 0 is the top of the image (the frond tip)
        // Darker towards the crown: cheap ambient occlusion inside the clump.
        const shade = 0.45 + 0.55 * Math.min(1, s * 1.6);
        colors.push(shade, shade, shade);
      }
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  const group = new Group();
  const shaded = material?.clone();
  if (shaded) shaded.vertexColors = true;
  group.add(new Mesh(geometry, shaded));
  return group;
}

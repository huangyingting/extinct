// Builds the Poly Haven (CC0) items in pipeline/sources.json that carry a `build` spec, plus every
// Poly Haven texture and HDRI, without Blender. Results are merged into src/data/generated/assets.json,
// so run it after build-assets.mjs when rebuilding everything.
//
// Per model: keep one variant (`pick`), drop unused vertex colours, thin leaf cards (`thinLeaves`),
// simplify the remaining geometry (`simplify`), put the base on y = 0 centred on the trunk,
// scale to `height` metres, then meshopt geometry + WebP textures through gltf-transform.
//
// Usage: node pipeline/build-polyhaven.mjs [id ...]   (no ids = all)
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds, prune, simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache');
const out = join(root, 'public', 'assets');
const generatedPath = join(root, 'src', 'data', 'generated', 'assets.json');
const sources = JSON.parse(await readFile(join(root, 'pipeline', 'sources.json'), 'utf8'));
const gltfTransform = join(root, 'node_modules', '.bin', 'gltf-transform');
const only = new Set(process.argv.slice(2));
const wanted = (item) => only.size === 0 || only.has(item.id);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Leaf canopies are millions of small alpha-tested cards. Simplification collapses cards, so instead
 * keep a random subset of whole cards (connected components) and enlarge each about its centre so
 * the canopy keeps roughly the same silhouette at a fraction of the triangles.
 */
function thinCards(primitive, keep, grow, seed) {
  const position = primitive.getAttribute('POSITION');
  const indices = primitive.getIndices();
  const count = position.getCount();
  const parent = new Int32Array(count).map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const index = indices.getArray();
  for (let t = 0; t < index.length; t += 3) {
    const a = find(index[t]);
    parent[find(index[t + 1])] = a;
    parent[find(index[t + 2])] = a;
  }
  const random = mulberry32(seed);
  const kept = new Map();
  const centres = new Map();
  const p = [0, 0, 0];
  for (let v = 0; v < count; v++) {
    const c = find(v);
    if (!kept.has(c)) kept.set(c, random() < keep);
    if (!kept.get(c)) continue;
    position.getElement(v, p);
    const sum = centres.get(c) ?? [0, 0, 0, 0];
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
    sum[3] += 1;
    centres.set(c, sum);
  }
  for (let v = 0; v < count; v++) {
    const c = find(v);
    if (!kept.get(c)) continue;
    const [sx, sy, sz, n] = centres.get(c);
    position.getElement(v, p);
    position.setElement(v, [sx / n + (p[0] - sx / n) * grow, sy / n + (p[1] - sy / n) * grow, sz / n + (p[2] - sz / n) * grow]);
  }
  const next = [];
  for (let t = 0; t < index.length; t += 3) if (kept.get(find(index[t]))) next.push(index[t], index[t + 1], index[t + 2]);
  indices.setArray(new Uint32Array(next));
}

const triangles = (doc) =>
  doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);

async function buildModel(item, spec, id) {
  const dir = join(cache, 'sources', 'polyhaven', item.id);
  const doc = await io.read(join(dir, `${item.id}.gltf`));
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const before = triangles(doc);

  if (spec.pick) {
    for (const node of scene.listChildren()) if (!node.getName().endsWith(spec.pick)) node.dispose();
  }
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of ['COLOR_0', 'COLOR_1']) primitive.setAttribute(semantic, null);
      const material = primitive.getMaterial();
      // Poly Haven foliage ships as BLEND; alpha-tested cards sort correctly and cast shadows.
      if (material?.getAlphaMode() === 'BLEND') material.setAlphaMode('MASK').setAlphaCutoff(0.5);
    }
  }
  await doc.transform(prune());

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const name = primitive.getMaterial()?.getName() ?? '';
      if (spec.thinLeaves && /leaves/.test(name)) thinCards(primitive, spec.thinLeaves.keep, spec.thinLeaves.grow, 7);
    }
  }
  await doc.transform(prune(), weld());
  if (spec.sloppy) {
    // Topology-ignoring simplification for woody parts made of many small disconnected pieces
    // (twigs, root flares), which the regular simplifier cannot collapse.
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        // `sloppy` maps a material-name fragment to the fraction of triangles to keep.
        const name = primitive.getMaterial()?.getName() ?? '';
        const ratio = Object.entries(spec.sloppy).find(([part]) => name.includes(part))?.[1];
        if (ratio === undefined) continue;
        const indices = primitive.getIndices();
        const positions = primitive.getAttribute('POSITION').getArray();
        const source = new Uint32Array(indices.getArray());
        const target = Math.max(3, Math.floor((source.length * ratio) / 3) * 3);
        const [result] = MeshoptSimplifier.simplifySloppy(source, positions, 3, null, target, 1);
        indices.setArray(new Uint32Array(result));
      }
    }
    await doc.transform(prune());
  }
  if (spec.simplify && spec.simplify < 1) {
    // Thinned leaf cards are left alone: simplifying them collapses whole cards.
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        if (spec.thinLeaves && /leaves/.test(primitive.getMaterial()?.getName() ?? '')) continue;
        simplifyPrimitive(primitive, { simplifier: MeshoptSimplifier, ratio: spec.simplify, error: spec.simplifyError ?? 0.002, lockBorder: false });
      }
    }
    await doc.transform(prune());
  }

  // Normalise: base on y = 0, trunk (bounds centre) at the origin, optional height in metres.
  const children = scene.listChildren();
  const wrapper = doc.createNode('Root');
  for (const child of children) {
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);
  let { min, max } = getBounds(scene);
  const scale = spec.height ? spec.height / (max[1] - min[1]) : 1;
  wrapper.setScale([scale, scale, scale]);
  wrapper.setTranslation([-((min[0] + max[0]) / 2) * scale, -min[1] * scale, -((min[2] + max[2]) / 2) * scale]);
  ({ min, max } = getBounds(scene));

  const intermediate = join(cache, 'build', `${id}.glb`);
  const final = join(out, 'models', `${id}.glb`);
  await io.write(intermediate, doc);
  execFileSync(gltfTransform, [
    'optimize', intermediate, final,
    '--compress', 'meshopt',
    '--texture-compress', 'webp',
    '--texture-size', String(spec.textureSize ?? 1024),
    '--simplify', 'false',
    '--instance', 'false',
    '--palette', 'false',
    '--join', 'false',
    '--flatten', 'false',
  ], { stdio: ['ignore', 'pipe', 'inherit'] });
  return {
    url: `assets/models/${id}.glb`,
    bytes: (await stat(final)).size,
    sourceTriangles: before,
    triangles: triangles(doc),
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((v) => Math.round(v * 100) / 100),
  };
}

await mkdir(join(cache, 'build'), { recursive: true });
for (const dir of ['models', 'hdri', 'textures']) await mkdir(join(out, dir), { recursive: true });
const generated = JSON.parse(await readFile(generatedPath, 'utf8'));

for (const item of sources.polyhaven.items.filter(wanted)) {
  const dir = join(cache, 'sources', 'polyhaven', item.id);
  if (item.type === 'model' && item.build) {
    // `variants` build extra versions (e.g. a lighter `_far` canopy) with overridden settings.
    const { variants = [], ...base } = item.build;
    for (const variant of [{ suffix: '' }, ...variants]) {
      const id = item.id + variant.suffix;
      const model = await buildModel(item, { ...base, ...variant }, id);
      generated.models[id] = model;
      console.log(`model: ${id}: ${model.sourceTriangles} -> ${model.triangles} triangles, ${model.size.join(' x ')} m`);
    }
  } else if (item.type === 'hdri') {
    const name = `${item.id}_${item.res}.hdr`;
    await copyFile(join(dir, name), join(out, 'hdri', name));
    generated.hdri[item.id] = { url: `assets/hdri/${name}`, bytes: (await stat(join(out, 'hdri', name))).size };
  } else if (item.type === 'texture') {
    generated.textures[item.id] = {};
    for (const map of item.maps) {
      const name = `${item.id}_${map}.webp`;
      const image = sharp(join(dir, `${item.id}_${map}_${item.res}.jpg`));
      if (map !== 'diff') image.resize(1024);
      await image.webp({ quality: map === 'diff' ? 85 : 90 }).toFile(join(out, 'textures', name));
      generated.textures[item.id][map] = `assets/textures/${name}`;
    }
  }
}

await writeFile(generatedPath, `${JSON.stringify(generated, null, 2)}\n`);
console.log('merged into src/data/generated/assets.json');

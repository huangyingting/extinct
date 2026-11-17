// Turns the fetched sources (.cache/sources) into web-ready assets in public/assets
// and writes src/data/generated/assets.json, which the app uses for model metadata
// (scale, clips, walk speed) and the credits panel.
//
// Steps per model: Blender (normalise, animate, decimate) -> gltf-transform
// (meshopt geometry, WebP textures). Textures and HDRIs are copied/converted with sharp.
//
// Poly Haven models with a `build` spec in sources.json are built without Blender by
// build-polyhaven.mjs, which `npm run assets:build` runs afterwards (this script rewrites assets.json).
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache');
const sources = JSON.parse(await readFile(join(root, 'pipeline', 'sources.json'), 'utf8'));
const out = join(root, 'public', 'assets');
const blender = process.env.BLENDER ?? 'blender';
const gltfTransform = join(root, 'node_modules', '.bin', 'gltf-transform');

const objaverse = (id) => join(cache, 'sources', 'objaverse', `${id}.glb`);
const polyhaven = (id) => join(cache, 'sources', 'polyhaven', id, `${id}.gltf`);

// job: Blender job name (see pipeline/blender/build_asset.py); size: max texture size.
const only = new Set(process.argv.slice(2));
const models = [
  { id: 'trex', job: 'trex', source: objaverse('trex'), size: 2048 },
  { id: 'triceratops', job: 'triceratops', source: objaverse('triceratops'), size: 2048 },
  { id: 'fossil-mount', job: 'fossil', source: objaverse('fossil-mount'), size: 2048 },
  // Non-dinosaur reptiles (pipeline/blender/build_creature.py).
  { id: 'azhdarchid', job: 'creature:azhdarchid', source: objaverse('azhdarchid'), size: 1024 },
  { id: 'mosasaur', job: 'creature:mosasaur', source: objaverse('mosasaur'), size: 1024 },
  { id: 'champsosaurus', job: 'creature:champsosaurus', source: objaverse('champsosaurus'), size: 1024 },
  { id: 'alligator', job: 'creature:alligator', source: objaverse('alligator'), size: 1024 },
  { id: 'bald-cypress', job: 'prop', source: objaverse('bald-cypress'), size: 1024 },
  { id: 'fern-treeit', job: 'prop', source: objaverse('fern-treeit'), size: 1024 },
  { id: 'fern_02', job: 'prop', source: polyhaven('fern_02'), size: 1024 },
  { id: 'dead_tree_trunk', job: 'prop:0.08', source: polyhaven('dead_tree_trunk'), size: 1024 },
  { id: 'tree_stump_01', job: 'prop:0.1', source: polyhaven('tree_stump_01'), size: 1024 },
];

const run = (command, args) => execFileSync(command, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const bytes = async (path) => (await stat(path)).size;

await mkdir(join(cache, 'build'), { recursive: true });
for (const dir of ['models', 'hdri', 'textures']) await mkdir(join(out, dir), { recursive: true });

const generatedPath = join(root, 'src', 'data', 'generated', 'assets.json');
const generated = only.size ? JSON.parse(await readFile(generatedPath, 'utf8')) : { models: {}, textures: {}, hdri: {} };

// Optional ids on the command line rebuild only those models (merged into the existing assets.json).
for (const model of models.filter((m) => only.size === 0 || only.has(m.id))) {
  const intermediate = join(cache, 'build', `${model.id}.glb`);
  const reportPath = join(cache, 'build', `${model.id}.json`);
  const final = join(out, 'models', `${model.id}.glb`);
  console.log(`blender: ${model.id}`);
  const [script, job] = model.job.startsWith('creature:') ? ['build_creature.py', model.job.slice(9)] : ['build_asset.py', model.job];
  run(blender, ['-b', '--python', join(root, 'pipeline', 'blender', script), '--', job, model.source, intermediate, reportPath]);
  console.log(`gltf-transform: ${model.id}`);
  run(gltfTransform, [
    'optimize', intermediate, final,
    '--compress', 'meshopt',
    '--texture-compress', 'webp',
    '--texture-size', String(model.size),
    '--simplify', 'false',
    '--instance', 'false',
    '--palette', 'false',
  ]);
  generated.models[model.id] = {
    url: `assets/models/${model.id}.glb`,
    bytes: await bytes(final),
    ...JSON.parse(await readFile(reportPath, 'utf8')),
  };
}

for (const item of only.size ? [] : sources.polyhaven.items) {
  const dir = join(cache, 'sources', 'polyhaven', item.id);
  if (item.type === 'hdri') {
    const name = `${item.id}_${item.res}.hdr`;
    await copyFile(join(dir, name), join(out, 'hdri', name));
    generated.hdri[item.id] = { url: `assets/hdri/${name}`, bytes: await bytes(join(out, 'hdri', name)) };
  } else if (item.type === 'texture') {
    generated.textures[item.id] = {};
    for (const map of item.maps) {
      const name = `${item.id}_${map}.webp`;
      const target = join(out, 'textures', name);
      // Colour keeps 2k detail; normal and AO/roughness/metal maps tile fine at 1k.
      const image = sharp(join(dir, `${item.id}_${map}_${item.res}.jpg`));
      if (map !== 'diff') image.resize(1024);
      await image.webp({ quality: map === 'diff' ? 85 : 90 }).toFile(target);
      generated.textures[item.id][map] = `assets/textures/${name}`;
    }
  }
}

await mkdir(join(root, 'src', 'data', 'generated'), { recursive: true });
await writeFile(generatedPath, `${JSON.stringify(generated, null, 2)}\n`);
console.log('assets written to public/assets and src/data/generated/assets.json');

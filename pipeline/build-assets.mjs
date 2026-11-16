// Turns the fetched sources (.cache/sources) into web-ready assets in public/assets
// and writes src/data/generated/assets.json, which the app uses for model metadata
// (scale, clips, walk speed) and the credits panel.
//
// Steps per model: Blender (normalise, animate, decimate) -> gltf-transform
// (meshopt geometry, WebP textures). Textures and HDRIs are copied/converted with sharp.
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
const models = [
  { id: 'trex', job: 'trex', source: objaverse('trex'), size: 2048 },
  { id: 'triceratops', job: 'triceratops', source: objaverse('triceratops'), size: 2048 },
  { id: 'fossil-mount', job: 'fossil', source: objaverse('fossil-mount'), size: 2048 },
  { id: 'bald-cypress', job: 'prop', source: objaverse('bald-cypress'), size: 1024 },
  { id: 'fern-treeit', job: 'prop', source: objaverse('fern-treeit'), size: 1024 },
  { id: 'fern_02', job: 'prop', source: polyhaven('fern_02'), size: 1024 },
  { id: 'rock_07', job: 'prop:0.15', source: polyhaven('rock_07'), size: 1024 },
  { id: 'boulder_01', job: 'prop:0.05', source: polyhaven('boulder_01'), size: 1024 },
  { id: 'dead_tree_trunk', job: 'prop:0.08', source: polyhaven('dead_tree_trunk'), size: 1024 },
  { id: 'tree_stump_01', job: 'prop:0.1', source: polyhaven('tree_stump_01'), size: 1024 },
];

const run = (command, args) => execFileSync(command, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const bytes = async (path) => (await stat(path)).size;

await mkdir(join(cache, 'build'), { recursive: true });
for (const dir of ['models', 'hdri', 'textures']) await mkdir(join(out, dir), { recursive: true });

const generated = { models: {}, textures: {}, hdri: {} };

for (const model of models) {
  const intermediate = join(cache, 'build', `${model.id}.glb`);
  const reportPath = join(cache, 'build', `${model.id}.json`);
  const final = join(out, 'models', `${model.id}.glb`);
  console.log(`blender: ${model.id}`);
  run(blender, ['-b', '--python', join(root, 'pipeline', 'blender', 'build_asset.py'), '--', model.job, model.source, intermediate, reportPath]);
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

for (const item of sources.polyhaven.items) {
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
await writeFile(join(root, 'src', 'data', 'generated', 'assets.json'), `${JSON.stringify(generated, null, 2)}\n`);
console.log('assets written to public/assets and src/data/generated/assets.json');

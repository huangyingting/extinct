// Downloads every third-party source listed in pipeline/sources.json into
// .cache/sources. Objaverse files are verified against the recorded sha256;
// Poly Haven files are verified against the md5 published by its API.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache', 'sources');
const sources = JSON.parse(await readFile(join(root, 'pipeline', 'sources.json'), 'utf8'));
// Optional ids on the command line restrict the download, e.g. `npm run assets:fetch -- jacaranda_tree`.
const only = new Set(process.argv.slice(2));
const wanted = (item) => only.size === 0 || only.has(item.id);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function digest(algorithm, buffer) {
  return createHash(algorithm).update(buffer).digest('hex');
}

async function download(url, dest, check) {
  if (await exists(dest)) {
    const buffer = await readFile(dest);
    if (!check || digest(check.algorithm, buffer) === check.value) return;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (check && digest(check.algorithm, buffer) !== check.value) {
    throw new Error(`${check.algorithm} mismatch for ${url}`);
  }
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buffer);
  console.log(`fetched ${url}`);
}

for (const item of sources.objaverse.items.filter(wanted)) {
  await download(
    sources.objaverse.baseUrl + item.path,
    join(cache, 'objaverse', `${item.id}.glb`),
    { algorithm: 'sha256', value: item.sha256 },
  );
}

for (const item of sources.polyhaven.items.filter(wanted)) {
  const response = await fetch(`https://api.polyhaven.com/files/${item.id}`);
  if (!response.ok) throw new Error(`Poly Haven files lookup failed for ${item.id}`);
  const files = await response.json();
  const dir = join(cache, 'polyhaven', item.id);

  if (item.type === 'hdri') {
    const file = files.hdri[item.res].hdr;
    await download(file.url, join(dir, `${item.id}_${item.res}.hdr`), { algorithm: 'md5', value: file.md5 });
  } else if (item.type === 'texture') {
    const keys = { diff: 'Diffuse', nor_gl: 'nor_gl', arm: 'arm' };
    for (const map of item.maps) {
      const file = files[keys[map]][item.res].jpg;
      await download(file.url, join(dir, `${item.id}_${map}_${item.res}.jpg`), { algorithm: 'md5', value: file.md5 });
    }
  } else if (item.type === 'model') {
    const gltf = files.gltf[item.res].gltf;
    await download(gltf.url, join(dir, `${item.id}.gltf`), { algorithm: 'md5', value: gltf.md5 });
    for (const [relative, file] of Object.entries(gltf.include)) {
      await download(file.url, join(dir, relative), { algorithm: 'md5', value: file.md5 });
    }
  }
}

console.log(`sources ready in ${cache}`);

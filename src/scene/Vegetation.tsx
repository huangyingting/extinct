import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Color, DoubleSide, type MeshStandardMaterial, type Object3D } from 'three';
import assets from '../data/generated/assets.json';
import type { Habitat, OutdoorScene } from '../data/scenes';
import { fernClump } from '../three/fernClump';
import { buildImpostors } from '../three/impostor';
import { buildInstances, cullChunks, windUniforms, type InstanceOptions } from '../three/instancing';
import { useApp } from '../state';
import { distanceToLoop, fbm, FOREST_CENTRE, riverDistance, scatter, type Placement } from '../world/terrain';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const m = assets.models;

const foliage = (material: MeshStandardMaterial) => {
  material.side = DoubleSide;
  material.alphaTest = Math.max(material.alphaTest, 0.45);
  material.transparent = false;
  material.roughness = Math.max(material.roughness, 0.78);
  material.envMapIntensity = 0.75;
};
const bark = (material: MeshStandardMaterial) => {
  material.roughness = Math.max(material.roughness, 0.85);
  material.envMapIntensity = 0.6;
};

/**
 * The bald-cypress source carries Spanish moss (a bromeliad, which evolved long after the
 * Cretaceous), so that mesh is always dropped. `leafless` keeps only the woody parts for the
 * dead trees after the impact.
 */
const cypress = (leafless: boolean) => (name: string) => !/mousse/i.test(name) && (!leafless || /bark/i.test(name));
const broadleaf = (leafless: boolean) => (name: string) => !leafless || !/leaves/i.test(name);

const TREE: InstanceOptions = { castShadow: true, wind: 0.00035, tweak: foliage, tint: 0.14 };
const FAR_TREE: InstanceOptions = { ...TREE, castShadow: false };
const DEAD_TREE: InstanceOptions = { castShadow: true, tweak: bark, tint: 0.1 };
const FERN: InstanceOptions = { castShadow: false, wind: 0.07, tweak: foliage, tint: 0.22, cullDistance: 110 };
const BIG_FERN: InstanceOptions = { ...FERN, cullDistance: 55 };
const SHRUB: InstanceOptions = { castShadow: false, wind: 0.05, tweak: foliage, tint: 0.2, cullDistance: 75 };
const SOLID: InstanceOptions = { castShadow: true, tweak: bark, tint: 0.12 };

const CLUMPS = [5, 6, 8].map((fronds, i) => (scene: Object3D) => fernClump(scene, fronds, 3, 11 + i * 17));

interface Layer {
  key: string;
  url: string;
  placements: Placement[];
  options: InstanceOptions;
  /** Build the instanced object from the loaded model instead of using it directly. */
  make?: (scene: Object3D) => Object3D;
  /** Draw as camera-facing billboards rendered from the model (distant trees only). */
  impostor?: boolean;
}

/**
 * Hell Creek stand-ins, scattered per habitat. Bald cypress stands in for the taxodiaceous conifers,
 * jacaranda and sapling models for the angiosperm (broadleaf) trees that dominated the fossil leaf
 * flora, ferns and shrubs for the ground layer. There is deliberately no grass, and no boulders:
 * the floodplain was built of river sand and mud.
 */
function layersFor(habitat: Habitat, paths: [number, number][][], low: boolean): Layer[] {
  const nearPath = (x: number, z: number, clearance: number) => paths.some((path) => distanceToLoop(path, x, z) < clearance);
  const grove = (x: number, z: number) =>
    clamp01(0.15 + fbm(x / 140 + 4, z / 140 - 2, 3) * 1.8 + (riverDistance(x, z) < 50 ? 0.35 : 0));
  // Broadleaf groves prefer the better-drained ground away from the channel.
  const broadleafGrove = (x: number, z: number) =>
    clamp01(0.1 + fbm(x / 110 - 9, z / 110 + 6, 3) * 2 + (riverDistance(x, z) > 45 ? 0.25 : -0.3));
  const fernPatch = (x: number, z: number) => clamp01(0.8 + fbm(x / 26 - 8, z / 26 + 1, 3) * 1.6);
  const shrubPatch = (x: number, z: number) => clamp01(0.3 + fbm(x / 34 + 3, z / 34 + 9, 3) * 2.2);
  const forest = (x: number, z: number) => {
    const d = Math.hypot(x - FOREST_CENTRE[0], z - FOREST_CENTRE[1]);
    return clamp01(1.25 - d / 150) * clamp01(0.75 + fbm(x / 60, z / 60, 2));
  };
  const centre = habitat === 'forest' ? FOREST_CENTRE : ([0, 0] as [number, number]);
  const dead = habitat === 'aftermath';
  const thin = <T,>(list: T[], keep: number) => (low ? list.filter((_, i) => i % keep === 0) : list);
  const layers: Layer[] = [];
  const add = (key: string, url: string, placements: Placement[], options: InstanceOptions, make?: Layer['make'], impostor = false) =>
    layers.push({ key, url, placements, options, make, impostor });

  // Trees. Near trees cast shadows; distant ones use a lighter broadleaf model.
  const treeAvoid = (x: number, z: number) => nearPath(x, z, 11);
  if (habitat === 'forest') {
    add('cypress', m['bald-cypress'].url, scatter({
      seed: 51, count: 120, radius: 170, centre, scale: [0.55, 1.05], density: forest, avoid: treeAvoid, minRiverDistance: 20,
    }), { ...TREE, include: cypress(false) });
    const broad = scatter({
      seed: 52, count: 100, radius: 170, centre, scale: [0.6, 1.0], density: forest, avoid: treeAvoid, minRiverDistance: 30,
    });
    const near = (p: Placement) => Math.hypot(p.x - centre[0], p.z - centre[1]) < 50;
    const mid = (p: Placement) => !near(p) && Math.hypot(p.x - centre[0], p.z - centre[1]) < 100;
    add('broadleaf', m.jacaranda_tree.url, thin(broad.filter(near), 2), TREE);
    add('broadleaf-far', m.jacaranda_tree_far.url, broad.filter(mid), FAR_TREE);
    add('broadleaf-forest-edge', m.jacaranda_tree_far.url, broad.filter((p) => !near(p) && !mid(p)), FAR_TREE, undefined, true);
  } else {
    add('cypress', m['bald-cypress'].url, scatter({
      seed: 11, count: 120, radius: 230, scale: [0.55, 1.05], density: grove, avoid: treeAvoid, minRiverDistance: 17,
    }), dead ? { ...DEAD_TREE, include: cypress(true) } : { ...TREE, include: cypress(false) });
    const broad = scatter({
      seed: 13, count: 40, radius: 220, scale: [0.6, 1.0], density: broadleafGrove, avoid: (x, z) => nearPath(x, z, 14), minRiverDistance: 30,
    });
    const near = (p: Placement) => Math.hypot(p.x, p.z) < 90;
    if (dead) {
      add('broadleaf', m.jacaranda_tree_far.url, broad, { ...DEAD_TREE, include: broadleaf(true) });
    } else {
      add('broadleaf', m.jacaranda_tree.url, thin(broad.filter(near), 2), TREE);
      add('broadleaf-far', m.jacaranda_tree_far.url, broad.filter((p) => !near(p)), FAR_TREE);
    }
  }
  // Horizon trees are billboard impostors (two triangles each), so both quality tiers keep them,
  // and there can be more of them.
  const farCypress = scatter({
    seed: 12, count: 260, radius: 680, scale: [0.6, 1.15],
    density: (x, z) => (Math.hypot(x, z) < 230 ? 0 : clamp01(0.3 + grove(x, z))),
  });
  add('cypress-far', m['bald-cypress'].url, farCypress, dead ? { ...DEAD_TREE, include: cypress(true) } : { ...FAR_TREE, include: cypress(false) }, undefined, true);
  add('broadleaf-horizon', m.jacaranda_tree_far.url, scatter({
    seed: 14, count: 160, radius: 650, scale: [0.6, 1.1],
    density: (x, z) => (Math.hypot(x, z) < 220 ? 0 : broadleafGrove(x, z)),
  }), dead ? { ...DEAD_TREE, include: broadleaf(true) } : FAR_TREE, undefined, true);

  // Ground layer. After the impact ferns take over the open ground (the "fern spike").
  // Full fern models add close-up detail over the cheap carpet below.
  add('ferns', m['fern-treeit'].url, thin(scatter({
    seed: 21, count: dead ? 1500 : 1000, radius: 110, centre, scale: dead ? [0.7, 1.5] : [0.6, 1.35],
    density: dead ? (x, z) => clamp01(0.55 + fernPatch(x, z) * 0.5) : fernPatch, sink: 0.05,
  }), 2), { ...FERN, cullDistance: 70 });
  // Dense, cheap fern carpet near the action: procedural clumps using the fern frond texture.
  const carpet = thin(scatter({
    seed: 26, count: dead ? 30000 : habitat === 'forest' ? 16000 : 24000, radius: 130, centre, scale: [0.8, 1.6],
    density: dead ? (x, z) => clamp01(0.75 + fernPatch(x, z) * 0.4) : (x, z) => clamp01(fernPatch(x, z) * 1.2),
    sink: 0.03,
  }), 2);
  // Three clump shapes so neighbours differ.
  for (const variant of [0, 1, 2]) {
    add(`fern-carpet-${variant}`, m['fern-treeit'].url, carpet.filter((_, i) => i % 3 === variant), { ...FERN, cullDistance: 85, tint: 0.32 }, CLUMPS[variant]);
  }
  add('broad-ferns', m.fern_02.url, thin(scatter({
    seed: 22, count: dead ? 180 : 100, radius: 100, centre, scale: [1.1, 1.9],
    density: fernPatch, avoid: (x, z) => nearPath(x, z, 3), sink: 0.05,
  }), 2), BIG_FERN);
  if (!dead) {
    add('shrubs', m.shrub_02.url, thin(scatter({
      seed: 23, count: habitat === 'forest' ? 260 : 200, radius: 140, centre, scale: [0.8, 1.5],
      density: habitat === 'forest' ? (x, z) => clamp01(forest(x, z) + shrubPatch(x, z) * 0.4) : shrubPatch,
      avoid: (x, z) => nearPath(x, z, 3.5), sink: 0.05,
    }), 2), SHRUB);
    add('saplings', m.pachira_aquatica_01.url, thin(scatter({
      seed: 25, count: habitat === 'forest' ? 150 : 60, radius: 140, centre, scale: [1.2, 2.2],
      density: habitat === 'forest' ? forest : broadleafGrove, avoid: (x, z) => nearPath(x, z, 4), sink: 0.05,
    }), 2), SHRUB);
  }

  // Wood: driftwood and eroded root masses along the channel, fallen trunks in the forest.
  add('driftwood', m.dead_tree_trunk_02.url, scatter({
    seed: 41, count: dead ? 40 : 16, radius: 200, scale: [1.0, 2.2], minRiverDistance: 13, maxRiverDistance: dead ? 200 : 32,
    avoid: (x, z) => nearPath(x, z, 5), sink: 0.25,
  }), SOLID);
  add('root-banks', m.root_cluster_01.url, scatter({
    seed: 42, count: 14, radius: 200, scale: [1.0, 1.6], minRiverDistance: 13.5, maxRiverDistance: 19,
    avoid: (x, z) => nearPath(x, z, 5), sink: 0.4,
  }), SOLID);
  add('logs', m.dead_tree_trunk.url, scatter({
    seed: 43, count: dead ? 30 : habitat === 'forest' ? 18 : 6, radius: 150, centre, scale: [0.9, 1.4],
    avoid: (x, z) => nearPath(x, z, 5), sink: 0.1,
  }), SOLID);
  add('stumps', m.tree_stump_01.url, scatter({
    seed: 44, count: dead ? 24 : 8, radius: 160, centre, scale: [0.9, 1.4], avoid: (x, z) => nearPath(x, z, 4), sink: 0.05,
  }), SOLID);
  return layers;
}

function Instanced({ name, url, placements, options, make, impostor, light }: Omit<Layer, 'key'> & { name: string; light: Color }) {
  const { scene } = useGLTF(url);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const group = useMemo(
    () =>
      impostor
        ? buildImpostors(gl, scene, placements, { include: options.include, light, tint: options.tint })
        : buildInstances(make ? make(scene) : scene, placements, options),
    [scene, placements, options, make, impostor, gl, light],
  );
  group.name = name;
  useFrame(() => {
    if (options.cullDistance) cullChunks(group as never, camera.position, options.cullDistance);
  });
  useEffect(
    () => () =>
      group.traverse((o) => {
        (o as { dispose?: () => void }).dispose?.();
        (o.userData.dispose as (() => void) | undefined)?.();
      }),
    [group],
  );
  return <primitive object={group} />;
}

export function Vegetation({ scene }: { scene: OutdoorScene }) {
  const low = useApp((s) => s.quality === 'low');
  const layers = useMemo(() => layersFor(scene.habitat, scene.animals.map((a) => a.path), low), [scene, low]);
  // Light for the impostors' baked texture: sun colour and strength plus sky fill, roughly matching
  // how the meshes are lit at that distance (fog does most of the work beyond 200 m).
  const light = useMemo(
    () => new Color(scene.sunColor).multiplyScalar(scene.sunIntensity * 0.06).addScalar(scene.environmentIntensity * 0.6),
    [scene],
  );
  useFrame((_, delta) => {
    windUniforms.uTime.value += delta;
  });
  return (
    <>
      {layers.map((layer) => (
        <Instanced key={layer.key} name={layer.key} url={layer.url} placements={layer.placements} options={layer.options} make={layer.make} impostor={layer.impostor} light={light} />
      ))}
    </>
  );
}

for (const id of ['bald-cypress', 'jacaranda_tree', 'jacaranda_tree_far', 'fern-treeit', 'fern_02', 'shrub_02', 'pachira_aquatica_01', 'dead_tree_trunk', 'dead_tree_trunk_02', 'root_cluster_01', 'tree_stump_01'] as const) {
  useGLTF.preload(m[id].url);
}

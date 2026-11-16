import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { DoubleSide, type MeshStandardMaterial } from 'three';
import assets from '../data/generated/assets.json';
import { SCENES, type OutdoorScene } from '../data/scenes';
import { buildInstances, windUniforms, type InstanceOptions } from '../three/instancing';
import { useApp } from '../state';
import { distanceToLoop, fbm, riverDistance, scatter, type Placement } from '../world/terrain';

const outdoorScenes = Object.values(SCENES).filter((s): s is OutdoorScene => s.kind === 'outdoor');
const paths = outdoorScenes.flatMap((scene) => scene.animals.map((a) => a.path));

const nearPath = (x: number, z: number, clearance: number) =>
  paths.some((path) => distanceToLoop(path, x, z) < clearance);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Hell Creek stand-ins: bald cypress for the taxodiaceous conifers common in the
 * flora, ferns as ground cover. There is deliberately no grass: grasslands did not
 * exist yet.
 */
function usePlacements() {
  return useMemo(() => {
    const grove = (x: number, z: number) =>
      clamp01(0.15 + fbm(x / 140 + 4, z / 140 - 2, 3) * 1.8 + (riverDistance(x, z) < 50 ? 0.35 : 0));
    const fernPatch = (x: number, z: number) => clamp01(0.8 + fbm(x / 26 - 8, z / 26 + 1, 3) * 1.6);
    return {
      nearTrees: scatter({
        seed: 11, count: 120, radius: 230, scale: [0.55, 1.05], density: grove,
        avoid: (x, z) => nearPath(x, z, 11), minRiverDistance: 17,
      }),
      farTrees: scatter({
        seed: 12, count: 170, radius: 640, scale: [0.6, 1.15],
        density: (x, z) => (Math.hypot(x, z) < 230 ? 0 : clamp01(0.3 + grove(x, z))),
      }),
      ferns: scatter({
        seed: 21, count: 2600, radius: 150, scale: [0.6, 1.35], density: fernPatch,
        sink: 0.05,
      }),
      broadFerns: scatter({
        seed: 22, count: 90, radius: 90, scale: [1.1, 1.8], density: fernPatch,
        avoid: (x, z) => nearPath(x, z, 3), sink: 0.05,
      }),
      rocks: scatter({
        seed: 31, count: 36, radius: 200, scale: [3, 7.5], maxRiverDistance: 40, minRiverDistance: 12,
        avoid: (x, z) => nearPath(x, z, 3), sink: 0.15,
      }),
      boulders: scatter({
        seed: 32, count: 9, radius: 200, scale: [0.6, 1.2],
        avoid: (x, z) => nearPath(x, z, 6), sink: 0.3,
      }),
      logs: scatter({
        seed: 41, count: 7, radius: 150, scale: [0.9, 1.3],
        avoid: (x, z) => nearPath(x, z, 5), sink: 0.1,
      }),
      stumps: scatter({
        seed: 42, count: 8, radius: 160, scale: [0.9, 1.4],
        avoid: (x, z) => nearPath(x, z, 4), sink: 0.05,
      }),
    };
  }, []);
}

const foliage = (material: MeshStandardMaterial) => {
  material.side = DoubleSide;
  material.alphaTest = Math.max(material.alphaTest, 0.45);
  material.transparent = false;
  material.roughness = Math.max(material.roughness, 0.75);
  material.envMapIntensity = 0.7;
};

function Instanced({ url, placements, options }: { url: string; placements: Placement[]; options: InstanceOptions }) {
  const { scene } = useGLTF(url);
  const group = useMemo(() => buildInstances(scene, placements, options), [scene, placements, options]);
  useEffect(() => () => group.traverse((o) => (o as { dispose?: () => void }).dispose?.()), [group]);
  return <primitive object={group} />;
}

const m = assets.models;
const TREE: InstanceOptions = { castShadow: true, wind: 0.00035, tweak: foliage };
const FAR_TREE: InstanceOptions = { castShadow: false, wind: 0.00035, tweak: foliage };
const FERN: InstanceOptions = { castShadow: false, wind: 0.07, tweak: foliage };
const SOLID: InstanceOptions = { castShadow: true };

export function Vegetation() {
  const p = usePlacements();
  const low = useApp((s) => s.quality === 'low');
  const ferns = useMemo(() => (low ? p.ferns.filter((_, i) => i % 2 === 0) : p.ferns), [low, p.ferns]);
  useFrame((_, delta) => {
    windUniforms.uTime.value += delta;
  });
  return (
    <>
      <Instanced url={m['bald-cypress'].url} placements={p.nearTrees} options={TREE} />
      {!low && <Instanced url={m['bald-cypress'].url} placements={p.farTrees} options={FAR_TREE} />}
      <Instanced url={m['fern-treeit'].url} placements={ferns} options={FERN} />
      <Instanced url={m.fern_02.url} placements={p.broadFerns} options={FERN} />
      <Instanced url={m.rock_07.url} placements={p.rocks} options={SOLID} />
      <Instanced url={m.boulder_01.url} placements={p.boulders} options={SOLID} />
      <Instanced url={m.dead_tree_trunk.url} placements={p.logs} options={SOLID} />
      <Instanced url={m.tree_stump_01.url} placements={p.stumps} options={SOLID} />
    </>
  );
}

for (const id of ['bald-cypress', 'fern-treeit', 'fern_02', 'rock_07', 'boulder_01', 'dead_tree_trunk', 'tree_stump_01'] as const) {
  useGLTF.preload(m[id].url);
}

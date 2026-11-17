import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import assets from '../data/generated/assets.json';
import { fbm, mudMask, terrainHeight, WORLD_SIZE } from '../world/terrain';

const SEGMENTS = 360;
const TILE_METRES = 4.5;

/**
 * Grid whose spacing is ~0.6 m at the centre (where the animals are) and widens
 * towards the horizon, so one mesh covers 1.6 km without wasting vertices.
 */
function buildGeometry() {
  const half = WORLD_SIZE / 2;
  const warp = (u: number) => half * (0.16 * u + 0.84 * u * u * u);
  const count = (SEGMENTS + 1) ** 2;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const mud = new Float32Array(count);
  const soil = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const tint = new Color();
  let v = 0;
  for (let j = 0; j <= SEGMENTS; j++) {
    const z = warp((j / SEGMENTS) * 2 - 1);
    for (let i = 0; i <= SEGMENTS; i++, v++) {
      const x = warp((i / SEGMENTS) * 2 - 1);
      positions.set([x, terrainHeight(x, z), z], v * 3);
      uvs.set([x / TILE_METRES, z / TILE_METRES], v * 2);
      mud[v] = mudMask(x, z);
      // Bare-soil patches between litter, sharper than the colour variation below.
      soil[v] = Math.min(1, Math.max(0, fbm(x / 18 + 31, z / 18 - 7, 3) * 2.2 - 0.1));
      // Low-frequency brightness/hue variation breaks up texture tiling at distance.
      const variation = fbm(x / 45, z / 45, 3);
      tint.setRGB(0.6 + variation * 0.14, 0.64 + variation * 0.14, 0.52 + variation * 0.1);
      colors.set([tint.r, tint.g, tint.b], v * 3);
    }
  }
  const indices = new Uint32Array(SEGMENTS * SEGMENTS * 6);
  let k = 0;
  for (let j = 0; j < SEGMENTS; j++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = j * (SEGMENTS + 1) + i;
      const b = a + SEGMENTS + 1;
      indices.set([a, b, a + 1, b, b + 1, a + 1], k);
      k += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('mud', new BufferAttribute(mud, 1));
  geometry.setAttribute('soil', new BufferAttribute(soil, 1));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function prepare(texture: Texture, srgb: boolean) {
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Floodplain floor: moss and leaf litter, with patches of bare soil (blended by a noise attribute),
 * dark wet mud along the river margin, and an optional pale clay layer (the K–Pg boundary clay).
 * Each layer is sampled at two scales to hide tiling.
 */
function buildMaterial(textures: Record<string, Texture>, clay: number) {
  const material = new MeshStandardMaterial({
    map: prepare(textures.litterDiff, true),
    normalMap: prepare(textures.litterNormal, false),
    roughnessMap: prepare(textures.litterArm, false),
    aoMap: textures.litterArm,
    aoMapIntensity: 0.9,
    vertexColors: true,
    metalness: 0,
  });
  const soilMap = prepare(textures.soilDiff, true);
  const mudMap = prepare(textures.mudDiff, true);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.soilMap = { value: soilMap };
    shader.uniforms.mudMap = { value: mudMap };
    shader.uniforms.uClay = { value: clay };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float mud;\nattribute float soil;\nvarying float vMud;\nvarying float vSoil;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMud = mud;\nvSoil = soil;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D soilMap;\nuniform sampler2D mudMap;\nuniform float uClay;\nvarying float vMud;\nvarying float vSoil;',
      )
      .replace(
        '#include <map_fragment>',
        `vec4 litter = mix(texture2D(map, vMapUv), texture2D(map, vMapUv * 0.23 + 0.37), 0.4);
        vec4 soil = mix(texture2D(soilMap, vMapUv * 0.9), texture2D(soilMap, vMapUv * 0.21 + 0.11), 0.4);
        vec4 mudColor = mix(texture2D(mudMap, vMapUv * 0.7), texture2D(mudMap, vMapUv * 0.19 + 0.53), 0.35);
        vec4 groundColor = mix(litter, soil * vec4(0.92, 0.88, 0.82, 1.0), vSoil);
        groundColor = mix(groundColor, mudColor * vec4(0.9, 0.86, 0.8, 1.0), vMud);
        // Boundary clay: a pale grey-buff layer that settles thickest in hollows (low-frequency soil mask).
        float clay = uClay * (0.75 + 0.25 * vSoil);
        groundColor.rgb = mix(groundColor.rgb, vec3(0.42, 0.40, 0.37) * (0.8 + 0.4 * groundColor.g), clay);
        diffuseColor *= groundColor;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.28, vMud * 0.9);
        roughnessFactor = mix(roughnessFactor, 0.95, uClay * 0.6);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Wet mud and clay are smoother than leaf litter.
        normal = normalize(mix(normal, nonPerturbedNormal, clamp(vMud * 0.6 + uClay * 0.5, 0.0, 0.85)));`,
      );
  };
  material.customProgramCacheKey = () => 'terrain-splat-v2';
  return material;
}

export function Terrain({ clay = 0 }: { clay?: number }) {
  const t = assets.textures;
  const textures = useTexture({
    litterDiff: t.forest_leaves_02.diff,
    litterNormal: t.forest_leaves_02.nor_gl,
    litterArm: t.forest_leaves_02.arm,
    soilDiff: t.forrest_ground_01.diff,
    mudDiff: t.mud_forest.diff,
  });
  const geometry = useMemo(buildGeometry, []);
  const material = useMemo(() => buildMaterial(textures, clay), [textures, clay]);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

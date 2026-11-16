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
      // Low-frequency brightness/hue variation breaks up texture tiling at distance.
      const variation = fbm(x / 45, z / 45, 3);
      tint.setRGB(0.66 + variation * 0.16, 0.68 + variation * 0.14, 0.58 + variation * 0.1);
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

/** Forest-floor material with a wet mud layer blended in along the river margin. */
function buildMaterial(textures: Record<string, Texture>) {
  const material = new MeshStandardMaterial({
    map: prepare(textures.groundDiff, true),
    normalMap: prepare(textures.groundNormal, false),
    roughnessMap: prepare(textures.groundArm, false),
    aoMap: textures.groundArm,
    aoMapIntensity: 0.8,
    vertexColors: true,
    metalness: 0,
  });
  const mudMap = prepare(textures.mudDiff, true);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.mudMap = { value: mudMap };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float mud;\nvarying float vMud;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMud = mud;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D mudMap;\nvarying float vMud;')
      .replace(
        '#include <map_fragment>',
        `vec4 groundColor = texture2D(map, vMapUv);
        vec4 mudColor = texture2D(mudMap, vMapUv * 0.8);
        diffuseColor *= mix(groundColor, mudColor * vec4(0.78, 0.76, 0.72, 1.0), vMud);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.32, vMud * 0.85);`,
      );
  };
  material.customProgramCacheKey = () => 'terrain-splat';
  return material;
}

export function Terrain() {
  const t = assets.textures;
  const textures = useTexture({
    groundDiff: t.forrest_ground_01.diff,
    groundNormal: t.forrest_ground_01.nor_gl,
    groundArm: t.forrest_ground_01.arm,
    mudDiff: t.brown_mud_leaves_01.diff,
  });
  const geometry = useMemo(buildGeometry, []);
  const material = useMemo(() => buildMaterial(textures), [textures]);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

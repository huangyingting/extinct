import {
  BufferAttribute,
  Color,
  BufferGeometry,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import type { Placement } from '../world/terrain';

/** Shared clock for every wind-animated material. */
export const windUniforms = { uTime: { value: 0 } };

/**
 * Adds a cheap vertex sway to foliage. Displacement grows with the square of the
 * vertex height (geometry is baked so local Y is metres above the plant's base)
 * and is phase-shifted by each instance's world position.
 */
export function addWind(material: Material, strength: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 windOrigin = vec3(0.0);
        #ifdef USE_INSTANCING
          windOrigin = instanceMatrix[3].xyz;
        #endif
        float gust = sin(uTime * 0.7 + windOrigin.x * 0.03) * 0.5 + 0.5;
        float sway = sin(uTime * 1.6 + windOrigin.x * 0.37 + windOrigin.z * 0.23) * (0.6 + 0.6 * gust)
                   + sin(uTime * 3.1 + windOrigin.z * 0.51 + position.x * 0.8) * 0.25;
        float bend = uWind * transformed.y * transformed.y;
        transformed.x += sway * bend;
        transformed.z += sway * bend * 0.6;`,
      );
  };
  material.customProgramCacheKey = () => `wind-${strength}`;
}

/** Copy an attribute to plain floats (meshopt/quantized sources use normalized ints). */
function toFloat(attribute: BufferAttribute, itemSize: number) {
  const array = new Float32Array(attribute.count * itemSize);
  for (let i = 0; i < attribute.count; i++) {
    for (let c = 0; c < itemSize; c++) array[i * itemSize + c] = attribute.getComponent(i, c);
  }
  return new BufferAttribute(array, itemSize);
}

/** Geometry with the node transform baked in, so local space is metres, Y-up, base at 0. */
function bakeGeometry(mesh: Mesh, matrix: Matrix4): BufferGeometry {
  const geometry = mesh.geometry.clone();
  for (const name of ['position', 'normal', 'tangent'] as const) {
    const attribute = geometry.getAttribute(name) as BufferAttribute | undefined;
    if (attribute) geometry.setAttribute(name, toFloat(attribute, attribute.itemSize));
  }
  geometry.applyMatrix4(matrix);
  geometry.computeBoundingSphere();
  return geometry;
}

export interface InstanceOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  wind?: number;
  /** Adjust imported materials, e.g. to tone down glossy foliage. */
  tweak?: (material: MeshStandardMaterial) => void;
  /** Keep only sub-meshes whose material name passes, e.g. to drop foliage from dead trees. */
  include?: (materialName: string) => boolean;
  /** Per-instance brightness/hue variation (0 = none) so repeated models do not read as clones. */
  tint?: number;
  /** Hide whole chunks beyond this distance from the camera (small plants are invisible far away). */
  cullDistance?: number;
}

/** Show only the chunks of a distance-culled instance group that are within range of the camera. */
export function cullChunks(group: Group, camera: Vector3, distance: number) {
  for (const child of group.children) {
    const sphere = (child as InstancedMesh).boundingSphere;
    if (sphere) child.visible = sphere.center.distanceTo(camera) - sphere.radius < distance;
  }
}

/** Deterministic per-placement colour: slight brightness, warmth and saturation changes. */
function instanceTint(p: Placement, amount: number, target: Color) {
  const h = Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453;
  const a = h - Math.floor(h);
  const b = (h * 7.13) - Math.floor(h * 7.13);
  const light = 1 - amount * 0.5 + amount * a;
  const warm = (b - 0.5) * amount * 0.6;
  return target.setRGB(light * (1 + warm), light, light * (1 - warm * 1.4));
}

/** Spatial chunk size; each chunk is a separate InstancedMesh so the renderer can frustum-cull it. */
const CHUNK_METRES = 60;

function chunk(placements: Placement[]) {
  const cells = new Map<string, Placement[]>();
  for (const p of placements) {
    const key = `${Math.floor(p.x / CHUNK_METRES)},${Math.floor(p.z / CHUNK_METRES)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(p);
  }
  return [...cells.values()];
}

/**
 * Build InstancedMeshes for every sub-mesh of a glTF scene, placed on the terrain.
 * Placements are split into spatial chunks: one bounding sphere per chunk lets the main,
 * shadow, reflection and AO passes skip vegetation that is off-screen.
 */
export function buildInstances(scene: Object3D, placements: Placement[], options: InstanceOptions = {}) {
  const group = new Group();
  scene.updateMatrixWorld(true);
  const rootInverse = new Matrix4().copy(scene.matrixWorld).invert();
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const position = new Vector3();
  const scale = new Vector3();
  const chunks = chunk(placements);
  const color = new Color();

  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    if (options.include && !options.include((mesh.material as Material).name)) return;
    const geometry = bakeGeometry(mesh, new Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld));
    const material = (mesh.material as MeshStandardMaterial).clone();
    options.tweak?.(material);
    if (options.wind) addWind(material, options.wind);
    for (const cell of chunks) {
      const instanced = new InstancedMesh(geometry, material, cell.length);
      cell.forEach((p, i) => {
        quaternion.setFromAxisAngle(up, p.rotation);
        position.set(p.x, p.y, p.z);
        scale.setScalar(p.scale);
        instanced.setMatrixAt(i, matrix.compose(position, quaternion, scale));
        if (options.tint) instanced.setColorAt(i, instanceTint(p, options.tint, color));
      });
      instanced.castShadow = options.castShadow ?? false;
      instanced.receiveShadow = options.receiveShadow ?? true;
      instanced.computeBoundingSphere();
      group.add(instanced);
    }
  });
  return group;
}

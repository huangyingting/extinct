import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  WebGLRenderTarget,
  type Material,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import type { Placement } from '../world/terrain';

/**
 * Billboard impostors for distant trees: the model is rendered once, side-on, into a texture,
 * then drawn as instanced quads that turn about the vertical axis to face the camera.
 * Two triangles per tree instead of thousands; fine where fog already softens the detail.
 */

const vertex = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform vec2 uSize;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float scale = length(instanceMatrix[0].xyz);
  // Camera right vector, flattened: the card stays upright.
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  // Mirror every other tree so neighbours do not look identical.
  float mirror = fract(base.x * 0.137 + base.z * 0.071) > 0.5 ? -1.0 : 1.0;
  vec3 p = base + right * position.x * uSize.x * scale * mirror + vec3(0.0, position.y * uSize.y * scale, 0.0);
  vUv = uv;
  vTint = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D map;
uniform vec3 uLight;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vec4 color = texture2D(map, vUv);
  if (color.a < 0.5) discard;
  gl_FragColor = vec4(color.rgb * uLight * vTint, 1.0);
  #include <fog_fragment>
}`;

/** Render `source` side-on into a square texture; returns the texture and the captured size in metres. */
function capture(renderer: WebGLRenderer, source: Object3D, include?: (name: string) => boolean, resolution = 512) {
  const object = source.clone(true);
  object.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && include && !include((mesh.material as Material).name)) mesh.visible = false;
  });
  const box = new Box3().setFromObject(object, true);
  const size = box.getSize(new Vector3());
  const side = Math.max(size.x, size.y) * 1.02;
  const centreX = (box.min.x + box.max.x) / 2;
  const camera = new OrthographicCamera(-side / 2, side / 2, side, 0, 0.1, 1000);
  camera.position.set(centreX, box.min.y, box.max.z + 100);
  camera.lookAt(centreX, box.min.y, 0);
  // The ortho frustum is anchored at the base: bottom = 0, top = side (camera y is the tree base).
  const scene = new Scene();
  scene.add(object, new AmbientLight('#ffffff', 1.1));
  const key = new DirectionalLight('#ffffff', 1.8);
  key.position.set(0.4, 1, 0.8);
  scene.add(key);
  const target = new WebGLRenderTarget(resolution, resolution, { generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
  const previous = renderer.getRenderTarget();
  const clear = renderer.getClearColor(new Color());
  const alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor('#000000', 0);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(previous);
  renderer.setClearColor(clear, alpha);
  return { texture: target.texture, target, side, baseOffset: box.min.y };
}

export interface ImpostorOptions {
  include?: (materialName: string) => boolean;
  /** Linear light colour the baked texture is multiplied by, to match the scene. */
  light: Color;
  /** Per-instance brightness variation, as for instanced meshes. */
  tint?: number;
}

export function buildImpostors(renderer: WebGLRenderer, source: Object3D, placements: Placement[], options: ImpostorOptions) {
  const { texture, target, side, baseOffset } = capture(renderer, source, options.include);
  const geometry = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      { map: { value: null }, uSize: { value: [side, side] }, uLight: { value: new Color() } },
    ]),
    fog: true,
  });
  material.uniforms.map.value = texture;
  material.uniforms.uLight.value = options.light;
  const mesh = new InstancedMesh(geometry, material, placements.length);
  const matrix = new Matrix4();
  const color = new Color();
  const identity = new Quaternion();
  placements.forEach((p, i) => {
    mesh.setMatrixAt(i, matrix.compose(new Vector3(p.x, p.y + baseOffset * p.scale, p.z), identity, new Vector3(p.scale, p.scale, p.scale)));
    if (options.tint) {
      const h = Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453;
      const light = 1 - options.tint * 0.5 + options.tint * (h - Math.floor(h));
      mesh.setColorAt(i, color.setScalar(light));
    }
  });
  // Billboards move in the vertex shader; the default bounds would cull them wrongly.
  mesh.frustumCulled = false;
  mesh.userData.dispose = () => target.dispose();
  return mesh;
}

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import { mulberry32 } from '../world/terrain';

/**
 * Compass in this world: chosen so the late-afternoon sun of the impact sky sits in the
 * west-south-west. Chicxulub lies about 156° (SSE) from the Hell Creek area, so ejecta
 * arrive from that bearing.
 */
const NORTH = new Vector3(-0.833, 0, 0.553);
const EAST = new Vector3(-0.553, 0, -0.833);
const bearing = (degrees: number) => {
  const r = (degrees * Math.PI) / 180;
  return NORTH.clone().multiplyScalar(Math.cos(r)).addScaledVector(EAST, Math.sin(r)).normalize();
};
const FROM_CHICXULUB = bearing(156);

const STREAKS = 420;

const streakVertex = /* glsl */ `
attribute float seed;
attribute vec4 params; // start offset x/z, altitude, lifetime
uniform float uTime;
uniform vec3 uTravel;
uniform vec3 uCentre;
varying float vAlong;
varying float vFade;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float life = params.w;
  float t = mod(uTime + seed * 37.0, life + 1.5);
  float age = t / life;
  // Each streak descends at a shallow angle along the travel direction, ~2-5 km/s on screen scale.
  vec3 dir = normalize(uTravel + vec3(0.0, -0.18 - 0.12 * hash(seed + 3.0), 0.0));
  float speed = 520.0 + 380.0 * hash(seed + 7.0);
  vec3 head = uCentre + vec3(params.x, params.z, params.y) + dir * speed * (t - life * 0.5);
  float len = 160.0 + 420.0 * hash(seed + 11.0);
  vec3 tail = head - dir * len;
  // position.x in [0,1] along the streak, position.y in [-1,1] across it.
  vec3 p = mix(tail, head, position.x);
  vec3 toCam = normalize(cameraPosition - p);
  vec3 across = cross(dir, toCam);
  vec3 side = across / max(length(across), 1e-4);
  float width = (2.5 + 4.5 * hash(seed + 13.0)) * mix(0.3, 1.0, position.x);
  p += side * position.y * width;
  vAlong = position.x;
  vFade = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.7, 1.0, age)) * step(age, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const streakFragment = /* glsl */ `
varying float vAlong;
varying float vFade;
void main() {
  // Interpolation can push vAlong a hair below 0, and pow() of a negative number is NaN,
  // which bloom would then smear across the whole frame.
  float along = clamp(vAlong, 0.0, 1.0);
  // White-hot head cooling to orange along the trail.
  vec3 hot = vec3(1.0, 0.92, 0.75) * 9.0;
  vec3 cool = vec3(1.0, 0.38, 0.08) * 2.2;
  vec3 color = mix(cool, hot, pow(along, 6.0));
  float alpha = pow(along, 1.6) * clamp(vFade, 0.0, 1.0);
  gl_FragColor = vec4(color * alpha, alpha);
}`;

function useStreaks() {
  return useMemo(() => {
    const strip = new BufferGeometry();
    // A 2 x 6 vertex ribbon: x along the streak, y across it.
    const positions: number[] = [];
    const segments = 6;
    for (let i = 0; i <= segments; i++) {
      const x = i / segments;
      positions.push(x, -1, 0, x, 1, 0);
    }
    const index: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    strip.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    strip.setIndex(index);
    const geometry = new InstancedBufferGeometry().copy(strip as InstancedBufferGeometry);
    geometry.instanceCount = STREAKS;
    const random = mulberry32(66);
    const seeds = new Float32Array(STREAKS);
    const params = new Float32Array(STREAKS * 4);
    for (let i = 0; i < STREAKS; i++) {
      seeds[i] = random() * 100;
      params.set([(random() - 0.5) * 3000, (random() - 0.5) * 3000, 160 + random() * 700, 1.4 + random() * 2.4], i * 4);
    }
    geometry.setAttribute('seed', new InstancedBufferAttribute(seeds, 1));
    geometry.setAttribute('params', new InstancedBufferAttribute(params, 4));
    const material = new ShaderMaterial({
      vertexShader: streakVertex,
      fragmentShader: streakFragment,
      uniforms: {
        uTime: { value: 0 },
        uTravel: { value: FROM_CHICXULUB.clone().negate() },
        uCentre: { value: new Vector3() },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    return { geometry, material };
  }, []);
}

const SPHERULES = 2400;

const spherulesVertex = /* glsl */ `
attribute vec3 offset;
uniform float uTime;
uniform vec3 uCentre;
varying float vGlow;
void main() {
  vec3 p = offset;
  // Falling glass droplets, drifting with the wind; the field wraps around the camera.
  p.y = mod(offset.y - uTime * (3.0 + fract(offset.x * 7.31) * 3.0), 40.0) - 6.0;
  p.x = mod(offset.x + uTime * 0.6 - uCentre.x + 60.0, 120.0) - 60.0 + uCentre.x;
  p.z = mod(offset.z - uCentre.z + 60.0, 120.0) - 60.0 + uCentre.z;
  p.y += uCentre.y;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(90.0 / -mv.z, 1.5, 4.5);
  vGlow = fract(offset.z * 3.17);
  gl_Position = projectionMatrix * mv;
}`;

const spherulesFragment = /* glsl */ `
varying float vGlow;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(d));
  // Most are dark glass catching the light; a few are still glowing.
  vec3 color = mix(vec3(0.9, 0.75, 0.55) * 0.8, vec3(1.0, 0.45, 0.12) * 4.0, step(0.93, vGlow));
  gl_FragColor = vec4(color * a, a * 0.8);
}`;

function useSpherules() {
  return useMemo(() => {
    const random = mulberry32(67);
    const offsets = new Float32Array(SPHERULES * 3);
    for (let i = 0; i < SPHERULES; i++) offsets.set([(random() - 0.5) * 120, random() * 40, (random() - 0.5) * 120], i * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(SPHERULES * 3), 3));
    geometry.setAttribute('offset', new BufferAttribute(offsets, 3));
    const material = new ShaderMaterial({
      vertexShader: spherulesVertex,
      fragmentShader: spherulesFragment,
      uniforms: { uTime: { value: 0 }, uCentre: { value: new Vector3() } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    return { geometry, material };
  }, []);
}

/** Re-entering ejecta streaks high overhead and a fall of impact spherules around the viewer. */
export function ImpactSky() {
  const camera = useThree((s) => s.camera);
  const streaks = useStreaks();
  const spherules = useSpherules();
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    const t = (streaks.material.uniforms.uTime.value as number) + delta;
    streaks.material.uniforms.uTime.value = t;
    // The streak field stays centred on the viewer, offset towards the incoming side.
    (streaks.material.uniforms.uCentre.value as Vector3).set(camera.position.x, 0, camera.position.z).addScaledVector(FROM_CHICXULUB, 700);
    spherules.material.uniforms.uTime.value = t;
    (spherules.material.uniforms.uCentre.value as Vector3).set(camera.position.x, camera.position.y - 20, camera.position.z);
  });
  return (
    <group ref={group}>
      <mesh geometry={streaks.geometry} material={streaks.material} frustumCulled={false} renderOrder={2} />
      <points geometry={spherules.geometry} material={spherules.material} frustumCulled={false} renderOrder={3} />
    </group>
  );
}

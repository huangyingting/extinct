import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { CatmullRomCurve3, Group, LoopRepeat, MathUtils, Vector3, type AnimationAction, type Mesh, type MeshStandardMaterial } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FAUNA, type FaunaId } from '../data/fauna';
import { leaders } from '../state';
import { mulberry32, WATER_LEVEL } from '../world/terrain';

/**
 * Pterosaurs and aquatic reptiles: simpler than the dinosaurs. They follow a closed path, and the
 * blend between their two clips (Swim/Idle or Flap/Glide) is driven by what they are doing.
 */

interface Props {
  id: string;
  fauna: FaunaId;
  path: [number, number][];
  start: number;
  /** Cruising speed, m/s. */
  speed: number;
  /** Swimmers: depth of the body centreline below the water surface. Flyers: height above the water. */
  level: number;
  /** The first of each kind registers for the camera to follow. */
  leader?: boolean;
}

function useLeader(fauna: FaunaId, root: RefObject<Group | null>, leader: boolean) {
  useEffect(() => {
    if (!leader || !root.current) return;
    leaders.set(fauna, root.current);
    const self = root.current;
    return () => {
      if (leaders.get(fauna) === self) leaders.delete(fauna);
    };
  }, [fauna, root, leader]);
}

function useCreature(fauna: FaunaId) {
  const gltf = useGLTF(FAUNA[fauna].model.url);
  const model = useMemo(() => {
    const scene = clone(gltf.scene);
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const material = (mesh.material as MeshStandardMaterial).clone();
      material.roughness = Math.max(material.roughness, 0.6);
      material.metalness = 0;
      mesh.material = material;
    });
    return scene;
  }, [gltf.scene]);
  return { gltf, model };
}

function useTrack(path: [number, number][]) {
  return useMemo(() => {
    const curve = new CatmullRomCurve3(path.map(([x, z]) => new Vector3(x, 0, z)), true, 'centripetal');
    return { curve, length: curve.getLength() };
  }, [path]);
}

const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

/** Mosasaurs, champsosaurs and crocodilians: swim along the path, sometimes drift and float. */
export function Swimmer({ id, fauna, path, start, speed, level, leader = false }: Props) {
  const { gltf, model } = useCreature(fauna);
  const root = useRef<Group>(null);
  useLeader(fauna, root, leader);
  const { actions } = useAnimations(gltf.animations, root);
  const { curve, length } = useTrack(path);
  const random = useMemo(() => mulberry32(hash(id)), [id]);
  const clips = useRef<{ swim?: AnimationAction; idle?: AnimationAction }>({});
  const s = useRef({ distance: start * length, speed: speed, swimming: true, timer: 0, duration: 10, yaw: 0, depth: level });
  const point = useMemo(() => new Vector3(), []);
  const tangent = useMemo(() => new Vector3(), []);

  useEffect(() => {
    clips.current = { swim: actions.Swim ?? undefined, idle: actions.Idle ?? undefined };
    for (const clip of Object.values(clips.current)) {
      clip?.reset().setLoop(LoopRepeat, Infinity).play();
      if (clip) clip.time = random() * clip.getClip().duration;
    }
    s.current.duration = 8 + random() * 14;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
    const st = s.current;
    const group = root.current;
    const { swim, idle } = clips.current;
    if (!group || !swim || !idle) return;
    st.timer += dt;
    if (st.timer > st.duration) {
      st.swimming = !st.swimming;
      st.timer = 0;
      st.duration = st.swimming ? 10 + random() * 16 : 4 + random() * 8;
    }
    st.speed = MathUtils.lerp(st.speed, st.swimming ? speed : 0, 1 - Math.exp(-dt * 0.8));
    st.distance = (st.distance + st.speed * dt) % length;
    const u = st.distance / length;
    curve.getPointAt(u, point);
    curve.getTangentAt(u, tangent);
    const yaw = Math.atan2(tangent.x, tangent.z);
    st.yaw += Math.atan2(Math.sin(yaw - st.yaw), Math.cos(yaw - st.yaw)) * Math.min(1, dt * 2);
    // Drifting animals rise to the surface (only the back and eyes showing).
    const targetDepth = st.swimming ? level : Math.min(level, FAUNA[fauna].model.length * 0.04);
    st.depth = MathUtils.lerp(st.depth, targetDepth, 1 - Math.exp(-dt * 0.5));
    group.position.set(point.x, WATER_LEVEL - st.depth, point.z);
    group.rotation.set(0, st.yaw, 0);
    const w = MathUtils.clamp(st.speed / speed, 0, 1);
    swim.setEffectiveWeight(w);
    idle.setEffectiveWeight(1 - w);
    swim.timeScale = 0.4 + 0.8 * w;
  });

  return (
    <group ref={root}>
      <primitive object={model} />
    </group>
  );
}

/** Azhdarchids: soar on a wide loop, banking into the turns, with occasional bursts of flapping. */
export function Flyer({ id, fauna, path, start, speed, level, leader = false }: Props) {
  const { gltf, model } = useCreature(fauna);
  const root = useRef<Group>(null);
  useLeader(fauna, root, leader);
  const { actions } = useAnimations(gltf.animations, root);
  const { curve, length } = useTrack(path);
  const random = useMemo(() => mulberry32(hash(id)), [id]);
  const clips = useRef<{ flap?: AnimationAction; glide?: AnimationAction }>({});
  const s = useRef({ distance: start * length, flap: 0, flapping: false, timer: 0, duration: 8, yaw: 0, roll: 0, clock: random() * 100 });
  const point = useMemo(() => new Vector3(), []);
  const tangent = useMemo(() => new Vector3(), []);
  const ahead = useMemo(() => new Vector3(), []);

  useEffect(() => {
    clips.current = { flap: actions.Flap ?? undefined, glide: actions.Glide ?? undefined };
    for (const clip of Object.values(clips.current)) clip?.reset().setLoop(LoopRepeat, Infinity).play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
    const st = s.current;
    const group = root.current;
    const { flap, glide } = clips.current;
    if (!group || !flap || !glide) return;
    st.clock += dt;
    st.timer += dt;
    if (st.timer > st.duration) {
      st.flapping = !st.flapping;
      st.timer = 0;
      // Large pterosaurs probably soared most of the time, flapping in short bursts.
      st.duration = st.flapping ? 2 + random() * 2.5 : 8 + random() * 14;
    }
    st.flap = MathUtils.lerp(st.flap, st.flapping ? 1 : 0, 1 - Math.exp(-dt * 3));
    st.distance = (st.distance + speed * dt) % length;
    const u = st.distance / length;
    curve.getPointAt(u, point);
    curve.getTangentAt(u, tangent);
    curve.getTangentAt((u + 0.01) % 1, ahead);
    const yaw = Math.atan2(tangent.x, tangent.z);
    const turnRate = Math.atan2(tangent.x * ahead.z - tangent.z * ahead.x, tangent.dot(ahead)) / ((0.01 * length) / speed);
    st.yaw = yaw;
    // Coordinated turn: bank angle from speed and turn rate (tan φ = v ω / g).
    // (turnRate is positive for right turns here; a left turn rolls the left wing down, negative roll.)
    st.roll = MathUtils.lerp(st.roll, Math.atan((speed * turnRate) / 9.81), 1 - Math.exp(-dt * 2));
    // Gliding sinks slowly, flapping climbs back.
    const bob = Math.sin(st.clock * 0.25) * 4;
    group.position.set(point.x, WATER_LEVEL + level + bob, point.z);
    group.rotation.set(-0.05 + st.flap * -0.06, st.yaw, st.roll, 'YXZ');
    flap.setEffectiveWeight(st.flap);
    glide.setEffectiveWeight(1 - st.flap);
  });

  return (
    <group ref={root}>
      <primitive object={model} />
    </group>
  );
}

for (const f of Object.values(FAUNA)) useGLTF.preload(f.model.url);

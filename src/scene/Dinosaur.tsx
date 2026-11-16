import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { CatmullRomCurve3, Group, LoopOnce, LoopRepeat, MathUtils, Vector3, type AnimationAction, type Mesh, type MeshStandardMaterial } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SPECIES, type ClipName, type SpeciesId } from '../data/species';
import { leaders, useApp } from '../state';
import { terrainHeight } from '../world/terrain';

interface Behaviour {
  walkSeconds: number;
  restSeconds: number;
  /** Playback rate of the walk clip; ground speed is scaled with it so feet do not slide. */
  walkRate: number;
  /** Every n-th rest also plays the species' one-shot action. */
  actionEvery: number;
}

const BEHAVIOUR: Record<SpeciesId, Behaviour> = {
  trex: { walkSeconds: 16, restSeconds: 9, walkRate: 0.78, actionEvery: 2 },
  triceratops: { walkSeconds: 10, restSeconds: 14, walkRate: 1.2, actionEvery: 3 },
};

const FADE = 0.7;

interface Props {
  species: SpeciesId;
  path: [number, number][];
  start: number;
  phase: number;
  lateral?: number;
  leader?: boolean;
}

type Mode = 'walk' | 'rest' | 'action';

export function Dinosaur({ species, path, start, phase, lateral = 0, leader = false }: Props) {
  const info = SPECIES[species];
  const behaviour = BEHAVIOUR[species];
  const gltf = useGLTF(info.model.url);
  const root = useRef<Group>(null);
  const model = useMemo(() => {
    const scene = clone(gltf.scene);
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Skinned bounds are computed in the bind pose; walking poses leave them.
      mesh.frustumCulled = false;
      const material = (mesh.material as MeshStandardMaterial).clone();
      // The sources' gloss maps read as wet plastic under sunlight; use a constant skin roughness.
      material.roughnessMap = null;
      material.metalnessMap = null;
      material.roughness = 0.68;
      material.metalness = 0;
      material.envMapIntensity = 0.85;
      mesh.material = material;
    });
    return scene;
  }, [gltf.scene]);
  const { actions, mixer } = useAnimations(gltf.animations, root);

  const curve = useMemo(
    () => new CatmullRomCurve3(path.map(([x, z]) => new Vector3(x, 0, z)), true, 'centripetal'),
    [path],
  );
  const state = useRef({
    distance: start * curve.getLength(),
    mode: 'walk' as Mode,
    clock: phase,
    rests: 0,
    yaw: 0,
    pitch: 0,
    current: undefined as AnimationAction | undefined,
  });

  const focus = useApp((s) => s.focus);
  const requested = useApp((s) => s.behaviour);
  const actionNonce = useApp((s) => s.actionNonce);

  const play = (name: ClipName, once = false) => {
    const next = actions[name];
    const s = state.current;
    if (!next || next === s.current) return;
    next.reset();
    next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.timeScale = name === 'Walk' ? behaviour.walkRate : 1;
    next.fadeIn(FADE).play();
    s.current?.fadeOut(FADE);
    s.current = next;
  };

  const setMode = (mode: Mode) => {
    const s = state.current;
    s.mode = mode;
    s.clock = 0;
    if (mode === 'walk') play('Walk');
    else if (mode === 'rest') play(info.restClip);
    else play(info.actionClip, true);
  };

  // Initial pose; start some individuals resting so groups are not synchronised.
  useEffect(() => {
    const s = state.current;
    const cycle = behaviour.walkSeconds + behaviour.restSeconds;
    const t = phase % cycle;
    setMode(t < behaviour.walkSeconds ? 'walk' : 'rest');
    s.clock = t < behaviour.walkSeconds ? t : t - behaviour.walkSeconds;
    // Desynchronise identical clips between individuals.
    if (s.current) s.current.time = (phase * 0.37) % s.current.getClip().duration;
    place(0, true);
    if (leader) leaders.set(species, root.current!);
    return () => {
      if (leader && leaders.get(species) === root.current) leaders.delete(species);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  // Return to the behaviour cycle when a one-shot action finishes.
  useEffect(() => {
    const onFinished = () => {
      if (state.current.mode === 'action') setMode(requested === 'walk' ? 'walk' : 'rest');
    };
    mixer.addEventListener('finished', onFinished);
    return () => mixer.removeEventListener('finished', onFinished);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixer, requested]);

  // User-requested action (roar / look up) for the focused species.
  useEffect(() => {
    if (actionNonce > 0 && species === focus) setMode('action');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionNonce]);

  // Explicit walk/rest overrides from the UI apply to the focused species.
  useEffect(() => {
    const s = state.current;
    if (species !== focus || s.mode === 'action') return;
    if (requested === 'walk' && s.mode !== 'walk') setMode('walk');
    if (requested === 'rest' && s.mode !== 'rest') setMode('rest');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, focus]);

  const position = useMemo(() => new Vector3(), []);
  const tangent = useMemo(() => new Vector3(), []);

  /** Advance along the path and conform to the terrain; snap on the first call. */
  const place = (delta: number, snap = false) => {
    const s = state.current;
    const group = root.current;
    if (!group) return;
    // Ground speed follows the walk clip's blend weight so starts and stops ease in.
    const walk = actions.Walk;
    const weight = walk?.isRunning() ? walk.getEffectiveWeight() : 0;
    const length = curve.getLength();
    s.distance = (s.distance + info.model.walkSpeed * behaviour.walkRate * weight * delta) % length;
    const u = s.distance / length;
    curve.getPointAt(u, position);
    curve.getTangentAt(u, tangent);
    position.x += -tangent.z * lateral;
    position.z += tangent.x * lateral;

    const targetYaw = Math.atan2(tangent.x, tangent.z);
    const yawDelta = Math.atan2(Math.sin(targetYaw - s.yaw), Math.cos(targetYaw - s.yaw));
    s.yaw = snap ? targetYaw : s.yaw + yawDelta * Math.min(1, delta * 1.5);

    // Pitch the body to the slope between front and hind feet.
    const reach = info.model.lengthM * 0.3;
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    const front = terrainHeight(position.x + fx * reach, position.z + fz * reach);
    const back = terrainHeight(position.x - fx * reach, position.z - fz * reach);
    const targetPitch = -Math.atan2(front - back, reach * 2);
    s.pitch = snap ? targetPitch : MathUtils.lerp(s.pitch, targetPitch, Math.min(1, delta * 3));

    group.position.set(position.x, Math.min(front, back, terrainHeight(position.x, position.z)), position.z);
    group.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
    group.updateMatrixWorld();
  };

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const s = state.current;
    s.clock += delta;

    const override = species === focus ? requested : 'auto';
    if (override === 'auto') {
      if (s.mode === 'walk' && s.clock > behaviour.walkSeconds) {
        s.rests += 1;
        setMode(s.rests % behaviour.actionEvery === 0 ? 'action' : 'rest');
      } else if (s.mode === 'rest' && s.clock > behaviour.restSeconds) {
        setMode('walk');
      }
    }
    place(delta);
  });

  return (
    <group ref={root}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(SPECIES.trex.model.url);
useGLTF.preload(SPECIES.triceratops.model.url);

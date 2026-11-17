import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import {
  CatmullRomCurve3,
  Group,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  Object3D,
  Quaternion,
  Vector3,
  type AnimationAction,
  type Mesh,
  type MeshStandardMaterial,
} from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SPECIES, type SpeciesId } from '../data/species';
import { agents, leaders, useApp, type Agent } from '../state';
import { mulberry32, terrainHeight } from '../world/terrain';
import { LegGait, type GaitSpec } from './legGait';

// ----------------------------------------------------------------------------------------------
// Per-species locomotion and rig settings
// ----------------------------------------------------------------------------------------------

interface Gait {
  /** Cruising ground speed, m/s. */
  cruise: number;
  /** Tightest turn the animal makes while walking, metres. */
  minTurnRadius: number;
  /** Seconds to go from standing to cruising (and back). */
  rampSeconds: number;
  travelSeconds: [number, number];
  pauseSeconds: [number, number];
  /** Chance that a pause starts with the species' one-shot action. */
  actionChance: number;
  /** Foot positions along the body (metres from the pivot, +forward) used to fit the body to the ground. */
  feet: { front: number; back: number; width: number };
}

const GAIT: Record<SpeciesId, Gait> = {
  // ~1.3 m/s preferred walking speed from tail natural frequency (van Bijlert et al. 2021).
  trex: {
    cruise: 1.5, minTurnRadius: 7, rampSeconds: 2.2, travelSeconds: [14, 28], pauseSeconds: [6, 12], actionChance: 0.3,
    feet: { front: 0.25, back: -0.25, width: 2.1 },
  },
  triceratops: {
    cruise: 1.05, minTurnRadius: 4.5, rampSeconds: 1.8, travelSeconds: [7, 16], pauseSeconds: [10, 22], actionChance: 0.12,
    feet: { front: 0.45, back: -1.7, width: 1.3 },
  },
};

interface RigSpec {
  /** Body bones that bend into a turn, with their share of the bend. */
  spine: [string, number][];
  /** Bones that turn the head towards a look target, with their share. */
  neck: [string, number][];
  /** Tail chain from base to tip. */
  tail: string[];
  /** Extra upward pitch per tail bone (degrees), to keep the tail off the ground. */
  tailLift: number[];
  /** Bone that carries the breathing motion. */
  chest?: string;
  /** Head bone used as the eye position for look-at. */
  head: string;
  /** Look limits in radians. */
  lookYaw: number;
  lookPitch: number;
  /** Lateral tail sway at stride frequency, radians at the tip. */
  tailSway: number;
  /** Procedural planted-foot leg gait that replaces the clip's leg motion while walking. */
  gait?: GaitSpec;
  /** Jaw bone and a clip whose first frame has the mouth closed; the walk clips leave it hanging open. */
  mouth?: { bone: string; clip: string; /** Extra closing beyond that frame, degrees. */ close?: number };
  /** A held frame of a clip used as a head-up "watch" pose that alternates with the rest clip during pauses. */
  watch?: { clip: string; time: number };
}

const RIG: Record<SpeciesId, RigSpec> = {
  trex: {
    spine: [['T-Rex_Spine2_012', 0.4], ['T-Rex_Chest_013', 0.6]],
    neck: [['T-Rex_Chest_013', 0.15], ['T-Rex_Head_021', 0.85]],
    tail: ['T-Rex_Tail1_02', 'T-Rex_Tail2_03', 'T-Rex_Tail3_04', 'T-Rex_Tail4_05', 'T-Rex_Tail5_06', 'T-Rex_Tail6_07', 'T-Rex_Tail7_08', 'T-Rex_Tail8_09'],
    tailLift: [0, 0, 0, 0, 0, 0, 0, 0],
    chest: 'T-Rex_Chest_013',
    head: 'T-Rex_Head_021',
    lookYaw: 0.75,
    lookPitch: 0.3,
    tailSway: 0.05,
    mouth: { bone: 'T-Rex_Jew_022', clip: 'Idle' },
    // The source walk is usable on flat ground, but its feet float or sink on slopes and it cannot
    // turn on the spot, so the legs are driven by the same planted-foot system as Triceratops.
    // About 0.4 steps per second per leg at cruise: a ~3.7 m stride, close to the ~3.9 m implied by
    // the preferred-speed estimate (1.28 m/s at 0.33 Hz).
    gait: {
      duty: 0.6,
      frequency: 0.42,
      cruise: 1.5,
      legs: [
        { upper: 'T-Rex_LLeg1_035', lower: 'T-Rex_LLeg2_036', end: 'T-Rex_LLegAnkle_037', contact: 'T-Rex_LLegDigit11_038', phase: 0, lift: 0.32 },
        { upper: 'T-Rex_RLeg1_029', lower: 'T-Rex_RLeg2_030', end: 'T-Rex_RLegAnkle_031', contact: 'T-Rex_RLegDigit11_032', phase: 0.5, lift: 0.32 },
      ],
    },
  },
  triceratops: {
    spine: [],
    neck: [['Bone.001_Armature', 0.45], ['Bone.002_Armature', 0.55]],
    tail: ['Bone.008_Armature', 'Bone.010_Armature', 'Bone.009_Armature', 'Bone.011_Armature'],
    // The source model's tail droops until the tip scrapes the ground mid-stride. Ceratopsid
    // tails were held clear of the ground (no tail-drag marks in trackways).
    tailLift: [5, 5, 4, 2],
    chest: 'Bone.002_Armature',
    head: 'Bone.032_Armature',
    lookYaw: 0.55,
    lookPitch: 0.22,
    tailSway: 0.06,
    mouth: { bone: 'Bone.004_Armature', clip: 'Alert', close: 10 },
    // Head raised and slightly turned (0.7 s into the alert clip): looking around between bites.
    watch: { clip: 'Alert', time: 0.7 },
    // The source walk barely plants its feet and its front feet over-stride the hind feet ~2x,
    // so the legs are driven procedurally while walking: a lateral-sequence walk (LH, LF, RH, RF).
    gait: {
      duty: 0.65,
      // 0.62 left the front feet ~15 cm out of reach at the end of stance (they dragged); shorter
      // steps keep every foot within reach.
      frequency: 0.72,
      cruise: 1.05,
      legs: [
        { upper: 'Bone.019_Armature', lower: 'Bone.023_Armature', end: 'Bone.027_Armature', contact: 'Bone.031_Armature', phase: 0, lift: 0.16 },
        { upper: 'Bone.018_Armature', lower: 'Bone.022_Armature', end: 'Bone.026_Armature', contact: 'Bone.030_Armature', phase: 0.25, lift: 0.13 },
        { upper: 'Bone.017_Armature', lower: 'Bone.021_Armature', end: 'Bone.025_Armature', contact: 'Bone.029_Armature', phase: 0.5, lift: 0.16 },
        { upper: 'Bone.016_Armature', lower: 'Bone.020_Armature', end: 'Bone.024_Armature', contact: 'Bone.028_Armature', phase: 0.75, lift: 0.13 },
      ],
    },
  },
};

/** `?noproc` disables the procedural bone layers, for comparing against the raw clips. */
const NO_PROCEDURAL = new URLSearchParams(location.search).has('noproc');
const DEBUG = new URLSearchParams(location.search).has('debug');

/** three.js strips '.', ':', '/', '[' and ']' from node names when loading glTF. */
const sanitize = (name: string) => name.replace(/\s/g, '_').replace(/[[\].:/]/g, '');

// ----------------------------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------------------------

const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0); // +angle pitches the nose down, the tail up
const _q = new Quaternion();
const _parent = new Quaternion();
const _axis = new Vector3();
const _v = new Vector3();

/** Rotate a bone about an axis given in the animal's own frame (+Z forward, +Y up). */
function rotateBone(bone: Object3D, axis: Vector3, angle: number, body: Quaternion) {
  if (Math.abs(angle) < 1e-5 || !bone.parent) return;
  bone.parent.getWorldQuaternion(_parent).invert();
  _axis.copy(axis).applyQuaternion(body).applyQuaternion(_parent);
  bone.quaternion.premultiply(_q.setFromAxisAngle(_axis, angle));
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (x: number) => {
  const t = MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
/** Exponential approach that is frame-rate independent. */
const damp = (current: number, target: number, rate: number, dt: number) => MathUtils.lerp(current, target, 1 - Math.exp(-rate * dt));

/** Critically damped spring (value, velocity). */
interface Spring {
  x: number;
  v: number;
}
function springTo(s: Spring, target: number, stiffness: number, damping: number, dt: number) {
  const a = stiffness * (target - s.x) - damping * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

function hashKey(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ----------------------------------------------------------------------------------------------

interface Props {
  id: string;
  species: SpeciesId;
  path: [number, number][];
  start: number;
  phase: number;
  lateral?: number;
  leader?: boolean;
}

type Mode = 'travel' | 'pause' | 'action';

export function Dinosaur({ id, species, path, start, phase, lateral = 0, leader = false }: Props) {
  const info = SPECIES[species];
  const gait = GAIT[species];
  const rigSpec = RIG[species];
  const gltf = useGLTF(info.model.url);
  const root = useRef<Group>(null);
  const camera = useThree((s) => s.camera);

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
      // The sources' gloss maps read as wet plastic under sunlight; use a constant skin roughness
      // with a faint sheen from the environment.
      material.roughnessMap = null;
      material.metalnessMap = null;
      material.roughness = 0.74;
      material.metalness = 0;
      material.envMapIntensity = 0.8;
      mesh.material = material;
    });
    return scene;
  }, [gltf.scene]);

  const bones = useMemo(() => {
    const find = (name: string) => model.getObjectByName(sanitize(name)) ?? null;
    const list = (entries: [string, number][]) =>
      entries.map(([name, share]) => ({ bone: find(name), share })).filter((b): b is { bone: Object3D; share: number } => !!b.bone);
    return {
      spine: list(rigSpec.spine),
      neck: list(rigSpec.neck),
      tail: rigSpec.tail.map(find).filter((b): b is Object3D => !!b),
      chest: rigSpec.chest ? find(rigSpec.chest) : null,
      head: find(rigSpec.head),
      gait: rigSpec.gait ? new LegGait(model, rigSpec.gait, find) : null,
      mouth: (() => {
        const mouth = rigSpec.mouth;
        if (!mouth) return null;
        const bone = find(mouth.bone);
        const clip = gltf.animations.find((c) => c.name === mouth.clip);
        const track = clip?.tracks.find((t) => t.name === `${sanitize(mouth.bone)}.quaternion`);
        if (!bone || !track) return null;
        const v = track.values;
        return { bone, closed: new Quaternion(v[0], v[1], v[2], v[3]), close: MathUtils.degToRad(mouth.close ?? 0) };
      })(),
    };
  }, [model, rigSpec, gltf.animations]);

  const { actions, mixer } = useAnimations(gltf.animations, root);

  /** Dense samples of the path, offset sideways for this individual. */
  const track = useMemo(() => {
    const curve = new CatmullRomCurve3(path.map(([x, z]) => new Vector3(x, 0, z)), true, 'centripetal');
    const count = Math.ceil(curve.getLength() / 0.5);
    const points = curve.getSpacedPoints(count).slice(0, count);
    const tangent = new Vector3();
    return points.map((p, i) => {
      curve.getTangentAt(i / count, tangent);
      return new Vector3(p.x - tangent.z * lateral, 0, p.z + tangent.x * lateral);
    });
  }, [path, lateral]);

  const random = useMemo(() => mulberry32(hashKey(id) + Math.round(phase * 1000)), [id, phase]);
  const range = ([lo, hi]: [number, number]) => lo + (hi - lo) * random();

  const state = useRef({
    mode: 'travel' as Mode,
    timer: 0,
    duration: 10,
    gait: 1,
    speed: 0,
    heading: 0,
    yawRate: 0,
    index: 0,
    position: new Vector3(),
    y: 0,
    pitch: 0,
    roll: 0,
    resumeMode: 'travel' as Exclude<Mode, 'action'>,
    lookYaw: { x: 0, v: 0 } as Spring,
    lookPitch: { x: 0, v: 0 } as Spring,
    lookWeight: 0,
    lookTarget: new Vector3(),
    lookTargetKind: 'ahead' as 'ahead' | 'point' | 'agent' | 'camera',
    lookAgent: '' as string,
    nextLook: 0,
    alarmCooldown: 0,
    /** Watch pose (head up) blend during pauses, and when to toggle it next. */
    watching: false,
    watchWeight: 0,
    nextWatch: 0,
    tail: [] as { yaw: Spring; pitch: Spring }[],
    clock: 0,
  });

  const focus = useApp((s) => s.focus);
  const requested = useApp((s) => s.behaviour);
  const actionNonce = useApp((s) => s.actionNonce);
  const override = species === focus ? requested : 'auto';
  const overrideRef = useRef(override);
  overrideRef.current = override;

  // drei creates actions lazily, bound to `root.current` at the time of access, so they are
  // resolved after mount (in the start effect below), never during render.
  const clips = useRef<{ walk?: AnimationAction; rest?: AnimationAction; action?: AnimationAction; watch?: AnimationAction }>({});

  const beginMode = (mode: Mode) => {
    const s = state.current;
    const { action } = clips.current;
    if (mode === 'action') {
      if (!action) return;
      if (s.mode !== 'action') s.resumeMode = s.mode === 'travel' ? 'travel' : 'pause';
      action.reset();
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.fadeIn(0.6).play();
    } else {
      s.duration = range(mode === 'travel' ? gait.travelSeconds : gait.pauseSeconds);
    }
    s.mode = mode;
    s.timer = 0;
  };

  // Start: place on the path, start the looping clips, and desynchronise individuals.
  useEffect(() => {
    clips.current = { walk: actions.Walk ?? undefined, rest: actions[info.restClip] ?? undefined, action: actions[info.actionClip] ?? undefined };
    if (rigSpec.watch && root.current) {
      // A renamed copy gets its own action, so the one-shot clip stays free.
      const source = gltf.animations.find((c) => c.name === rigSpec.watch!.clip);
      if (source) {
        const copy = source.clone();
        copy.name = `${source.name}-watch`;
        const watch = mixer.clipAction(copy, root.current);
        watch.play();
        watch.paused = true;
        watch.time = rigSpec.watch.time;
        watch.setEffectiveWeight(0);
        clips.current.watch = watch;
      }
    }
    if (DEBUG) ((window as unknown as { __dinos: unknown[] }).__dinos ??= []).push({ id, mixer, clips: clips.current, state: state.current, bones });
    const { walk, rest } = clips.current;
    const s = state.current;
    s.index = Math.floor(start * track.length) % track.length;
    s.position.copy(track[s.index]);
    const next = track[(s.index + 4) % track.length];
    s.heading = Math.atan2(next.x - s.position.x, next.z - s.position.z);
    s.tail = bones.tail.map(() => ({ yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 } }));
    const startTravel = random() < 0.55;
    beginMode(startTravel ? 'travel' : 'pause');
    s.timer = random() * s.duration * 0.7;
    s.gait = startTravel ? 1 : 0;
    s.speed = startTravel ? gait.cruise : 0;
    for (const clip of [walk, rest]) {
      if (!clip) continue;
      clip.reset().setLoop(LoopRepeat, Infinity).play();
      clip.time = random() * clip.getClip().duration;
      clip.setEffectiveWeight(0);
    }
    place(0, true);
    bones.gait?.reset(root.current!, s.speed);
    const agent: Agent = { species, position: s.position, heading: s.heading };
    agents.set(id, agent);
    if (leader) leaders.set(species, root.current!);
    return () => {
      agents.delete(id);
      if (leader && leaders.get(species) === root.current) leaders.delete(species);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, track]);

  // A finished one-shot fades out and the animal resumes what it was doing.
  useEffect(() => {
    const onFinished = (event: { action: AnimationAction }) => {
      const { action } = clips.current;
      if (!action || event.action !== action) return;
      action.fadeOut(0.8);
      const s = state.current;
      if (s.mode === 'action') {
        const o = overrideRef.current;
        beginMode(o === 'walk' ? 'travel' : o === 'rest' ? 'pause' : s.resumeMode);
      }
    };
    mixer.addEventListener('finished', onFinished as never);
    return () => mixer.removeEventListener('finished', onFinished as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixer]);

  // User-requested action (roar / look up) for the focused species.
  useEffect(() => {
    if (actionNonce > 0 && species === focus) beginMode('action');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionNonce]);

  // Explicit walk/stay overrides.
  useEffect(() => {
    const s = state.current;
    if (s.mode === 'action') return;
    if (override === 'walk' && s.mode !== 'travel') beginMode('travel');
    if (override === 'rest' && s.mode !== 'pause') beginMode('pause');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override]);

  /** Fit the body to the ground: height at the feet, pitch along the body, roll across it, lean into turns. */
  const place = (dt: number, snap = false) => {
    const s = state.current;
    const group = root.current;
    if (!group) return;
    const { front, back, width } = gait.feet;
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    const { x, z } = s.position;
    const hf = terrainHeight(x + fx * front, z + fz * front);
    const hb = terrainHeight(x + fx * back, z + fz * back);
    const hl = terrainHeight(x + fz * width * 0.5, z - fx * width * 0.5);
    const hr = terrainHeight(x - fz * width * 0.5, z + fx * width * 0.5);
    const span = Math.max(front - back, 1.5);
    const pitch = -Math.atan2(hf - hb, span);
    // Height under the pivot on the line between the feet.
    const y = hb + (hf - hb) * (-back / (front - back || 1));
    // +roll raises the left (+X) side; lean into turns (a left turn has positive yaw rate).
    const roll = Math.atan2(hl - hr, width) * 0.6 - MathUtils.clamp(s.speed * s.yawRate * 0.05, -0.06, 0.06);
    if (snap) {
      s.y = y;
      s.pitch = pitch;
      s.roll = roll;
    } else {
      s.y = damp(s.y, y, 10, dt);
      s.pitch = damp(s.pitch, pitch, 5, dt);
      s.roll = damp(s.roll, roll, 4, dt);
    }
    group.position.set(x, s.y, z);
    group.rotation.set(s.pitch, s.heading, s.roll, 'YXZ');
    group.updateMatrixWorld();
  };

  /** Pick something to look at: the path ahead, a random point, another animal, or the viewer. */
  const chooseLook = () => {
    const s = state.current;
    const r = random();
    s.nextLook = s.clock + 2.5 + random() * 5;
    let nearest = '';
    let best = 45;
    for (const [key, agent] of agents) {
      if (key === id) continue;
      const d = agent.position.distanceTo(s.position);
      if (d < best) {
        best = d;
        nearest = key;
      }
    }
    if (nearest && r < 0.3) {
      s.lookTargetKind = 'agent';
      s.lookAgent = nearest;
    } else if (r < 0.42 && s.mode === 'pause') {
      s.lookTargetKind = 'camera';
    } else if (r < 0.7 && s.mode === 'pause') {
      s.lookTargetKind = 'point';
      const a = s.heading + (random() - 0.5) * 2.4;
      s.lookTarget.set(s.position.x + Math.sin(a) * 25, s.position.y + 2 + random() * 3, s.position.z + Math.cos(a) * 25);
    } else {
      s.lookTargetKind = 'ahead';
    }
  };

  const body = useMemo(() => new Quaternion(), []);
  const headPos = useMemo(() => new Vector3(), []);
  const local = useMemo(() => new Vector3(), []);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const s = state.current;
    const group = root.current;
    const { walk, rest, action, watch } = clips.current;
    if (!group || !walk) return;
    s.clock += dt;
    s.timer += dt;
    s.alarmCooldown -= dt;

    // ---------------------------------------------------------------- behaviour
    let alarm: string | null = null;
    if (species === 'triceratops') {
      for (const [key, agent] of agents) {
        if (agent.species === 'trex' && agent.position.distanceTo(s.position) < 60) alarm = key;
      }
    }
    if (alarm && s.alarmCooldown <= 0 && s.mode !== 'action') {
      s.alarmCooldown = 30;
      s.lookTargetKind = 'agent';
      s.lookAgent = alarm;
      s.nextLook = s.clock + 8;
      beginMode('action');
    } else if (override === 'auto' && s.mode !== 'action' && s.timer > s.duration) {
      if (s.mode === 'travel') beginMode(random() < gait.actionChance ? 'action' : 'pause');
      else beginMode('travel');
    }
    if (s.clock > s.nextLook) chooseLook();

    // ---------------------------------------------------------------- locomotion
    const travelling = s.mode === 'travel';
    s.gait = MathUtils.clamp(s.gait + (travelling ? dt : -dt) / gait.rampSeconds, 0, 1);
    const g = smooth(s.gait);

    // Pure pursuit: steer towards a point a little way along the track.
    const n = track.length;
    for (let k = 0, best = Infinity, bestIndex = s.index; k < 24; k++) {
      const i = (s.index + k) % n;
      const d = track[i].distanceToSquared(s.position);
      if (d < best) {
        best = d;
        bestIndex = i;
      }
      if (k === 23) s.index = bestIndex;
    }
    const lookahead = Math.round((3 + s.speed * 2.5) / 0.5);
    const aim = track[(s.index + lookahead) % n];
    const desired = Math.atan2(aim.x - s.position.x, aim.z - s.position.z);
    const error = wrapAngle(desired - s.heading);
    // Slow down for bends, and for an animal close ahead on the same track.
    // With procedural legs a sharp heading change is made mostly on the spot, stepping round.
    const sharp = !!bones.gait && Math.abs(error) > 1.0;
    const bend = sharp ? 0.12 : MathUtils.clamp(1 - Math.abs(error) * 0.9, 0.45, 1);
    let spacing = 1;
    for (const [key, agent] of agents) {
      if (key === id) continue;
      _v.copy(agent.position).sub(s.position);
      const d = _v.length();
      const ahead = (_v.x * Math.sin(s.heading) + _v.z * Math.cos(s.heading)) / (d || 1);
      if (ahead > 0.6 && d < 12) spacing = Math.min(spacing, MathUtils.clamp((d - 5) / 7, 0, 1));
    }
    const target = gait.cruise * g * bend * spacing;
    s.speed = damp(s.speed, target, 2.5, dt);
    // Turning needs forward motion (the walk has no turn-on-the-spot); limit the rate by the turn radius.
    const turningOnSpot = sharp && travelling;
    const maxRate = s.speed / gait.minTurnRadius + 0.015 + (turningOnSpot ? 0.28 : 0);
    const turn = MathUtils.clamp(error * 1.6, -maxRate, maxRate);
    s.heading = wrapAngle(s.heading + turn * dt);
    s.yawRate = damp(s.yawRate, turn, 4, dt);
    s.position.x += Math.sin(s.heading) * s.speed * dt;
    s.position.z += Math.cos(s.heading) * s.speed * dt;
    const agent = agents.get(id);
    if (agent) agent.heading = s.heading;
    place(dt);

    // ---------------------------------------------------------------- clip weights
    // The walk clip's stride is matched to ground speed so the feet do not slide; while blending
    // with the rest pose the stride shrinks, so playback is scaled by the blend weight too.
    // A fresh, never-played action reports weight 1, so only count it while the mixer runs it.
    const actionWeight = action && action.isScheduled() && action.enabled ? action.getEffectiveWeight() : 0;
    const walkWeight = smooth((s.speed / gait.cruise - 0.05) / 0.45);
    if (walk) {
      walk.setEffectiveWeight((1 - actionWeight) * walkWeight);
      // With procedural legs the clip only supplies body, arm and tail rhythm: sync it to the steps.
      walk.timeScale = bones.gait
        ? bones.gait.frequency(Math.max(s.speed, 0.1)) * walk.getClip().duration
        : MathUtils.clamp(s.speed / (info.model.walkSpeed * Math.max(walkWeight, 0.35)), 0.05, 2);
    }
    // During pauses some species alternate the rest clip with a head-up watch pose.
    if (watch) {
      if (s.mode !== 'pause') s.watching = false;
      else if (s.clock > s.nextWatch) {
        s.watching = !s.watching;
        s.nextWatch = s.clock + (s.watching ? range([3, 7]) : range([5, 11]));
      }
      s.watchWeight = damp(s.watchWeight, s.watching ? 1 : 0, 1.6, dt);
      watch.setEffectiveWeight((1 - actionWeight) * (1 - walkWeight) * s.watchWeight);
    }
    if (rest) rest.setEffectiveWeight((1 - actionWeight) * (1 - walkWeight) * (1 - (watch ? s.watchWeight : 0)));

    // ---------------------------------------------------------------- procedural layers (after the mixer)
    if (NO_PROCEDURAL) return;
    group.getWorldQuaternion(body);
    const stride = walk ? (walk.time / walk.getClip().duration) * Math.PI * 2 : 0;

    // Close the mouth while walking (the source walk clips leave it open).
    if (bones.mouth) {
      const k = walkWeight * (1 - actionWeight);
      bones.mouth.bone.quaternion.slerp(bones.mouth.closed, k * 0.9);
      rotateBone(bones.mouth.bone, RIGHT, -bones.mouth.close * k, body);
    }

    // Legs: procedural planted-foot gait over the clip while walking (see legGait.ts).
    // The legs stay on the planted-foot system at all times: standing, grazing and during one-shot
    // clips the feet stay where they last landed. Blending back to the clips' leg poses made the
    // feet shuffle across the ground whenever an animal stopped or reacted.
    bones.gait?.update(group, s.speed, dt, 1, turningOnSpot);

    // Spine bends into the turn.
    const bendAngle = MathUtils.clamp(s.yawRate * 1.1, -0.22, 0.22);
    for (const { bone, share } of bones.spine) rotateBone(bone, UP, bendAngle * share, body);

    // Breathing: slow chest rise, deeper at rest.
    if (bones.chest) rotateBone(bones.chest, RIGHT, Math.sin(s.clock * (species === 'trex' ? 1.3 : 1.7)) * 0.012 * (1.3 - walkWeight), body);

    // Head look-at: the target in the body frame becomes yaw/pitch, sprung and split over the neck.
    let targetYaw = 0;
    let targetPitch = 0;
    const grazing = species === 'triceratops' && s.mode === 'pause' && s.watchWeight < 0.5;
    let weight = s.mode === 'action' ? 0.35 : s.mode === 'pause' ? (grazing ? 0.35 : 1) : 0.7;
    if (bones.head) {
      bones.head.getWorldPosition(headPos);
      let have = true;
      if (s.lookTargetKind === 'agent') {
        const other = agents.get(s.lookAgent);
        if (other) local.copy(other.position).setY(other.position.y + 2.5);
        else have = false;
      } else if (s.lookTargetKind === 'camera') local.copy(camera.position);
      else if (s.lookTargetKind === 'point') local.copy(s.lookTarget);
      else have = false;
      if (have) {
        local.sub(headPos).applyQuaternion(_q.copy(body).invert());
        targetYaw = Math.atan2(local.x, local.z);
        targetPitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
        // Out of reach behind: give up rather than snap.
        if (Math.abs(targetYaw) > 2.2) {
          targetYaw = 0;
          targetPitch = 0;
        }
      }
    }
    // While walking, anticipate the turn with the head.
    targetYaw = MathUtils.clamp(targetYaw + s.yawRate * 0.9, -rigSpec.lookYaw, rigSpec.lookYaw);
    targetPitch = MathUtils.clamp(targetPitch, -rigSpec.lookPitch, rigSpec.lookPitch * 0.8);
    if (grazing) targetPitch = 0; // grazing keeps the head low
    s.lookWeight = damp(s.lookWeight, weight, 2, dt);
    springTo(s.lookYaw, targetYaw, 18, 8.5, dt);
    springTo(s.lookPitch, targetPitch, 18, 8.5, dt);
    weight = s.lookWeight;
    for (const { bone, share } of bones.neck) {
      rotateBone(bone, UP, (s.lookYaw.x * share + bendAngle * 0.5 * share) * weight + bendAngle * 0.3 * share * (1 - weight), body);
      rotateBone(bone, RIGHT, -s.lookPitch.x * share * weight, body);
    }

    // Tail: springs that trail the body through turns, sway with the stride and stay off the ground.
    const tailCount = bones.tail.length;
    bones.tail.forEach((bone, i) => {
      const t = i / Math.max(tailCount - 1, 1);
      const spring = s.tail[i];
      const yawTarget = -s.yawRate * (0.16 + 0.1 * t) + Math.sin(stride + 1.2 + t * 1.4) * (rigSpec.tailSway / tailCount) * 2 * walkWeight;
      const pitchTarget = Math.sin(stride * 2 + t * 1.1) * 0.012 * walkWeight;
      const stiffness = 30 / (1 + t * 1.6);
      springTo(spring.yaw, yawTarget, stiffness, 2 * Math.sqrt(stiffness) * 0.55, dt);
      springTo(spring.pitch, pitchTarget, stiffness, 2 * Math.sqrt(stiffness) * 0.7, dt);
      rotateBone(bone, UP, spring.yaw.x, body);
      rotateBone(bone, RIGHT, spring.pitch.x + MathUtils.degToRad(rigSpec.tailLift[i] ?? 0), body);
    });
  });

  return (
    <group ref={root}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(SPECIES.trex.model.url);
useGLTF.preload(SPECIES.triceratops.model.url);

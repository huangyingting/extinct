import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, OrbitControls, Sparkles } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Color, DirectionalLight, Euler, LinearSRGBColorSpace, MathUtils, Object3D, PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { OutdoorScene } from '../data/scenes';
import { focusSize } from '../data/fauna';
import { leaders, useApp } from '../state';
import { FOREST_CENTRE, setWorld, terrainHeight } from '../world/terrain';
import { Flyer, Swimmer } from './Fauna';
import { Soundscape } from '../audio/Soundscape';
import { Grade } from '../three/Grade';
import { Birds } from './Birds';
import { Dinosaur } from './Dinosaur';
import { ImpactSky } from './ImpactSky';
import { Terrain } from './Terrain';
import { Vegetation } from './Vegetation';
import { Water } from './Water';

// Khronos PBR Neutral keeps sky and foliage colour that AgX washed out (compared side by side on
// 2026-11-17); `?tm=agx|aces|neutral` switches for comparison.
const TONE_MAPPING = {
  agx: ToneMappingMode.AGX,
  aces: ToneMappingMode.ACES_FILMIC,
  neutral: ToneMappingMode.NEUTRAL,
}[new URLSearchParams(location.search).get('tm') ?? 'neutral'] ?? ToneMappingMode.NEUTRAL;

/** Keeps the orbit target on the focused animal while preserving the user's orbit offset. */
function CameraRig({ scene }: { scene: OutdoorScene }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const focus = useApp((s) => s.focus);
  const follow = useApp((s) => s.follow);
  const tour = useApp((s) => s.tour);
  const setTour = useApp((s) => s.setTour);
  const desired = useMemo(() => new Vector3(), []);
  const delta = useMemo(() => new Vector3(), []);

  // Anything followable: dinosaurs or the other animals.
  const hasAnimals = scene.animals.length > 0 || (scene.fauna?.length ?? 0) > 0;
  useEffect(() => {
    // Leaders register in their own effects, which run before this sibling's.
    const c = controls.current;
    if (!c) return;
    const leader = scene.camera.focus ? leaders.get(scene.camera.focus) : undefined;
    if (leader && scene.camera.focus) {
      c.target.copy(leader.position);
      c.target.y += focusSize(scene.camera.focus).height * 0.55;
    } else if (scene.camera.target) {
      const [tx, tz] = scene.camera.target;
      c.target.set(tx, terrainHeight(tx, tz) + 2.5, tz);
    } else return;
    const [ox, oy, oz] = scene.camera.offset;
    const x = c.target.x + ox;
    const z = c.target.z + oz;
    camera.position.set(x, terrainHeight(x, z) + oy, z);
    camera.lookAt(c.target);
    c.update();
  }, [scene, camera]);

  // Keep the followed animal centred in the area not covered by the side panel.
  const panelOpen = useApp((s) => s.panel !== null);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const shift = panelOpen && size.width > 760 ? Math.min(210, size.width * 0.16) : 0;
    const perspective = camera as PerspectiveCamera;
    perspective.setViewOffset(size.width, size.height, shift, 0, size.width, size.height);
    perspective.updateProjectionMatrix();
    return () => perspective.clearViewOffset();
  }, [camera, panelOpen, size.width, size.height]);

  // On switching to another animal, pull the camera in to a distance that suits its size.
  const reframe = useRef(false);
  useEffect(() => {
    reframe.current = true;
  }, [focus]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    if (reframe.current && follow) {
      const wanted = Math.max(focusSize(focus).length, 2) * 2.5 + 2;
      const distance = camera.position.distanceTo(c.target);
      if (Math.abs(distance - wanted) < 0.5) reframe.current = false;
      else camera.position.sub(c.target).multiplyScalar(MathUtils.lerp(1, wanted / distance, Math.min(1, dt * 1.5))).add(c.target);
    }
    const leader = hasAnimals ? leaders.get(focus) : undefined;
    if (follow && leader) {
      desired.copy(leader.position);
      desired.y += focusSize(focus).height * 0.55;
      delta.copy(desired).sub(c.target).multiplyScalar(Math.min(1, dt * 2.5));
      c.target.add(delta);
      camera.position.add(delta);
    }
    const ground = terrainHeight(camera.position.x, camera.position.z) + 1.4;
    if (camera.position.y < ground) camera.position.y = ground;
    c.update();
  });

  const span = hasAnimals ? Math.max(focusSize(focus).length, 3) : 10;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={span * 0.6}
      maxDistance={span * 9}
      maxPolarAngle={Math.PI * 0.495}
      enablePan={!follow || !hasAnimals}
      autoRotate={tour}
      autoRotateSpeed={0.35}
      onStart={() => tour && setTour(false)}
    />
  );
}

/** Sun with a tight shadow frustum that travels with the camera target. */
function Sun({ scene, mapSize }: { scene: OutdoorScene; mapSize: number }) {
  const light = useRef<DirectionalLight>(null);
  const target = useMemo(() => new Object3D(), []);
  const direction = useMemo(() => new Vector3(...scene.sunDirection).normalize(), [scene]);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const focus = controls?.target ?? target.position;
    target.position.set(Math.round(focus.x), focus.y, Math.round(focus.z));
    l.position.copy(target.position).addScaledVector(direction, 160);
    target.updateMatrixWorld();
  });
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        color={scene.sunColor}
        intensity={scene.sunIntensity}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0003}
        shadow-radius={2}
        shadow-normalBias={0.04}
        shadow-camera-near={10}
        shadow-camera-far={400}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
      />
    </>
  );
}

function Exposure({ value }: { value: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
}

export function OutdoorWorld({ scene }: { scene: OutdoorScene }) {
  // Everything below samples the terrain, so select the landscape before the children render.
  setWorld(scene.world ?? 'floodplain');
  const fogColor = useMemo(() => new Color().setRGB(...scene.fogColor, LinearSRGBColorSpace), [scene]);
  const focus = useApp((s) => s.focus);
  const low = useApp((s) => s.quality === 'low');
  const seenLeader = new Set<string>();
  const rotation = useMemo(() => new Euler(0, scene.skyRotation ?? 0, 0), [scene]);
  const birdCentre = useMemo<[number, number]>(() => (scene.habitat === 'forest' ? FOREST_CENTRE : [0, 0]), [scene]);
  // A little contrast and saturation by default; scenes override (the aftermath desaturates).
  const g = { tint: '#ffffff', saturation: 0.1, contrast: 0.08, ...scene.grade };
  const grade = <Grade tint={g.tint} saturation={g.saturation} contrast={g.contrast} />;
  return (
    <>
      <Exposure value={scene.exposure} />
      <Environment
        files={scene.hdri}
        background
        environmentIntensity={scene.environmentIntensity}
        backgroundIntensity={scene.backgroundIntensity ?? 1}
        backgroundRotation={rotation}
        environmentRotation={rotation}
      />
      <fogExp2 attach="fog" args={[fogColor, scene.fogDensity]} />
      <Sun scene={scene} key={low ? 'low' : 'high'} mapSize={low ? 2048 : 4096} />
      <Terrain clay={scene.boundaryClay ?? 0} wet={scene.world === 'coast' ? 'sand' : 'mud'} />
      <Water tint={scene.waterTint} reflect={!low} surge={scene.impact} sea={scene.world === 'coast'} />
      <Vegetation scene={scene} />
      {scene.animals.map((animal) => {
        const leader = !seenLeader.has(animal.species);
        seenLeader.add(animal.species);
        return (
          <Dinosaur
            key={`${scene.id}-${animal.key}`}
            id={`${scene.id}-${animal.key}`}
            species={animal.species}
            path={animal.path}
            start={animal.start}
            phase={animal.phase}
            lateral={animal.lateral ?? 0}
            leader={leader}
          />
        );
      })}
      {scene.fauna?.map((f, i) => {
        const Component = f.fauna === 'azhdarchid' ? Flyer : Swimmer;
        const leader = scene.fauna!.findIndex((other) => other.fauna === f.fauna) === i;
        return <Component key={`${scene.id}-${f.key}`} id={`${scene.id}-${f.key}`} fauna={f.fauna} path={f.path} start={f.start} speed={f.speed} level={f.level} leader={leader} />;
      })}
      {scene.particles === 'spores' && scene.animals.length > 0 && <FocusSparkles focus={focus} />}
      {scene.impact && <ImpactSky />}
      <Soundscape scene={scene} />
      {scene.birds && <Birds count={scene.birds.count} height={scene.birds.height} centre={birdCentre} />}
      <CameraRig scene={scene} />
      {low ? (
        <EffectComposer key="low" multisampling={0}>
          <>{grade}</>
          <Bloom mipmapBlur luminanceThreshold={1.1} intensity={scene.impact ? 0.8 : 0.35} />
          <ToneMapping mode={TONE_MAPPING} />
          <Vignette offset={0.25} darkness={0.45} />
        </EffectComposer>
      ) : (
        <EffectComposer key="high" multisampling={4}>
          <N8AO aoRadius={2.5} distanceFalloff={1.2} intensity={2.2} halfRes />
          <>{grade}</>
          <Bloom mipmapBlur luminanceThreshold={1.1} intensity={scene.impact ? 0.8 : 0.35} />
          <ToneMapping mode={TONE_MAPPING} />
          <Vignette offset={0.25} darkness={0.45} />
        </EffectComposer>
      )}
    </>
  );
}

/** Drifting spores and insects around the focused animal, lit by the low sun. */
function FocusSparkles({ focus }: { focus: string }) {
  const group = useRef<Object3D>(null);
  useFrame(() => {
    const leader = leaders.get(focus as never);
    if (leader && group.current) group.current.position.lerp(leader.position, 0.02);
  });
  return (
    <object3D ref={group}>
      <Sparkles count={140} scale={[50, 7, 50]} position-y={3.5} size={2.2} speed={0.25} opacity={0.55} color="#fff1cf" noise={1.2} />
    </object3D>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, OrbitControls, Sparkles } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Color, DirectionalLight, LinearSRGBColorSpace, Object3D, PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { OutdoorScene } from '../data/scenes';
import { SPECIES } from '../data/species';
import { leaders, useApp } from '../state';
import { terrainHeight } from '../world/terrain';
import { Dinosaur } from './Dinosaur';
import { Terrain } from './Terrain';
import { Vegetation } from './Vegetation';
import { Water } from './Water';

/** Keeps the orbit target on the focused animal while preserving the user's orbit offset. */
function CameraRig({ scene }: { scene: OutdoorScene }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const focus = useApp((s) => s.focus);
  const follow = useApp((s) => s.follow);
  const desired = useMemo(() => new Vector3(), []);
  const delta = useMemo(() => new Vector3(), []);

  useEffect(() => {
    // Leaders register in their own effects, which run before this sibling's.
    const leader = leaders.get(scene.camera.focus);
    const c = controls.current;
    if (!leader || !c) return;
    c.target.copy(leader.position);
    c.target.y += SPECIES[scene.camera.focus].model.heightM * 0.55;
    const [ox, oy, oz] = scene.camera.offset;
    const x = leader.position.x + ox;
    const z = leader.position.z + oz;
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

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const leader = leaders.get(focus);
    if (follow && leader) {
      desired.copy(leader.position);
      desired.y += SPECIES[focus].model.heightM * 0.55;
      delta.copy(desired).sub(c.target).multiplyScalar(Math.min(1, dt * 2.5));
      c.target.add(delta);
      camera.position.add(delta);
    }
    const ground = terrainHeight(camera.position.x, camera.position.z) + 1.4;
    if (camera.position.y < ground) camera.position.y = ground;
    c.update();
  });

  const span = SPECIES[focus].model.lengthM;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={span * 0.6}
      maxDistance={span * 9}
      maxPolarAngle={Math.PI * 0.495}
      enablePan={!follow}
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
  const fogColor = useMemo(() => new Color().setRGB(...scene.fogColor, LinearSRGBColorSpace), [scene]);
  const focus = useApp((s) => s.focus);
  const low = useApp((s) => s.quality === 'low');
  const seenLeader = new Set<string>();
  return (
    <>
      <Exposure value={scene.exposure} />
      <Environment files={scene.hdri} background environmentIntensity={scene.environmentIntensity} />
      <fogExp2 attach="fog" args={[fogColor, scene.fogDensity]} />
      <Sun scene={scene} key={low ? 'low' : 'high'} mapSize={low ? 2048 : 4096} />
      <Terrain />
      <Water tint={scene.id === 'dusk' ? '#2c2a26' : '#26302a'} reflect={!low} />
      <Vegetation />
      {scene.animals.map((animal, index) => {
        const leader = !seenLeader.has(animal.species);
        seenLeader.add(animal.species);
        return (
          <Dinosaur
            key={`${scene.id}-${animal.key}`}
            species={animal.species}
            path={animal.path}
            start={animal.start}
            phase={animal.phase}
            lateral={(index % 3) * 4 - 4}
            leader={leader}
          />
        );
      })}
      <FocusSparkles focus={focus} />
      <CameraRig scene={scene} />
      {low ? (
        <EffectComposer key="low" multisampling={0}>
          <Bloom mipmapBlur luminanceThreshold={1.1} intensity={0.35} />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <Vignette offset={0.22} darkness={0.55} />
        </EffectComposer>
      ) : (
        <EffectComposer key="high" multisampling={4}>
          <N8AO aoRadius={2.5} distanceFalloff={1.2} intensity={2.2} halfRes />
          <Bloom mipmapBlur luminanceThreshold={1.1} intensity={0.35} />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <Vignette offset={0.22} darkness={0.55} />
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

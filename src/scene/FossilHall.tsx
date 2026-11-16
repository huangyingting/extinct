import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { ContactShadows, Environment, MeshReflectorMaterial, OrbitControls, useGLTF } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { Mesh } from 'three';
import assets from '../data/generated/assets.json';
import type { FossilScene } from '../data/scenes';

const mount = assets.models['fossil-mount'];
const [width, length, height] = mount.size;

function Mount() {
  const { scene } = useGLTF(mount.url);
  useEffect(() => {
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [scene]);
  // Blender Z-up length axis becomes glTF -Z; turn the mount side-on to the default camera.
  return <primitive object={scene} position-y={0.6} rotation-y={Math.PI / 2} />;
}

export function FossilHall({ scene }: { scene: FossilScene }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    camera.position.set(length * 0.15, height * 0.9, Math.max(length, width) * 1.15);
    gl.toneMappingExposure = 1;
  }, [camera, gl]);
  return (
    <>
      <color attach="background" args={['#0b0c0e']} />
      <fog attach="fog" args={['#0b0c0e', 18, 55]} />
      <Environment files={scene.hdri} environmentIntensity={0.25} />
      <ambientLight intensity={0.05} />
      <spotLight position={[6, 12, 8]} angle={0.55} penumbra={0.7} intensity={900} color="#ffe6c4" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} />
      <spotLight position={[-8, 9, -4]} angle={0.6} penumbra={0.8} intensity={420} color="#c9d8ff" castShadow shadow-mapSize={[1024, 1024]} />
      <spotLight position={[0, 14, -10]} angle={0.5} penumbra={1} intensity={300} color="#ffffff" />
      <mesh position-y={0.3} receiveShadow castShadow>
        <boxGeometry args={[length + 1.6, 0.6, width + 1.6]} />
        <meshStandardMaterial color="#2a2826" roughness={0.85} />
      </mesh>
      <Mount />
      <ContactShadows position-y={0.61} scale={length + 2} blur={2.5} opacity={0.6} far={4} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <MeshReflectorMaterial resolution={1024} blur={[400, 120]} mixBlur={1} mixStrength={1.2} mirror={0.5} roughness={0.9} color="#121314" metalness={0.2} depthScale={0} />
      </mesh>
      <OrbitControls makeDefault target={[0, height * 0.55, 0]} enableDamping minDistance={4} maxDistance={30} maxPolarAngle={Math.PI * 0.49} />
      <EffectComposer multisampling={4}>
        <N8AO aoRadius={1.2} distanceFalloff={0.8} intensity={2.5} halfRes />
        <Bloom mipmapBlur luminanceThreshold={1.2} intensity={0.3} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <Vignette offset={0.2} darkness={0.7} />
      </EffectComposer>
    </>
  );
}

useGLTF.preload(mount.url);

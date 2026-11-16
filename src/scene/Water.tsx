import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import { DataTexture, RepeatWrapping, RGBAFormat, Vector2 } from 'three';
import { WATER_LEVEL, WORLD_SIZE } from '../world/terrain';

/** Tileable ripple normal map from a sum of integer-frequency waves. */
function rippleNormals(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const waves = [
    [3, 1, 0.0], [1, 4, 1.7], [5, -2, 0.4], [-2, 7, 2.9], [9, 3, 1.1], [-7, -6, 0.6], [13, -4, 2.2],
  ];
  const height = (x: number, y: number) =>
    waves.reduce((sum, [kx, ky, phase], i) => sum + Math.sin(2 * Math.PI * (kx * x + ky * y) + phase) / (1 + i * 0.7), 0);
  const e = 1 / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = i / size;
      const y = j / size;
      const dx = (height(x + e, y) - height(x - e, y)) * 0.6;
      const dy = (height(x, y + e) - height(x, y - e)) * 0.6;
      const len = Math.hypot(dx, dy, 1);
      const o = (j * size + i) * 4;
      data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[o + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(WORLD_SIZE / 9, WORLD_SIZE / 9);
  texture.needsUpdate = true;
  return texture;
}

/** `reflect` renders a true planar reflection; without it the water mirrors only the sky (environment map). */
export function Water({ tint = '#27322a', reflect = true }: { tint?: string; reflect?: boolean }) {
  const normals = useMemo(() => rippleNormals(), []);
  const normalScale = useMemo(() => new Vector2(0.18, 0.18), []);
  useFrame((_, delta) => {
    normals.offset.x += delta * 0.006;
    normals.offset.y += delta * 0.011;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={WATER_LEVEL}>
      <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
      {reflect ? (
      <MeshReflectorMaterial
        resolution={1024}
        blur={[200, 60]}
        mixBlur={0.8}
        mixStrength={1.3}
        mixContrast={1}
        mirror={0.7}
        depthScale={0}
        color={tint}
        metalness={0.1}
        roughness={0.12}
        normalMap={normals}
        normalScale={normalScale}
        distortionMap={normals}
        distortion={0.12}
      />
      ) : (
        <meshStandardMaterial color={tint} metalness={0.9} roughness={0.08} normalMap={normals} normalScale={normalScale} />
      )}
    </mesh>
  );
}

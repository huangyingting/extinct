import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mulberry32 } from '../world/terrain';

/**
 * Birds: the one dinosaur lineage that survived the impact. Hell Creek has fossils of both
 * enantiornithine and ornithurine birds, but mostly as fragments, so these are generic dark
 * silhouettes (about 0.9 m wingspan) circling, flapping and gliding.
 */

/** Body and two wings in a flat plan view; +Z forward, wings along X. Wing vertices flap by |x|. */
function birdGeometry() {
  // prettier-ignore
  const positions = [
    // body (two triangles, a thin diamond)
    0, 0, 0.32, 0.05, 0, 0, 0, 0.03, -0.3,
    0, 0, 0.32, 0, 0.03, -0.3, -0.05, 0, 0,
    // tail
    0, 0.02, -0.25, 0.08, 0, -0.42, -0.08, 0, -0.42,
    // right wing
    0.04, 0, 0.1, 0.45, 0, -0.02, 0.04, 0, -0.08,
    // left wing
    -0.04, 0, 0.1, -0.04, 0, -0.08, -0.45, 0, -0.02,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
}

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);

interface Bird {
  centre: Vector3;
  radius: number;
  speed: number;
  angle: number;
  phase: number;
}

export function Birds({ count, centre, height }: { count: number; centre: [number, number]; height: [number, number] }) {
  const { mesh, birds, flap } = useMemo(() => {
    const random = mulberry32(77 + count);
    const material = new MeshStandardMaterial({ color: '#2a2724', roughness: 0.9, side: DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFlap;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += aFlap * abs(transformed.x) * 0.9;');
    };
    material.customProgramCacheKey = () => 'bird-flap';
    const geometry = birdGeometry();
    const flap = new InstancedBufferAttribute(new Float32Array(count), 1);
    geometry.setAttribute('aFlap', flap);
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    // Loose flocks: a few shared circling centres, each bird on its own orbit.
    const flocks = Array.from({ length: Math.max(1, Math.round(count / 5)) }, () =>
      new Vector3(centre[0] + (random() - 0.5) * 240, height[0] + random() * (height[1] - height[0]), centre[1] + (random() - 0.5) * 240),
    );
    const birds: Bird[] = Array.from({ length: count }, (_, i) => ({
      centre: flocks[i % flocks.length].clone().add(new Vector3((random() - 0.5) * 20, (random() - 0.5) * 8, (random() - 0.5) * 20)),
      radius: 25 + random() * 45,
      speed: (random() < 0.5 ? -1 : 1) * (0.12 + random() * 0.08),
      angle: random() * Math.PI * 2,
      phase: random() * 100,
    }));
    return { mesh, birds, flap };
  }, [count, centre, height]);

  const matrix = useMemo(() => new Matrix4(), []);
  const position = useMemo(() => new Vector3(), []);
  const quaternion = useMemo(() => new Quaternion(), []);
  const bank = useMemo(() => new Quaternion(), []);
  const scale = useMemo(() => new Vector3(2, 2, 2), []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    birds.forEach((b, i) => {
      b.angle += b.speed * Math.min(delta, 0.1);
      position.set(
        b.centre.x + Math.cos(b.angle) * b.radius,
        b.centre.y + Math.sin(t * 0.3 + b.phase) * 3,
        b.centre.z + Math.sin(b.angle) * b.radius,
      );
      // Heading along the orbit, banked into the turn.
      const heading = Math.atan2(-Math.sin(b.angle) * Math.sign(b.speed), Math.cos(b.angle) * Math.sign(b.speed));
      quaternion.setFromAxisAngle(UP, heading).multiply(bank.setFromAxisAngle(FORWARD, -0.35 * Math.sign(b.speed)));
      mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
      // Bursts of flapping between glides.
      const glide = Math.max(0, Math.sin(t * 0.35 + b.phase));
      flap.setX(i, Math.sin(t * 9 + b.phase * 7) * glide);
    });
    mesh.instanceMatrix.needsUpdate = true;
    flap.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

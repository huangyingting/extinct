import { Suspense, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { SCENES } from './data/scenes';
import { FossilHall } from './scene/FossilHall';
import { OutdoorWorld } from './scene/OutdoorWorld';
import { useApp } from './state';
import { Overlay } from './ui/Overlay';

/** `?debug` exposes the renderer and scene for headless inspection (pipeline/screenshot.mjs). */
function DebugHook() {
  const state = useThree();
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __three: state });
  return null;
}

export function App() {
  const sceneId = useApp((s) => s.scene);
  const scene = SCENES[sceneId];
  // Drop the resolution on GPUs that cannot hold a steady frame rate.
  const [dpr, setDpr] = useState(1.5);
  const setQuality = useApp((s) => s.setQuality);
  return (
    <>
      <Canvas
        key={scene.kind}
        shadows="percentage"
        dpr={dpr}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 40, near: 0.3, far: 2500, position: [0, 6, 20] }}
      >
        <DebugHook />
        <PerformanceMonitor onIncline={() => setDpr(Math.min(window.devicePixelRatio, 1.75))} onDecline={() => setDpr(1)} flipflops={3} onFallback={() => {
            setDpr(0.85);
            setQuality('low');
          }} />
        <Suspense fallback={null}>
          {scene.kind === 'outdoor' ? <OutdoorWorld key={scene.id} scene={scene} /> : <FossilHall scene={scene} />}
        </Suspense>
      </Canvas>
      <Overlay />
    </>
  );
}

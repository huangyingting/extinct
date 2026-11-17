import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { OutdoorScene } from '../data/scenes';
import { surgeLevel } from '../scene/Water';
import { useApp } from '../state';
import { riverDistance } from '../world/terrain';
import { Ambience, SILENT } from './ambience';

let shared: Ambience | null = null;
/** One audio context for the whole app, created on the first user gesture that turns sound on. */
export function ambience() {
  shared ??= new Ambience();
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __ambience: shared });
  return shared;
}

/** Drives the ambience from the scene: profile, river proximity and the impact surge. */
export function Soundscape({ scene }: { scene: OutdoorScene }) {
  const sound = useApp((s) => s.sound);
  const camera = useThree((s) => s.camera);
  const clock = useRef(0);

  useEffect(() => {
    if (!sound) {
      shared?.setEnabled(false);
      return;
    }
    const a = ambience();
    a.setProfile(scene.ambience);
    a.setEnabled(true);
    return () => a.setProfile(SILENT);
  }, [sound, scene]);

  useFrame((_, delta) => {
    clock.current += delta;
    if (!sound || !shared) return;
    const d = riverDistance(camera.position.x, camera.position.z);
    const proximity = Math.min(1, Math.max(0, 1 - (d - 12) / 70));
    shared.setRiver(proximity, scene.impact ? Math.min(1, surgeLevel(clock.current) / 1.7) : 0);
  });
  return null;
}

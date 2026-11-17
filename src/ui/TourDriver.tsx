import { useEffect } from 'react';
import { defaultFocus, SCENE_ORDER, SCENES } from '../data/scenes';
import type { FocusId } from '../data/fauna';
import { useApp } from '../state';

const FOCUS_SECONDS = 18;
const SCENE_SECONDS = 45;

/** While the tour runs: alternate the followed species and move along the timeline. */
export function TourDriver() {
  const tour = useApp((s) => s.tour);
  const scene = useApp((s) => s.scene);
  useEffect(() => {
    if (!tour) return;
    const config = SCENES[scene];
    const species: FocusId[] = config.kind === 'outdoor' ? [...new Set<FocusId>([...config.animals.map((a) => a.species), ...(config.fauna ?? []).map((f) => f.fauna)])] : [];
    const focusTimer = window.setInterval(() => {
      if (species.length < 2) return;
      const { focus, setFocus } = useApp.getState();
      setFocus(species[(species.indexOf(focus) + 1) % species.length]);
    }, FOCUS_SECONDS * 1000);
    const sceneTimer = window.setTimeout(() => {
      const next = SCENE_ORDER[(SCENE_ORDER.indexOf(scene) + 1) % SCENE_ORDER.length];
      useApp.getState().setScene(next, defaultFocus(next));
    }, SCENE_SECONDS * 1000);
    return () => {
      window.clearInterval(focusTimer);
      window.clearTimeout(sceneTimer);
    };
  }, [tour, scene]);
  return null;
}

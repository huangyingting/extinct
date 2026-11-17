import { create } from 'zustand';
import type { Object3D, Vector3 } from 'three';
import { defaultFocus, SCENES, type SceneId } from './data/scenes';
import type { FocusId } from './data/fauna';
import type { SpeciesId } from './data/species';

export type Behaviour = 'auto' | 'walk' | 'rest';
export type Quality = 'high' | 'low';

interface AppState {
  scene: SceneId;
  focus: FocusId;
  follow: boolean;
  behaviour: Behaviour;
  /** Incremented to request the focused species' one-shot action (roar / look up). */
  actionNonce: number;
  panel: 'species' | 'scene' | 'credits' | null;
  /** 'low' halves ground cover and drops the far forest, water reflection and AO for weak GPUs. */
  quality: Quality;
  /** Procedural ambience; off until the user turns it on (browsers need a gesture to start audio). */
  sound: boolean;
  setSound: (sound: boolean) => void;
  /** Guided tour: slow orbit, focus changes and scene advance until the user takes the camera. */
  tour: boolean;
  setTour: (tour: boolean) => void;
  setQuality: (quality: Quality) => void;
  setScene: (scene: SceneId, focus?: FocusId) => void;
  setFocus: (focus: FocusId) => void;
  setFollow: (follow: boolean) => void;
  setBehaviour: (behaviour: Behaviour) => void;
  triggerAction: () => void;
  setPanel: (panel: AppState['panel']) => void;
}

const params = new URLSearchParams(location.search);

const hasConfiguredFocus = (id: SceneId) => {
  const scene = SCENES[id];
  return scene.kind === 'outdoor' && scene.camera.focus !== undefined;
};
/** `?scene=<id>` opens a scene directly. */
const initialScene = (params.get('scene') ?? 'morning') as SceneId;
const startScene = initialScene in SCENES ? initialScene : 'morning';
const startConfig = SCENES[startScene];

export const useApp = create<AppState>((set) => ({
  scene: startScene,
  focus: defaultFocus(startScene) ?? 'triceratops',
  follow: true,
  behaviour: 'auto',
  actionNonce: 0,
  panel: startConfig.kind !== 'outdoor' ? null : startConfig.animals.length > 0 ? 'species' : 'scene',
  quality: params.get('quality') === 'low' ? 'low' : 'high',
  setQuality: (quality) => set({ quality }),
  sound: false,
  setSound: (sound) => set({ sound }),
  tour: false,
  setTour: (tour) => set(tour ? { tour, follow: true, behaviour: 'auto' } : { tour }),
  setScene: (scene, focus) =>
    set((s) => ({
      scene,
      focus: focus ?? s.focus,
      behaviour: 'auto',
      // Scenes framed on a landscape (no configured focus) start with the camera free.
      follow: hasConfiguredFocus(scene),
      // Without animals there is no species panel: outdoor scenes show the scene notes instead,
      // and the fossil scan stays unobstructed.
      panel: s.panel === 'species' && !focus ? (SCENES[scene].kind === 'outdoor' ? 'scene' : null) : s.panel,
    })),
  setFocus: (focus) => set({ focus, follow: true }),
  setFollow: (follow) => set({ follow }),
  setBehaviour: (behaviour) => set({ behaviour }),
  triggerAction: () => set((s) => ({ actionNonce: s.actionNonce + 1 })),
  setPanel: (panel) => set({ panel }),
}));

/**
 * The first animal of each species in the current scene registers its root here so the
 * camera rig can follow it without threading refs through React state on every frame.
 */
export const leaders = new Map<FocusId, Object3D>();

/** Live position and heading of every animal, for spacing, looking at each other and alarm responses. */
export interface Agent {
  species: SpeciesId;
  position: Vector3;
  /** Heading in radians; forward is (sin, 0, cos). */
  heading: number;
}
export const agents = new Map<string, Agent>();

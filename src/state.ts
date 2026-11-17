import { create } from 'zustand';
import type { Object3D, Vector3 } from 'three';
import { SCENES, type SceneId } from './data/scenes';
import type { SpeciesId } from './data/species';

export type Behaviour = 'auto' | 'walk' | 'rest';
export type Quality = 'high' | 'low';

interface AppState {
  scene: SceneId;
  focus: SpeciesId;
  follow: boolean;
  behaviour: Behaviour;
  /** Incremented to request the focused species' one-shot action (roar / look up). */
  actionNonce: number;
  panel: 'species' | 'scene' | 'credits' | null;
  /** 'low' halves ground cover and drops the far forest, water reflection and AO for weak GPUs. */
  quality: Quality;
  setQuality: (quality: Quality) => void;
  setScene: (scene: SceneId, focus?: SpeciesId) => void;
  setFocus: (focus: SpeciesId) => void;
  setFollow: (follow: boolean) => void;
  setBehaviour: (behaviour: Behaviour) => void;
  triggerAction: () => void;
  setPanel: (panel: AppState['panel']) => void;
}

const params = new URLSearchParams(location.search);
/** `?scene=<id>` opens a scene directly. */
const initialScene = (params.get('scene') ?? 'morning') as SceneId;
const startScene = initialScene in SCENES ? initialScene : 'morning';
const startConfig = SCENES[startScene];

export const useApp = create<AppState>((set) => ({
  scene: startScene,
  focus: (startConfig.kind === 'outdoor' && startConfig.camera.focus) || 'triceratops',
  follow: true,
  behaviour: 'auto',
  actionNonce: 0,
  panel: startConfig.kind !== 'outdoor' ? null : startConfig.animals.length > 0 ? 'species' : 'scene',
  quality: params.get('quality') === 'low' ? 'low' : 'high',
  setQuality: (quality) => set({ quality }),
  setScene: (scene, focus) =>
    set((s) => ({
      scene,
      focus: focus ?? s.focus,
      behaviour: 'auto',
      follow: true,
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
export const leaders = new Map<SpeciesId, Object3D>();

/** Live position and heading of every animal, for spacing, looking at each other and alarm responses. */
export interface Agent {
  species: SpeciesId;
  position: Vector3;
  /** Heading in radians; forward is (sin, 0, cos). */
  heading: number;
}
export const agents = new Map<string, Agent>();

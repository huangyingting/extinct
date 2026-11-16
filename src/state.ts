import { create } from 'zustand';
import type { Object3D } from 'three';
import type { SceneId } from './data/scenes';
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
  panel: 'species' | 'credits' | null;
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

export const useApp = create<AppState>((set) => ({
  scene: 'morning',
  focus: 'triceratops',
  follow: true,
  behaviour: 'auto',
  actionNonce: 0,
  panel: 'species',
  quality: new URLSearchParams(location.search).get('quality') === 'low' ? 'low' : 'high',
  setQuality: (quality) => set({ quality }),
  setScene: (scene, focus) => set((s) => ({ scene, focus: focus ?? s.focus, behaviour: 'auto', follow: true })),
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

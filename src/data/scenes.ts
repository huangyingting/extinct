import assets from './generated/assets.json';
import type { SpeciesId } from './species';
import { riverLoop } from '../world/terrain';

export type SceneId = 'morning' | 'dusk' | 'fossil';

export interface AnimalPlacement {
  key: string;
  species: SpeciesId;
  path: [number, number][];
  /** Fraction along the path where the animal starts. */
  start: number;
  /** Seconds offset into the behaviour cycle, so group members do not move in lockstep. */
  phase: number;
}

export interface OutdoorScene {
  id: Exclude<SceneId, 'fossil'>;
  kind: 'outdoor';
  title: string;
  subtitle: string;
  hdri: string;
  /**
   * Direction towards the sun, from the HDRI's brightest pixel (see docs/prototype.md); elevation is
   * raised (to ~25° morning, ~15° dusk) so the ground receives enough direct light for readable shadows. Image-based light is kept low because the HDRI
   * itself contains the sun, which would otherwise fill in every shadow.
   */
  sunDirection: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  environmentIntensity: number;
  exposure: number;
  /** Linear RGB, matched to the HDRI horizon so distant terrain dissolves into the sky. */
  fogColor: [number, number, number];
  fogDensity: number;
  /** Initial camera offset from the focused animal (world metres); eye level keeps the scale legible. */
  camera: { offset: [number, number, number]; focus: SpeciesId };
  animals: AnimalPlacement[];
}

export interface FossilScene {
  id: 'fossil';
  kind: 'fossil';
  title: string;
  subtitle: string;
  hdri: string;
}

export type SceneConfig = OutdoorScene | FossilScene;

const herdPath = riverLoop(-70, 50, 30, 62);
const rexPath = riverLoop(-120, 80, 27, 48, 18);
const farHerdPath = riverLoop(60, 160, -40, -70);

export const SCENES: Record<SceneId, SceneConfig> = {
  morning: {
    id: 'morning',
    kind: 'outdoor',
    title: 'Fern prairie, morning',
    subtitle: 'Triceratops grazing on the floodplain',
    hdri: assets.hdri.citrus_orchard_puresky.url,
    sunDirection: [0.27, 0.45, 0.94],
    sunColor: '#ffe2bd',
    sunIntensity: 6.5,
    environmentIntensity: 0.32,
    exposure: 0.95,
    fogColor: [0.62, 0.66, 0.72],
    fogDensity: 0.0017,
    camera: { offset: [-18, 2.2, 3], focus: 'triceratops' },
    animals: [
      { key: 'trike-a', species: 'triceratops', path: herdPath, start: 0.06, phase: 0 },
      { key: 'trike-b', species: 'triceratops', path: herdPath, start: 0.0, phase: 7 },
      { key: 'trike-c', species: 'triceratops', path: herdPath, start: 0.12, phase: 13 },
      { key: 'rex-far', species: 'trex', path: farHerdPath, start: 0.3, phase: 4 },
    ],
  },
  dusk: {
    id: 'dusk',
    kind: 'outdoor',
    title: 'River margin, dusk',
    subtitle: 'Tyrannosaurus patrolling the channel bank',
    hdri: assets.hdri.belfast_sunset_puresky.url,
    sunDirection: [0.79, 0.27, 0.6],
    sunColor: '#ff9a55',
    sunIntensity: 5.5,
    environmentIntensity: 0.3,
    exposure: 0.85,
    fogColor: [0.58, 0.44, 0.38],
    fogDensity: 0.0022,
    camera: { offset: [15, 2.0, -20], focus: 'trex' },
    animals: [
      { key: 'rex', species: 'trex', path: rexPath, start: 0.05, phase: 0 },
      { key: 'trike-far-a', species: 'triceratops', path: farHerdPath, start: 0.1, phase: 3 },
      { key: 'trike-far-b', species: 'triceratops', path: farHerdPath, start: 0.16, phase: 9 },
    ],
  },
  fossil: {
    id: 'fossil',
    kind: 'fossil',
    title: 'Fossil evidence',
    subtitle: 'Smithsonian 3D scan of a mounted T. rex over Triceratops',
    hdri: assets.hdri.studio_small_09.url,
  },
};

export const SCENE_ORDER: SceneId[] = ['morning', 'dusk', 'fossil'];

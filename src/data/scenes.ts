import assets from './generated/assets.json';
import type { SpeciesId } from './species';
import { loop, riverLoop, riverX } from '../world/terrain';
import type { AmbienceProfile } from '../audio/ambience';

export type SceneId = 'morning' | 'forest' | 'dusk' | 'impact' | 'aftermath' | 'fossil';

export interface AnimalPlacement {
  key: string;
  species: SpeciesId;
  path: [number, number][];
  /** Fraction along the path where the animal starts. */
  start: number;
  /** Seed for this individual's behaviour timing, so group members do not move in lockstep. */
  phase: number;
  /** Sideways offset from the path in metres (positive = left of travel). */
  lateral?: number;
}

/**
 * Which plant community is scattered on the terrain.
 * floodplain: open fern ground with conifer and broadleaf groves along the channel.
 * forest: closed broadleaf/conifer stand with an understory.
 * aftermath: standing dead trunks, fallen timber and a fern-dominated ground cover.
 */
export type Habitat = 'floodplain' | 'forest' | 'aftermath';

/** A claim shown in the scene panel; `basis` says how firm it is. */
export interface SceneNote {
  text: string;
  basis: 'evidence' | 'inferred' | 'debated' | 'staging';
}

export interface Reference {
  label: string;
  url: string;
}

interface SceneBase {
  title: string;
  /** Short label for the timeline. */
  short: string;
  subtitle: string;
  /** Short time label for the timeline and header. */
  era: string;
  hdri: string;
  notes: SceneNote[];
  references: Reference[];
}

export interface OutdoorScene extends SceneBase {
  id: Exclude<SceneId, 'fossil'>;
  kind: 'outdoor';
  habitat: Habitat;
  /**
   * Direction towards the sun, from the HDRI's brightest pixel (see docs/prototype.md); elevation is
   * raised where needed so the ground receives enough direct light for readable shadows. Image-based
   * light is kept low because the HDRI itself contains the sun, which would otherwise fill in every shadow.
   */
  sunDirection: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  environmentIntensity: number;
  /** Rotation of the sky about the vertical axis (radians), so the HDRI sun matches `sunDirection`. */
  skyRotation?: number;
  exposure: number;
  /** Linear RGB, matched to the HDRI horizon so distant terrain dissolves into the sky. */
  fogColor: [number, number, number];
  fogDensity: number;
  /** Brightness of the visible sky (lighting is set separately), e.g. to darken the sky after the impact. */
  backgroundIntensity?: number;
  /** Colour grade applied before tone mapping: a multiplier and a saturation change (-1..1). */
  grade?: { tint: string; saturation: number };
  waterTint: string;
  /** 0..1 pale clay layer over the ground (the K–Pg boundary clay). */
  boundaryClay?: number;
  /** Airborne particles near the camera. */
  particles: 'spores' | 'spherules' | 'none';
  /** Re-entering ejecta streaks and a seiche surge in the river (impact scene only). */
  impact?: boolean;
  /** Procedural soundscape levels (see audio/ambience.ts). */
  ambience: AmbienceProfile;
  /** Circling birds: how many, and their height range in metres. */
  birds?: { count: number; height: [number, number] };
  /**
   * Initial camera offset (world metres) from the focus animal, or from `target` when the scene has
   * no animals. Eye level keeps the scale legible.
   */
  camera: { offset: [number, number, number]; focus?: SpeciesId; target?: [number, number] };
  animals: AnimalPlacement[];
}

export interface FossilScene extends SceneBase {
  id: 'fossil';
  kind: 'fossil';
}

export type SceneConfig = OutdoorScene | FossilScene;

const herdPath = riverLoop(-70, 50, 30, 62);
const rexPath = riverLoop(-120, 80, 27, 48, 18);
const farHerdPath = riverLoop(60, 160, -40, -70);
/** A loop through the forest stand east of the channel (see FOREST_CENTRE in world/terrain.ts). */
const forestRexPath = loop(118, -118, 46, 34, 16, 5);
const forestHerdPath = loop(150, -60, 24, 16, 12, 3);

const references = {
  hellCreekFlora: { label: 'Johnson 2002, Megaflora of the Hell Creek and lower Fort Union Formations (GSA Special Paper 361)', url: 'https://doi.org/10.1130/0-8137-2361-2.329' },
  wilfJohnson: { label: 'Wilf & Johnson 2004, Land plant extinction at the end of the Cretaceous: the North Dakota megafloral record (Paleobiology)', url: 'https://doi.org/10.1666/0094-8373(2004)030%3C0347:LPEATE%3E2.0.CO;2' },
  fastovsky: { label: 'Fastovsky & Bercovici 2016, The Hell Creek Formation and its contribution to the Cretaceous–Paleogene extinction: a short primer (Cretaceous Research)', url: 'https://doi.org/10.1016/j.cretres.2015.07.007' },
  rexGait: { label: 'van Bijlert et al. 2021, Natural frequency method: estimating the preferred walking speed of Tyrannosaurus rex (R. Soc. Open Sci.)', url: 'https://doi.org/10.1098/rsos.201441' },
  tanis: { label: 'DePalma et al. 2019, A seismically induced onshore surge deposit at the KPg boundary, North Dakota (PNAS)', url: 'https://doi.org/10.1073/pnas.1817407116' },
  spring: { label: 'During et al. 2022, The Mesozoic terminated in boreal spring (Nature)', url: 'https://doi.org/10.1038/s41586-022-04446-1' },
  chicxulub: { label: 'Schulte et al. 2010, The Chicxulub asteroid impact and mass extinction at the Cretaceous-Paleogene boundary (Science)', url: 'https://doi.org/10.1126/science.1177265' },
  age: { label: 'Sprain et al. 2018, Calibration of chron C29r: geochronologic constraints from the Hell Creek region (GSA Bulletin)', url: 'https://doi.org/10.1130/B31890.1' },
  ferns: { label: 'Tschudy et al. 1984, Disruption of the terrestrial plant ecosystem at the Cretaceous-Tertiary boundary (Science)', url: 'https://doi.org/10.1126/science.225.4666.1030' },
  lastTrike: { label: 'Lyson et al. 2011, Dinosaur extinction: closing the “3 m gap” (Biology Letters)', url: 'https://doi.org/10.1098/rsbl.2011.0470' },
  fires: { label: 'Belcher et al. 2009, Geochemical evidence for combustion of hydrocarbons during the K-T impact event (PNAS)', url: 'https://doi.org/10.1073/pnas.0813117106' },
  darkness: { label: 'Bardeen et al. 2017, On transient climate change at the Cretaceous-Paleogene boundary due to atmospheric soot injections (PNAS)', url: 'https://doi.org/10.1073/pnas.1708980114' },
} satisfies Record<string, Reference>;

const hellCreekSetting: SceneNote[] = [
  {
    basis: 'evidence',
    text: 'Hell Creek was a warm, humid coastal lowland of meandering rivers, west of the shrinking Western Interior Seaway. Its rocks are river sands and floodplain muds, not boulder fields.',
  },
  {
    basis: 'evidence',
    text: 'Flowering plants (angiosperms) made up most of the fossil leaf species; conifers related to the swamp cypress and ferns also grew. There were no grasslands, so there is no grass here.',
  },
  {
    basis: 'staging',
    text: 'The plants are modern stand-ins: bald cypress for taxodiaceous conifers, jacaranda and other broadleaves for the angiosperm trees, and modern ferns. Species, leaf shapes and colours differ from the real flora. The birds are generic silhouettes: Hell Creek birds, both enantiornithines and early relatives of modern birds, are known mostly from fragments.',
  },
];

export const SCENES: Record<SceneId, SceneConfig> = {
  morning: {
    id: 'morning',
    kind: 'outdoor',
    habitat: 'floodplain',
    title: 'Floodplain, morning',
    birds: { count: 10, height: [22, 55] },
    ambience: { wind: 0.5, river: 0.6, insects: 0.5, rumble: 0 },
    short: 'Morning floodplain',
    subtitle: 'Triceratops feeding on the river floodplain',
    era: 'Late Maastrichtian · c. 66.1 Ma',
    hdri: assets.hdri.citrus_orchard_puresky.url,
    sunDirection: [0.27, 0.45, 0.94],
    sunColor: '#ffe2bd',
    sunIntensity: 6.5,
    environmentIntensity: 0.34,
    exposure: 0.95,
    fogColor: [0.6, 0.65, 0.7],
    fogDensity: 0.0024,
    waterTint: '#3a3a2c',
    particles: 'spores',
    camera: { offset: [-18, 2.2, 3], focus: 'triceratops' },
    animals: [
      { key: 'trike-a', species: 'triceratops', path: herdPath, start: 0.06, phase: 0, lateral: -3 },
      { key: 'trike-b', species: 'triceratops', path: herdPath, start: 0.01, phase: 7, lateral: 2.5 },
      { key: 'trike-c', species: 'triceratops', path: herdPath, start: 0.12, phase: 13, lateral: 0 },
      { key: 'rex-far', species: 'trex', path: farHerdPath, start: 0.3, phase: 4 },
    ],
    notes: [
      ...hellCreekSetting,
      {
        basis: 'staging',
        text: 'Most Triceratops are found as isolated skeletons. Showing three together is a staging choice, not a claim that they lived in herds.',
      },
    ],
    references: [references.hellCreekFlora, references.fastovsky],
  },
  forest: {
    id: 'forest',
    kind: 'outdoor',
    habitat: 'forest',
    title: 'Floodplain forest, midday',
    birds: { count: 6, height: [32, 60] },
    ambience: { wind: 0.35, river: 0.15, insects: 0.8, rumble: 0 },
    short: 'Forest, midday',
    subtitle: 'Tyrannosaurus moving through a broadleaf and conifer stand',
    era: 'Late Maastrichtian · c. 66.1 Ma',
    hdri: assets.hdri.kloofendal_48d_partly_cloudy_puresky.url,
    sunDirection: [0.55, 0.74, 0.38],
    sunColor: '#fff3e0',
    sunIntensity: 5.2,
    environmentIntensity: 0.42,
    exposure: 0.9,
    fogColor: [0.55, 0.62, 0.62],
    fogDensity: 0.0042,
    waterTint: '#33352a',
    particles: 'spores',
    camera: { offset: [-20, 2.4, 12], focus: 'trex' },
    animals: [
      { key: 'rex', species: 'trex', path: forestRexPath, start: 0.0, phase: 2 },
      { key: 'trike-a', species: 'triceratops', path: forestHerdPath, start: 0.2, phase: 5 },
    ],
    notes: [
      ...hellCreekSetting,
      {
        basis: 'evidence',
        text: 'Fossil leaf sites show forests on the better-drained parts of the floodplain and along channels. Canopy height and density here are estimates.',
      },
      {
        basis: 'inferred',
        text: 'The walking speed of the Tyrannosaurus (about 1.5 m/s) follows a biomechanical estimate of its preferred walking speed, about 1.3 m/s, from the natural frequency of its tail.',
      },
    ],
    references: [references.hellCreekFlora, references.rexGait],
  },
  dusk: {
    id: 'dusk',
    kind: 'outdoor',
    habitat: 'floodplain',
    title: 'River margin, dusk',
    birds: { count: 8, height: [18, 45] },
    ambience: { wind: 0.4, river: 0.7, insects: 1, rumble: 0 },
    short: 'River at dusk',
    subtitle: 'Tyrannosaurus patrolling the channel bank',
    era: 'Late Maastrichtian · c. 66.1 Ma',
    hdri: assets.hdri.belfast_sunset_puresky.url,
    sunDirection: [0.79, 0.27, 0.6],
    sunColor: '#ff9a55',
    sunIntensity: 5.5,
    environmentIntensity: 0.3,
    exposure: 0.85,
    fogColor: [0.58, 0.44, 0.38],
    fogDensity: 0.0026,
    waterTint: '#352f26',
    particles: 'spores',
    camera: { offset: [15, 2.0, -20], focus: 'trex' },
    animals: [
      { key: 'rex', species: 'trex', path: rexPath, start: 0.05, phase: 0 },
      { key: 'trike-far-a', species: 'triceratops', path: farHerdPath, start: 0.1, phase: 3, lateral: -2 },
      { key: 'trike-far-b', species: 'triceratops', path: farHerdPath, start: 0.16, phase: 9, lateral: 2 },
    ],
    notes: [
      ...hellCreekSetting,
      {
        basis: 'evidence',
        text: 'Tyrannosaurus and Triceratops are the two most common large dinosaurs in Hell Creek rocks, and Triceratops bones with healed tyrannosaur bite marks show the two met.',
      },
    ],
    references: [references.hellCreekFlora, references.fastovsky],
  },
  impact: {
    id: 'impact',
    kind: 'outdoor',
    habitat: 'floodplain',
    title: 'The impact, minutes after',
    ambience: { wind: 0.6, river: 0.7, insects: 0, rumble: 1 },
    short: 'Impact',
    subtitle: 'Ejecta from Chicxulub, about 3,000 km away, re-entering over Hell Creek',
    era: 'K–Pg boundary · 66.0 Ma',
    hdri: assets.hdri.qwantani_late_afternoon_puresky.url,
    sunDirection: [0.76, 0.4, 0.56],
    sunColor: '#ffc690',
    sunIntensity: 4.2,
    environmentIntensity: 0.3,
    exposure: 0.92,
    fogColor: [0.6, 0.4, 0.3],
    fogDensity: 0.0034,
    backgroundIntensity: 0.85,
    grade: { tint: '#ffd2b0', saturation: -0.05 },
    waterTint: '#3b3428',
    particles: 'spherules',
    impact: true,
    camera: { offset: [-16, 2.0, 10], focus: 'triceratops' },
    animals: [
      { key: 'trike-a', species: 'triceratops', path: herdPath, start: 0.3, phase: 2, lateral: -2 },
      { key: 'trike-b', species: 'triceratops', path: herdPath, start: 0.25, phase: 11, lateral: 2 },
      { key: 'rex-far', species: 'trex', path: farHerdPath, start: 0.5, phase: 6 },
    ],
    notes: [
      {
        basis: 'evidence',
        text: 'About 66.0 million years ago an asteroid roughly 10 km across struck the Yucatán Peninsula, forming the Chicxulub crater. Its ejecta layer, rich in iridium and shocked quartz, marks the end of the Cretaceous worldwide, including in the Hell Creek area.',
      },
      {
        basis: 'evidence',
        text: 'Non-avian dinosaurs persist in Hell Creek rocks up to the boundary: a Triceratops horn was found about 13 cm below the boundary clay in Montana.',
      },
      {
        basis: 'debated',
        text: 'At the Tanis site in the Hell Creek Formation of North Dakota, glassy impact spherules fell into a river surge deposit. Its excavators interpret the surge as a seismic seiche that began within an hour of the impact. Several of the site’s other claims remain disputed.',
      },
      {
        basis: 'evidence',
        text: 'Growth lines in fish bones from Tanis indicate the impact happened in the northern spring.',
      },
      {
        basis: 'debated',
        text: 'How hot the sky became as ejecta re-entered, and whether that ignited widespread fires, is still debated. This scene shows glowing streaks and falling spherules, but no fire.',
      },
      {
        basis: 'staging',
        text: 'Time is compressed. The streak density, the river surge and the direction of the incoming ejecta (from the south-south-east, towards Chicxulub) are illustrative.',
      },
    ],
    references: [references.chicxulub, references.age, references.tanis, references.spring, references.lastTrike, references.fires],
  },
  aftermath: {
    id: 'aftermath',
    kind: 'outdoor',
    habitat: 'aftermath',
    title: 'After the impact',
    birds: { count: 4, height: [20, 40] },
    ambience: { wind: 0.9, river: 0.5, insects: 0.08, rumble: 0 },
    short: 'Fern spike',
    subtitle: 'A dim, fern-covered floodplain without non-avian dinosaurs',
    era: 'Earliest Paleocene · just after 66.0 Ma',
    hdri: assets.hdri.wasteland_clouds_puresky.url,
    sunDirection: [0.8, 0.35, 0.58],
    sunColor: '#c9c3b8',
    sunIntensity: 1.6,
    environmentIntensity: 0.55,
    exposure: 0.85,
    fogColor: [0.36, 0.36, 0.35],
    fogDensity: 0.0048,
    backgroundIntensity: 0.55,
    grade: { tint: '#e6e4df', saturation: -0.38 },
    waterTint: '#33322c',
    boundaryClay: 0.5,
    particles: 'none',
    camera: { offset: [20, 2.4, 12], target: [riverX(0) + 22, -8] },
    animals: [],
    notes: [
      {
        basis: 'evidence',
        text: 'Pollen and spore records across the boundary in the Western Interior show a “fern spike”: just above the boundary clay, fern spores briefly dominate while flowering-plant pollen nearly disappears. Ferns recolonised the disturbed ground first.',
      },
      {
        basis: 'evidence',
        text: 'Fossil leaves from the Williston Basin, which includes Hell Creek, suggest that roughly 57% of the plant species did not survive.',
      },
      {
        basis: 'evidence',
        text: 'No non-avian dinosaur fossils occur above the boundary. Birds, mammals, crocodilians, turtles and fish survived.',
      },
      {
        basis: 'inferred',
        text: 'Soot, dust and sulfate aerosols probably dimmed sunlight for months to years. How dark it became, and for how long, varies between models.',
      },
      {
        basis: 'staging',
        text: 'The dead trunks, the pale clay layer on the ground and the overcast sky are illustrative. The few circling birds stand for the dinosaur lineage that survived; they are generic silhouettes. A real fern spike is identified from microscopic spores in the rock, not from a scene like this.',
      },
    ],
    references: [references.ferns, references.wilfJohnson, references.darkness, references.fastovsky],
  },
  fossil: {
    id: 'fossil',
    kind: 'fossil',
    title: 'Fossil evidence',
    short: 'Fossil scan',
    subtitle: 'Smithsonian 3D scan of a mounted T. rex over Triceratops',
    era: 'Today',
    hdri: assets.hdri.studio_small_09.url,
    notes: [
      {
        basis: 'evidence',
        text: 'Photogrammetry of the Smithsonian’s mounted Tyrannosaurus rex, a single individual excavated in Montana from 1988. The Triceratops is a digital composite scaled from several specimens.',
      },
    ],
    references: [],
  },
};

export const SCENE_ORDER: SceneId[] = ['morning', 'forest', 'dusk', 'impact', 'aftermath', 'fossil'];

/** Scenes grouped on the timeline. */
export const TIMELINE: { label: string; scenes: SceneId[] }[] = [
  { label: 'Late Cretaceous', scenes: ['morning', 'forest', 'dusk'] },
  { label: 'Boundary', scenes: ['impact'] },
  { label: 'Paleocene', scenes: ['aftermath'] },
  { label: 'Today', scenes: ['fossil'] },
];

/** Every walking path in any scene, so vegetation keeps clear of them. */
export const ALL_PATHS = Object.values(SCENES).flatMap((scene) => (scene.kind === 'outdoor' ? scene.animals.map((a) => a.path) : []));

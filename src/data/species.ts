import assets from './generated/assets.json';
import pbdb from './generated/pbdb.json';

export type SpeciesId = 'trex' | 'triceratops';
export type ClipName = 'Walk' | 'Idle' | 'Roar' | 'Graze' | 'Alert';

export interface Species {
  id: SpeciesId;
  scientificName: string;
  commonName: string;
  /** Clip played when the animal is not walking. */
  restClip: ClipName;
  /** One-shot clip offered as a user action. */
  actionClip: ClipName;
  actionLabel: string;
  model: {
    url: string;
    lengthM: number;
    heightM: number;
    walkSpeed: number;
  };
  /** Editorial notes on what the reconstruction does and does not show. Draft, unreviewed. */
  reconstructionNotes: string[];
  fossilRecord: (typeof pbdb.taxa)[keyof typeof pbdb.taxa];
}

const model = (id: SpeciesId) => {
  const entry = assets.models[id];
  return { url: entry.url, lengthM: entry.length, heightM: entry.height, walkSpeed: entry.walkSpeed };
};

export const SPECIES: Record<SpeciesId, Species> = {
  trex: {
    id: 'trex',
    scientificName: 'Tyrannosaurus rex',
    commonName: 'Tyrant lizard king',
    restClip: 'Idle',
    actionClip: 'Roar',
    actionLabel: 'Roar',
    model: model('trex'),
    reconstructionNotes: [
      'Reconstruction of a living animal, not a fossil scan. Skin colour and pattern are unknown; the colouring is the artist’s choice.',
      'Whether tyrannosaur teeth were covered by lips is debated. This model shows exposed teeth.',
      'Scaled to 12 m long, a commonly cited adult length. Body proportions follow the source model and have not been checked against specimens.',
      'The walk cycle comes from the source model, played at the rate that keeps the planted foot still. The cruising speed, about 1.5 m/s, is close to a published estimate of its preferred walking speed (about 1.3 m/s, from the natural frequency of the tail).',
      'Turning, head movement, tail follow-through, a closed mouth while walking and breathing are added procedurally. The idle and roar clips were authored for this prototype, and vocal behaviour is speculative.',
    ],
    fossilRecord: pbdb.taxa['Tyrannosaurus rex'],
  },
  triceratops: {
    id: 'triceratops',
    scientificName: 'Triceratops horridus',
    commonName: 'Three-horned face',
    restClip: 'Graze',
    actionClip: 'Alert',
    actionLabel: 'Look up',
    model: model('triceratops'),
    reconstructionNotes: [
      'Reconstruction of a living animal, not a fossil scan. The frill colour and eye-spot pattern are speculative display colouring.',
      'Most Triceratops fossils are found as isolated individuals. The small group in this scene is a staging choice, not a claim about herd behaviour.',
      'Scaled to 8.5 m long, within commonly cited adult estimates. Proportions follow the source model and have not been checked against specimens.',
      'The source walk cycle did not keep its feet on the ground, so while walking the legs are posed procedurally: feet stay planted for about two-thirds of each step cycle and lift in the lateral-sequence order (hind foot, then front foot on the same side) used by most walking quadrupeds, including elephants. The walking speed, about 1 m/s, is an assumption.',
      'The tail is raised clear of the ground: dinosaur trackways rarely show tail-drag marks. Head, neck and tail movement are partly procedural; the grazing and alert clips were authored for this prototype.',
    ],
    fossilRecord: pbdb.taxa['Triceratops horridus'],
  },
};

export const PBDB = {
  source: pbdb.source,
  sourceUrl: pbdb.sourceUrl,
  license: pbdb.license,
  licenseUrl: pbdb.licenseUrl,
  retrieved: pbdb.retrieved,
  notes: pbdb.notes,
};

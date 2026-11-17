import assets from './generated/assets.json';
import { SPECIES, type SpeciesId } from './species';

/**
 * Animals that are not dinosaurs: pterosaurs, marine and freshwater reptiles. They lived alongside
 * the dinosaurs and are often mistaken for them, so every entry says which group it belongs to.
 */
export type FaunaId = 'azhdarchid' | 'mosasaur' | 'champsosaurus' | 'alligator';

export interface Fauna {
  id: FaunaId;
  name: string;
  /** Scientific name of the animal shown (or the group, when the model is a stand-in). */
  scientific: string;
  group: string;
  model: { url: string; length: number };
  /** One-line note on what the model is and how sure we are. */
  note: string;
}

const m = assets.models;

export const FAUNA: Record<FaunaId, Fauna> = {
  azhdarchid: {
    id: 'azhdarchid',
    name: 'Azhdarchid pterosaur',
    scientific: 'Infernodrakon hastacollis',
    group: 'Pterosaur — a flying reptile, not a dinosaur',
    model: { url: m.azhdarchid.url, length: m.azhdarchid.wingspan },
    note:
      'Infernodrakon, a medium-sized azhdarchid, is known from a single neck vertebra from the Hell Creek Formation. The model is a Quetzalcoatlus-like stand-in shown at a 5 m wingspan; size and appearance are estimates. Azhdarchids probably also foraged on the ground.',
  },
  mosasaur: {
    id: 'mosasaur',
    name: 'Mosasaur',
    scientific: 'Mosasaurus hoffmannii',
    group: 'Mosasaur — a marine lizard, not a dinosaur',
    model: { url: m.mosasaur.url, length: m.mosasaur.length },
    note:
      'A Mosasaurus hoffmannii skull from the Fox Hills Formation of South Dakota (68.3–67.6 Ma) is the northernmost record in the Western Interior Seaway. The model is a Tylosaurus sculpt used as a stand-in, so the skull shape differs; shown at 12 m.',
  },
  champsosaurus: {
    id: 'champsosaurus',
    name: 'Champsosaurus',
    scientific: 'Champsosaurus',
    group: 'Choristodere — a freshwater reptile, not a dinosaur or crocodilian',
    model: { url: m.champsosaurus.url, length: m.champsosaurus.length },
    note:
      'Long-snouted, fish-eating reptiles common in Hell Creek rivers. Choristoderes survived the end-Cretaceous extinction and lived on into the Eocene.',
  },
  alligator: {
    id: 'alligator',
    name: 'Alligatoroid',
    scientific: 'Brachychampsa',
    group: 'Crocodilian — not a dinosaur',
    model: { url: m.alligator.url, length: m.alligator.length },
    note:
      'Brachychampsa, an early relative of alligators, lived in Hell Creek rivers. The model is a modern American alligator used as a stand-in, shown at 2.6 m. Crocodilians survived the extinction.',
  },
};

/** Anything the camera can follow: a dinosaur species or one of the other animals. */
export type FocusId = SpeciesId | FaunaId;

export const isFauna = (id: FocusId): id is FaunaId => id in FAUNA;

/** Size used to frame the camera on a followed animal (metres). */
export function focusSize(id: FocusId): { length: number; height: number } {
  if (!isFauna(id)) return { length: SPECIES[id].model.lengthM, height: SPECIES[id].model.heightM };
  // Body height in the swimming or flying pose (the pterosaur's rest pose is upright).
  const height = { azhdarchid: 1, mosasaur: 1.6, champsosaurus: 0.2, alligator: 0.45 }[id];
  return { length: FAUNA[id].model.length, height };
}

/** Short label for the focus buttons. */
export const focusLabel = (id: FocusId) =>
  isFauna(id) ? { azhdarchid: 'Pterosaur', mosasaur: 'Mosasaur', champsosaurus: 'Champsosaurus', alligator: 'Alligatoroid' }[id] : SPECIES[id].scientificName.split(' ')[0];

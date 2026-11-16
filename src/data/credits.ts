import assets from './generated/assets.json';
import sources from '../../pipeline/sources.json';
import { PBDB } from './species';

export interface Credit {
  title: string;
  creator: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  kind: string;
  use: string;
  rightsReview?: string;
}

export const CREDITS: Credit[] = [
  ...sources.objaverse.items.map((item) => ({
    title: item.title,
    creator: item.creator,
    license: item.license,
    licenseUrl: item.licenseUrl,
    sourceUrl: item.sourceUrl,
    kind: item.kind,
    use: item.modifications,
    rightsReview: item.rightsReview,
  })),
  ...sources.polyhaven.items.map((item) => ({
    title: item.title,
    creator: `${item.creator} (Poly Haven)`,
    license: sources.polyhaven.license,
    licenseUrl: sources.polyhaven.licenseUrl,
    sourceUrl: `https://polyhaven.com/a/${item.id}`,
    kind: item.type === 'hdri' ? 'sky' : 'environment',
    use: item.use,
  })),
  {
    title: 'Fossil occurrence and taxon records',
    creator: PBDB.source,
    license: PBDB.license,
    licenseUrl: PBDB.licenseUrl,
    sourceUrl: PBDB.sourceUrl,
    kind: 'data',
    use: `Occurrence counts, intervals, formations and regions, retrieved ${PBDB.retrieved.slice(0, 10)}.`,
  },
];

export const DOWNLOAD_BYTES = Object.values(assets.models).reduce((sum, m) => sum + m.bytes, 0)
  + Object.values(assets.hdri).reduce((sum, h) => sum + h.bytes, 0);

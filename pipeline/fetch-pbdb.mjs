// Fetches taxon and occurrence summaries for the two species from the
// Paleobiology Database (data released under CC BY 4.0) and writes
// src/data/generated/pbdb.json. Raw claims are summarised, not reinterpreted:
// fossil age ranges are kept as reported intervals, collection coordinates and
// model-dependent palaeocoordinates are kept separate, and identification
// qualifiers (e.g. "cf.") are counted rather than silently merged.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = 'https://paleobiodb.org/data1.2';
const taxa = ['Tyrannosaurus rex', 'Triceratops horridus'];

async function get(path) {
  const url = `${api}${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return { url, body: await response.json() };
}

function tally(records, key) {
  const counts = {};
  for (const record of records) {
    const value = key(record);
    if (value) counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

const result = {
  source: 'Paleobiology Database',
  sourceUrl: 'https://paleobiodb.org/',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  retrieved: new Date().toISOString(),
  notes: [
    'Fossil age bounds are the ages of the geological intervals containing occurrences; they are not an extinction date.',
    'Collection coordinates are modern localities. Palaeocoordinates are model-dependent (GPlates, mid-interval age as reported by PBDB).',
    'Occurrence points are not a range map.',
  ],
  taxa: {},
};

for (const name of taxa) {
  const encoded = encodeURIComponent(name);
  const taxon = await get(`/taxa/single.json?name=${encoded}&show=app,attr,class,parent,ecospace`);
  const occs = await get(`/occs/list.json?base_name=${encoded}&show=coords,loc,strat,paleoloc,ident`);
  const t = taxon.body.records[0];
  const records = occs.body.records;
  result.taxa[name] = {
    pbdbTaxonId: t.oid,
    pbdbTaxonUrl: `https://paleobiodb.org/classic/basicTaxonInfo?taxon_no=${t.oid.replace('txn:', '')}`,
    attribution: t.att,
    family: t.fml,
    higherGroup: t.cll,
    diet: t.jdt,
    lifeHabit: t.jlh,
    reportedOccurrences: t.noc,
    firstAppearanceMa: { max: t.fea, min: t.fla, interval: t.tei },
    lastAppearanceMa: { max: t.lea, min: t.lla, interval: t.tli },
    occurrences: {
      count: records.length,
      byInterval: tally(records, (r) => r.oei),
      byFormation: tally(records, (r) => r.sfm),
      byRegion: tally(records, (r) => [r.stp, r.cc2].filter(Boolean).join(', ')),
      qualified: records.filter((r) => r.rsg || r.idn).length,
      points: records
        .filter((r) => r.lat && r.lng)
        .map((r) => ({
          id: r.oid,
          lat: Number(r.lat),
          lng: Number(r.lng),
          paleoLat: r.pla ?? null,
          paleoLng: r.pln ?? null,
          paleoModel: r.pm1 ? `${r.pm1}${r.ps1 ? ` (${r.ps1})` : ''}` : null,
          interval: r.oei,
          formation: r.sfm ?? null,
        })),
    },
    queries: [taxon.url, occs.url],
  };
}

const target = join(root, 'src', 'data', 'generated', 'pbdb.json');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(result, null, 2)}\n`);
console.log(`wrote ${target}`);

import { useApp } from '../state';
import { SPECIES, PBDB } from '../data/species';
import { BarList } from './BarList';
import { isFauna } from '../data/fauna';
import { FaunaPanel } from './FaunaPanel';

const ma = (value: number) => `${value} Ma`;

export function SpeciesPanel() {
  const focus = useApp((s) => s.focus);
  const setPanel = useApp((s) => s.setPanel);
  if (isFauna(focus)) return <FaunaPanel id={focus} />;
  const species = SPECIES[focus];
  const record = species.fossilRecord;
  const occurrences = record.occurrences;
  const campanian = occurrences.byInterval.filter((i) => i.name.includes('Campanian')).reduce((n, i) => n + i.count, 0);

  return (
    <aside className="panel species" aria-label={`${species.scientificName} information`}>
      <header>
        <div>
          <h2><i>{species.scientificName}</i></h2>
          <p className="muted">{species.commonName} · {record.attribution}</p>
        </div>
        <button className="icon" onClick={() => setPanel(null)} aria-label="Close panel">×</button>
      </header>

      <p className="badge">Reconstruction · not a fossil scan</p>

      <dl className="facts">
        <div><dt>Model length</dt><dd>{species.model.lengthM} m</dd></div>
        <div><dt>Model height</dt><dd>{species.model.heightM} m</dd></div>
        <div><dt>Family</dt><dd>{record.family}</dd></div>
        <div><dt>Diet (PBDB)</dt><dd className="cap">{record.diet}</dd></div>
      </dl>

      <section>
        <h3>Fossil record</h3>
        <p>
          The Paleobiology Database lists <strong>{occurrences.count}</strong> occurrences.{' '}
          {occurrences.qualified} of them carry identification qualifiers such as “cf.”.
        </p>
        <h4>Occurrences by interval</h4>
        <BarList items={occurrences.byInterval} label="occurrences" />
        <h4>By formation</h4>
        <BarList items={occurrences.byFormation.slice(0, 5)} label="occurrences" />
        <p className="muted small">
          Reported range: first appearance {record.firstAppearanceMa.interval} ({ma(record.firstAppearanceMa.max)}–{ma(record.firstAppearanceMa.min)}),
          last appearance {record.lastAppearanceMa.interval} ({ma(record.lastAppearanceMa.max)}–{ma(record.lastAppearanceMa.min)}).
          {campanian > 0 && ` The Campanian lower bound rests on ${campanian} Late Campanian occurrence${campanian > 1 ? 's' : ''}; most records are Maastrichtian.`}
          {' '}These are bounds of the rock intervals, not an extinction date.
        </p>
        <p className="muted small">
          Regions: {occurrences.byRegion.slice(0, 5).map((r) => `${r.name} (${r.count})`).join(', ')}. Collection sites are not a range map.
        </p>
      </section>

      <section>
        <h3>What this reconstruction shows</h3>
        <ul className="notes">
          {species.reconstructionNotes.map((note) => <li key={note}>{note}</li>)}
        </ul>
        <p className="muted small">Editorial status: draft, not yet reviewed by a palaeontologist.</p>
      </section>

      <footer className="small">
        Data: <a href={record.pbdbTaxonUrl} target="_blank" rel="noreferrer">{PBDB.source}</a> ({PBDB.license}), retrieved {PBDB.retrieved.slice(0, 10)}.
      </footer>
    </aside>
  );
}

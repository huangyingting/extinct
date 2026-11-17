import sources from '../../pipeline/sources.json';
import { FAUNA, type FaunaId } from '../data/fauna';
import { useApp } from '../state';

/** Information on a pterosaur or aquatic reptile: what group it belongs to and what the model is. */
export function FaunaPanel({ id }: { id: FaunaId }) {
  const setPanel = useApp((s) => s.setPanel);
  const fauna = FAUNA[id];
  const source = sources.objaverse.items.find((item) => item.id === id);
  return (
    <aside className="panel species" aria-label={`${fauna.name} information`}>
      <header>
        <div>
          <h2>{fauna.name}</h2>
          <p className="muted"><i>{fauna.scientific}</i></p>
        </div>
        <button className="icon" onClick={() => setPanel(null)} aria-label="Close panel">×</button>
      </header>
      <p className="badge">Not a dinosaur · reconstruction, not a fossil scan</p>
      <section>
        <h3>Group</h3>
        <p>{fauna.group}</p>
        <h3>What the model shows</h3>
        <p>{fauna.note}</p>
        {source && (
          <p className="muted small">
            Model: <a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.title}</a> by {source.creator} ({source.license}). {source.modifications}
          </p>
        )}
      </section>
      <footer className="small">Editorial status: draft, not yet reviewed by a palaeontologist.</footer>
    </aside>
  );
}

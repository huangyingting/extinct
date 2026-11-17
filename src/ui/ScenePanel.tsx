import { SCENES, type SceneNote } from '../data/scenes';
import { useApp } from '../state';

const BASIS: Record<SceneNote['basis'], string> = {
  evidence: 'Fossil evidence',
  inferred: 'Inferred',
  debated: 'Debated',
  staging: 'Staging choice',
};

/** What the current scene is based on, with each claim labelled by how firm it is. */
export function ScenePanel() {
  const sceneId = useApp((s) => s.scene);
  const setPanel = useApp((s) => s.setPanel);
  const scene = SCENES[sceneId];
  return (
    <aside className="panel scene-notes" aria-label="About this scene">
      <header>
        <div>
          <h2>{scene.title}</h2>
          <p className="muted">{scene.era}</p>
        </div>
        <button className="icon" onClick={() => setPanel(null)} aria-label="Close panel">×</button>
      </header>
      <section>
        <h3>What this scene is based on</h3>
        <ul className="claims">
          {scene.notes.map((note) => (
            <li key={note.text}>
              <span className={`basis basis-${note.basis}`}>{BASIS[note.basis]}</span>
              <p>{note.text}</p>
            </li>
          ))}
        </ul>
      </section>
      {scene.references.length > 0 && (
        <section>
          <h3>References</h3>
          <ul className="references small">
            {scene.references.map((ref) => (
              <li key={ref.url}>
                <a href={ref.url} target="_blank" rel="noreferrer">{ref.label}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <footer className="small">Editorial status: draft, not yet reviewed by a palaeontologist.</footer>
    </aside>
  );
}

import { useProgress } from '@react-three/drei';
import { SCENES, TIMELINE } from '../data/scenes';
import { SPECIES, type SpeciesId } from '../data/species';
import { useApp, type Behaviour } from '../state';
import { CreditsPanel } from './CreditsPanel';
import { ScenePanel } from './ScenePanel';
import { FpsMeter } from './FpsMeter';
import { SpeciesPanel } from './SpeciesPanel';

const BEHAVIOURS: { id: Behaviour; label: string }[] = [
  { id: 'auto', label: 'Natural' },
  { id: 'walk', label: 'Walk' },
  { id: 'rest', label: 'Stay' },
];

function Loader() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="loader" role="status">
      <div className="loader-bar"><span style={{ width: `${progress}%` }} /></div>
      <p>Reconstructing the Late Cretaceous… {Math.round(progress)}%</p>
    </div>
  );
}

export function Overlay() {
  const { scene, focus, follow, behaviour, panel } = useApp();
  const { setScene, setFocus, setFollow, setBehaviour, triggerAction, setPanel } = useApp();
  const config = SCENES[scene];
  const outdoor = config.kind === 'outdoor';
  const animals = outdoor && config.animals.length > 0;
  const present = new Set(outdoor ? config.animals.map((a) => a.species) : []);

  return (
    <div className="overlay">
      <header className="title">
        <p className="eyebrow">Extinct · Hell Creek Formation · {config.era}</p>
        <h1>{config.title}</h1>
        <p className="muted">{config.subtitle}</p>
        <nav className="timeline" aria-label="Scenes in time order">
          {TIMELINE.map((group) => (
            <div className="timeline-group" key={group.label}>
              <span className="timeline-label">{group.label}</span>
              <div className="scenes">
                {group.scenes.map((id) => (
                  <button
                    key={id}
                    className={id === scene ? 'active' : ''}
                    aria-pressed={id === scene}
                    title={`${SCENES[id].title} · ${SCENES[id].era}`}
                    onClick={() => {
                      const next = SCENES[id];
                      setScene(id, next.kind === 'outdoor' ? next.camera.focus : undefined);
                    }}
                  >
                    {SCENES[id].short}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </header>

      {animals && (
        <div className="controls" role="group" aria-label="Animal controls">
          <div className="segmented" aria-label="Focus species">
            {(Object.keys(SPECIES) as SpeciesId[]).filter((id) => present.has(id)).map((id) => (
              <button key={id} className={id === focus ? 'active' : ''} aria-pressed={id === focus} onClick={() => setFocus(id)}>
                <i>{SPECIES[id].scientificName.split(' ')[0]}</i>
              </button>
            ))}
          </div>
          <div className="segmented" aria-label="Behaviour">
            {BEHAVIOURS.map((b) => (
              <button key={b.id} className={b.id === behaviour ? 'active' : ''} aria-pressed={b.id === behaviour} onClick={() => setBehaviour(b.id)}>
                {b.label}
              </button>
            ))}
          </div>
          <button className="primary" onClick={triggerAction}>{SPECIES[focus].actionLabel}</button>
          <label className="toggle">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
          </label>
        </div>
      )}

      {!outdoor && (
        <div className="controls fossil-note">
          <p>
            <strong>Fossil evidence, not a reconstruction.</strong> Photogrammetry of the Smithsonian’s mounted
            <i> Tyrannosaurus rex</i> skeleton, unearthed in Montana from 1988, posed over a <i>Triceratops</i>. The
            Triceratops is a digital composite, scaled from bones of several specimens. Skin, colour and posture in the
            other scenes are inferred from evidence like this.
          </p>
        </div>
      )}

      {outdoor && !animals && (
        <div className="controls fossil-note">
          <p>
            <strong>No dinosaurs here.</strong> Non-avian dinosaurs do not occur above the boundary clay. Open the scene
            notes for what this landscape is based on.
          </p>
        </div>
      )}

      <div className="corner">
        {panel !== 'scene' && <button onClick={() => setPanel('scene')}>Scene notes</button>}
        {animals && panel !== 'species' && <button onClick={() => setPanel('species')}>Species info</button>}
        <button onClick={() => setPanel(panel === 'credits' ? null : 'credits')}>Sources &amp; credits</button>
      </div>

      {panel === 'species' && animals && <SpeciesPanel />}
      {panel === 'scene' && <ScenePanel />}
      {panel === 'credits' && <CreditsPanel />}

      <p className="hint">Drag to orbit · scroll to zoom{follow && animals ? '' : ' · right-drag to pan'}</p>
      <FpsMeter />
      <Loader />
    </div>
  );
}

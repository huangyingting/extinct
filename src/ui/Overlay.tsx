import { useProgress } from '@react-three/drei';
import { defaultFocus, SCENES, TIMELINE } from '../data/scenes';
import { SPECIES } from '../data/species';
import { FAUNA, focusLabel, isFauna, type FocusId } from '../data/fauna';
import { useApp, type Behaviour } from '../state';
import { CreditsPanel } from './CreditsPanel';
import { ScenePanel } from './ScenePanel';
import { TourDriver } from './TourDriver';
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
  const { scene, focus, follow, behaviour, panel, sound, tour } = useApp();
  const { setScene, setFocus, setFollow, setBehaviour, triggerAction, setPanel, setSound, setTour } = useApp();
  const config = SCENES[scene];
  const outdoor = config.kind === 'outdoor';
  const dinosaurs = outdoor && config.animals.length > 0;
  // Followable subjects: dinosaur species first, then the other animals in the scene.
  const subjects: FocusId[] = outdoor
    ? [...new Set<FocusId>([...config.animals.map((a) => a.species), ...(config.fauna ?? []).map((f) => f.fauna)])]
    : [];
  const animals = subjects.length > 0;
  const dinosaurFocus = !isFauna(focus) && dinosaurs && subjects.includes(focus);

  return (
    <div className="overlay">
      {/* Each scene fades in from black. */}
      <div className="scene-fade" key={scene} aria-hidden />
      <TourDriver />
      <header className="title">
        <p className="eyebrow">Extinct · {config.formation ?? 'Hell Creek Formation'} · {config.era}</p>
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
                      setScene(id, defaultFocus(id));
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

      {outdoor && !dinosaurs && config.emptyNote && (
        <div className="empty-note">
          <p>{config.emptyNote}</p>
        </div>
      )}

      {animals && (
        <div className="controls" role="group" aria-label="Animal controls">
          <div className="segmented" aria-label="Follow animal">
            {subjects.map((id) => (
              <button key={id} className={id === focus ? 'active' : ''} aria-pressed={id === focus} onClick={() => setFocus(id)} title={isFauna(id) ? FAUNA[id].group : undefined}>
                {isFauna(id) ? focusLabel(id) : <i>{focusLabel(id)}</i>}
              </button>
            ))}
          </div>
          {dinosaurFocus && (
            <div className="segmented" aria-label="Behaviour">
              {BEHAVIOURS.map((b) => (
                <button key={b.id} className={b.id === behaviour ? 'active' : ''} aria-pressed={b.id === behaviour} onClick={() => setBehaviour(b.id)}>
                  {b.label}
                </button>
              ))}
            </div>
          )}
          {dinosaurFocus && !isFauna(focus) && <button className="primary" onClick={triggerAction}>{SPECIES[focus].actionLabel}</button>}
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


      <div className="corner">
        <button aria-pressed={tour} className={tour ? 'active' : ''} onClick={() => setTour(!tour)} title="Slow camera orbit through every scene; drag to take over">
          {tour ? 'Stop tour' : 'Tour'}
        </button>
        {outdoor && (
          <button aria-pressed={sound} onClick={() => setSound(!sound)} title="Synthesised wind, water, insects and impact rumble; no dinosaur calls">
            {sound ? 'Sound on' : 'Sound off'}
          </button>
        )}
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

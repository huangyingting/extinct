import { useApp } from '../state';
import { CREDITS, DOWNLOAD_BYTES } from '../data/credits';

export function CreditsPanel() {
  const setPanel = useApp((s) => s.setPanel);
  return (
    <aside className="panel credits" aria-label="Sources and credits">
      <header>
        <h2>Sources &amp; credits</h2>
        <button className="icon" onClick={() => setPanel(null)} aria-label="Close panel">×</button>
      </header>
      <p className="muted small">
        Every model, texture, sky and dataset used here, with its licence and the modifications made for this prototype.
        Licences marked “uploader-asserted” come from Sketchfab metadata mirrored by Objaverse and have not been independently verified.
        About {(DOWNLOAD_BYTES / 1e6).toFixed(0)} MB of models and skies are loaded.
      </p>
      <ul className="credit-list">
        {CREDITS.map((credit) => (
          <li key={credit.title + credit.creator}>
            <div className="credit-title">
              <a href={credit.sourceUrl} target="_blank" rel="noreferrer">{credit.title}</a>
              <span className={`kind kind-${credit.kind}`}>{credit.kind}</span>
            </div>
            <div className="small">
              {credit.creator} · <a href={credit.licenseUrl} target="_blank" rel="noreferrer">{credit.license}</a>
            </div>
            <div className="small muted">{credit.use}</div>
            {credit.rightsReview && <div className="small muted">Rights: {credit.rightsReview}</div>}
          </li>
        ))}
      </ul>
    </aside>
  );
}

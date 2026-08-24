import { getRiskTone } from "../utils/fallbackLogic";

function ResultCard({ title, badge, metrics, sections }) {
  const toneClass = `tone-${getRiskTone(badge)}`;

  return (
    <article className="result-card" aria-live="polite">
      <div className="result-heading">
        <h3>{title}</h3>
        <span className={`result-badge ${toneClass}`}>{badge}</span>
      </div>

      <div className="metrics-grid">
        {metrics.map((metric) => (
          <div className="metric-box" key={metric.label}>
            <span className="metric-label">{metric.label}</span>
            <strong className="metric-value">{metric.value}</strong>
          </div>
        ))}
      </div>

      {sections.map((section) => (
        <div className="result-block" key={section.label}>
          <span className="result-label">{section.label}</span>

          {section.type === "chips" && (
            <div className="chip-list">
              {section.items.map((item) => (
                <span className="chip-tag" key={item}>
                  {item}
                </span>
              ))}
            </div>
          )}

          {section.type === "list" && (
            <ul className="result-list">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}

          {section.type === "text" && <p className="result-copy">{section.content}</p>}
        </div>
      ))}
    </article>
  );
}

export default ResultCard;


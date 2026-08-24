import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildResultDashboard } from "../utils/resultAnalytics";
import BarAnalysisChart from "./BarAnalysisChart";
import RiskMeter from "./RiskMeter";
import ScoreRing from "./ScoreRing";
import StatCard from "./StatCard";

function TimelineTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0];

  return (
    <div className="chart-tooltip">
      <strong>{item.payload.stage}</strong>
      <span>{item.value}% score</span>
    </div>
  );
}

function DetailBlock({ block }) {
  if (block.type === "chips") {
    return (
      <article className="dashboard-detail-card">
        <div className="dashboard-card-top">
          <div>
            <span className="result-label">Detailed Insight</span>
            <h4>{block.title}</h4>
          </div>
        </div>
        <div className="chip-list">
          {block.items.map((item) => (
            <span className="chip-tag" key={item}>
              {item}
            </span>
          ))}
        </div>
      </article>
    );
  }

  if (block.type === "shap") {
    return (
      <article className="dashboard-detail-card">
        <div className="dashboard-card-top">
          <div>
            <span className="result-label">Detailed Insight</span>
            <h4>{block.title}</h4>
          </div>
          <span className="chart-mini-pill">Model attribution</span>
        </div>
        {block.riskFeatures.length > 0 && (
          <div className="shap-group">
            <span className="shap-group-label shap-risk-label">↑ Pushing toward scam</span>
            <div className="chip-list">
              {block.riskFeatures.map((f) => (
                <span className="chip-tag chip-tag-risk" key={f}>{f}</span>
              ))}
            </div>
          </div>
        )}
        {block.safeFeatures.length > 0 && (
          <div className="shap-group">
            <span className="shap-group-label shap-safe-label">↓ Pushing toward safe</span>
            <div className="chip-list">
              {block.safeFeatures.map((f) => (
                <span className="chip-tag chip-tag-safe" key={f}>{f}</span>
              ))}
            </div>
          </div>
        )}
      </article>
    );
  }

  if (block.type === "list") {
    return (
      <article className="dashboard-detail-card">
        <div className="dashboard-card-top">
          <div>
            <span className="result-label">Detailed Insight</span>
            <h4>{block.title}</h4>
          </div>
        </div>
        <ul className="result-list">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </article>
    );
  }

  if (block.type === "nlp") {
    return (
      <article className="dashboard-detail-card">
        <div className="dashboard-card-top">
          <div>
            <span className="result-label">Language &amp; NLP</span>
            <h4>{block.title}</h4>
          </div>
          <span className="chart-mini-pill">Multilingual NLP</span>
        </div>
        <div className="nlp-meta-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", marginTop: "12px", width: "100%" }}>
          {block.metrics.map((m) => (
            <div className="preview-stat" key={m.label} style={{ padding: "10px 12px", background: "rgba(8, 20, 29, 0.72)", borderRadius: "12px", border: "1px solid rgba(183, 235, 255, 0.08)" }}>
              <span className="metric-label" style={{ fontSize: "0.72rem", color: "var(--text-soft)", display: "block" }}>{m.label}</span>
              <strong style={{ fontSize: "0.95rem", color: "var(--text-main)", fontWeight: "700" }}>{m.value}</strong>
            </div>
          ))}
        </div>
        {block.notes && block.notes.length > 0 && (
          <ul className="result-list" style={{ marginTop: "12px" }}>
            {block.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </article>
    );
  }

  return (
    <article className="dashboard-detail-card">
      <div className="dashboard-card-top">
        <div>
          <span className="result-label">Detailed Insight</span>
          <h4>{block.title}</h4>
        </div>
      </div>
      <p className="result-copy">{block.content}</p>
    </article>
  );
}

function ResultDashboard({ type, result, source }) {
  const dashboard = buildResultDashboard(type, result, source);

  if (!dashboard) {
    return null;
  }

  return (
    <article className="result-dashboard" aria-live="polite">
      <div className="result-heading">
        <div>
          <span className="result-label">Analysis Dashboard</span>
          <h3>{dashboard.title}</h3>
          <p className="dashboard-subtitle">{dashboard.subtitle}</p>
        </div>
        <span className={`result-badge tone-${dashboard.badgeTone}`}>{dashboard.badge}</span>
      </div>

      <div className="dashboard-insight-grid">
        <article className="dashboard-insight-card">
          <span className="result-label">{dashboard.insights.sourceLabel}</span>
          <strong>{dashboard.insights.sourcePreview}</strong>
        </article>
        <article className="dashboard-insight-card">
          <span className="result-label">Primary Signal</span>
          <strong>
            {dashboard.insights.topSignal} {dashboard.insights.topSignalValue}%
          </strong>
        </article>
        <article className="dashboard-insight-card">
          <span className="result-label">Red Flags</span>
          <strong>{result.redFlags.length}</strong>
        </article>
      </div>

      <div className="dashboard-stat-grid">
        {dashboard.cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            suffix={card.suffix}
            helper={card.helper}
            tone={card.tone}
          />
        ))}
      </div>

      <div className="dashboard-hero-grid">
        <div className="dashboard-mini-grid">
          <article className="dashboard-chart-card dashboard-ring-card">
            <ScoreRing
              value={dashboard.ring.value}
              label={dashboard.ring.label}
              subtitle={dashboard.ring.subtitle}
              tone={dashboard.ring.tone}
              confidenceLow={result.confidenceLow}
              confidenceHigh={result.confidenceHigh}
            />
          </article>
          <article className="dashboard-chart-card">
            <RiskMeter
              label={dashboard.meter.label}
              value={dashboard.meter.value}
              inverse={dashboard.meter.inverse}
              tone={dashboard.meter.tone}
              leftLabel={dashboard.meter.leftLabel}
              middleLabel={dashboard.meter.middleLabel}
              rightLabel={dashboard.meter.rightLabel}
              description={dashboard.meter.description}
            />
          </article>
        </div>

        <BarAnalysisChart
          title={dashboard.barChart.title}
          description={dashboard.barChart.description}
          data={dashboard.barChart.data}
        />
      </div>

      <div className="dashboard-lower-grid">
        <article className="dashboard-chart-card">
          <div className="dashboard-card-top">
            <div>
              <span className="result-label">Line Graph</span>
              <h4>{dashboard.timeline.title}</h4>
            </div>
            <span className="chart-mini-pill">Signal flow</span>
          </div>
          <p className="dashboard-chart-copy">{dashboard.timeline.description}</p>

          <div className="dashboard-chart-canvas">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dashboard.timeline.data} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#57c8ff" stopOpacity={0.35}></stop>
                    <stop offset="100%" stopColor="#57c8ff" stopOpacity={0.02}></stop>
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(183, 235, 255, 0.08)" />
                <XAxis
                  dataKey="stage"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgba(206, 225, 235, 0.72)", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgba(156, 180, 198, 0.8)", fontSize: 12 }}
                  domain={[0, 100]}
                />
                <Tooltip cursor={{ stroke: "rgba(126,244,218,0.28)" }} content={<TimelineTooltip />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#7ef4da"
                  strokeWidth={3}
                  fill="url(#areaFill)"
                  activeDot={{ r: 6, fill: "#ffbe72", stroke: "#071018", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="dashboard-chart-card">
          <div className="dashboard-card-top">
            <div>
              <span className="result-label">Progress Indicators</span>
              <h4>Detailed Insight Scores</h4>
            </div>
            <span className="chart-mini-pill">Live bars</span>
          </div>

          <div className="progress-analysis-list">
            {dashboard.progressItems.map((item) => (
              <div className="progress-analysis-item" key={item.label}>
                <div className="progress-analysis-head">
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.note}</p>
                  </div>
                  <span className={`progress-value tone-${item.tone}`}>{item.value}%</span>
                </div>
                <div className="progress-bar-shell">
                  <span
                    className={`progress-bar-fill progress-bar-${item.tone}`}
                    style={{ "--progress-width": `${item.value}%` }}
                  ></span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="dashboard-detail-grid">
        {dashboard.detailBlocks.map((block) => (
          <DetailBlock key={`${block.title}-${block.type}`} block={block} />
        ))}
      </div>
    </article>
  );
}

export default ResultDashboard;

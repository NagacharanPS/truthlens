function RiskMeter({
  value,
  label,
  leftLabel = "Low",
  middleLabel = "Medium",
  rightLabel = "High",
  description,
  tone = "low",
  inverse = false,
}) {
  const normalized = Math.max(0, Math.min(100, value));
  const pointerPosition = normalized;

  return (
    <div className={`risk-meter-card tone-${tone}`}>
      <span className="result-label">{label}</span>
      <div className="risk-meter-shell">
        <div className="risk-meter-bar">
          <div className="risk-meter-glow" style={{ left: `${pointerPosition}%` }}></div>
          <div className="risk-meter-pointer" style={{ left: `${pointerPosition}%` }}></div>
        </div>

        <div className="risk-meter-labels">
          <span>{leftLabel}</span>
          <span>{middleLabel}</span>
          <span>{rightLabel}</span>
        </div>
      </div>
      <p className="risk-meter-copy">{description}</p>
    </div>
  );
}

export default RiskMeter;

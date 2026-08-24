import { useEffect, useState } from "react";

const ringColors = {
  low: "#7ef4da",
  medium: "#ffbe72",
  high: "#ff7b64",
  safe: "#7ef4da",
  unsafe: "#ff7b64",
};

function ScoreRing({ value, label, subtitle, tone = "low", confidenceLow, confidenceHigh }) {
  const normalizedValue = Math.max(0, Math.min(100, value));
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (normalizedValue / 100) * circumference;
  const [displayValue, setDisplayValue] = useState(0);
  const [animatedOffset, setAnimatedOffset] = useState(circumference);
  const ringColor = ringColors[tone] || ringColors.low;

  const hasConfidenceBand = confidenceLow !== undefined && confidenceHigh !== undefined;

  useEffect(() => {
    const duration = 900;
    const start = performance.now();
    let animationFrame = 0;

    setAnimatedOffset(circumference);
    window.requestAnimationFrame(() => {
      setAnimatedOffset(strokeDashoffset);
    });

    const animate = (time) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(normalizedValue * eased));

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [circumference, normalizedValue, strokeDashoffset]);

  return (
    <div className="score-ring-card">
      <span className="result-label">{label}</span>
      <div className="score-ring-shell">
        <svg className="score-ring" viewBox="0 0 140 140" role="img" aria-label={`${label} ${normalizedValue}%`}>
          <circle className="score-ring-track" cx="70" cy="70" r={radius}></circle>
          <circle
            className="score-ring-progress"
            cx="70"
            cy="70"
            r={radius}
            style={{
              stroke: ringColor,
              strokeDasharray: circumference,
              strokeDashoffset: animatedOffset,
            }}
          ></circle>
        </svg>

        <div className="score-ring-center">
          <strong>{displayValue}%</strong>
          <span>{subtitle}</span>
        </div>
      </div>

      {hasConfidenceBand && (
        <div className="score-ring-confidence">
          <span className="result-label">Confidence band</span>
          <span className="confidence-band-value">
            {confidenceLow}% – {confidenceHigh}%
          </span>
          <div className="confidence-band-bar-shell">
            <div
              className="confidence-band-bar-fill"
              style={{
                left: `${confidenceLow}%`,
                width: `${confidenceHigh - confidenceLow}%`,
                backgroundColor: ringColor,
              }}
            />
            <div
              className="confidence-band-marker"
              style={{ left: `${normalizedValue}%`, borderColor: ringColor }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ScoreRing;

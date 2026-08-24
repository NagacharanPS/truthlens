import { useEffect, useState } from "react";

function StatCard({ label, value, suffix = "", helper, tone = "low" }) {
  const isNumber = typeof value === "number";
  const [displayValue, setDisplayValue] = useState(isNumber ? 0 : value);

  useEffect(() => {
    if (!isNumber) {
      setDisplayValue(value);
      return undefined;
    }

    const duration = 800;
    const start = performance.now();
    let animationFrame = 0;

    const animate = (time) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [isNumber, value]);

  return (
    <article className={`stat-card stat-card-${tone}`}>
      <span className="metric-label">{label}</span>
      <strong className="stat-card-value">
        {displayValue}
        {isNumber ? suffix : ""}
      </strong>
      {helper && <p className="stat-card-helper">{helper}</p>}
    </article>
  );
}

export default StatCard;


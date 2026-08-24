function Hero({ signals, alerts, onVerifyNow, onLiveDemo }) {
  const alertToneClass = {
    warning: "warning-icon",
    scan: "scan-icon",
    shield: "block-icon",
    wave: "voice-icon",
  };

  const iconMap = {
    warning: (
      <svg viewBox="0 0 24 24" role="presentation">
        <path d="M12 3L22 20H2L12 3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"></path>
        <path d="M12 8.7V13.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"></path>
        <circle cx="12" cy="17.2" r="1" fill="currentColor"></circle>
      </svg>
    ),
    scan: (
      <svg viewBox="0 0 24 24" role="presentation">
        <path d="M8 4H5V8M16 4H19V8M19 16V19H16M8 19H5V16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path>
        <path d="M8.6 12H15.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"></path>
      </svg>
    ),
    shield: (
      <svg viewBox="0 0 24 24" role="presentation">
        <path d="M12 3L19 7V12C19 17 16.3 20.5 12 22C7.7 20.5 5 17 5 12V7L12 3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"></path>
        <path d="M9 12.1L11.1 14.2L15.2 10.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path>
      </svg>
    ),
    wave: (
      <svg viewBox="0 0 24 24" role="presentation">
        <path d="M5 13C6.4 13 6.4 9 7.8 9C9.2 9 9.2 15 10.6 15C12 15 12 7 13.4 7C14.8 7 14.8 17 16.2 17C17.6 17 17.6 11 19 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path>
      </svg>
    ),
  };

  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">
          <span className="eyebrow-pulse" />
          Multilingual Threat &amp; Scam Detection
        </p>

        <h1>AI Deepfake &amp; Scam Verification Assistant</h1>
        <p className="subtitle">
          Detect multilingual text scams, image manipulation, and malicious URLs in seconds using AI-powered verification.
        </p>

        <div className="cta-group">
          <button className="btn btn-primary" type="button" onClick={onVerifyNow}>
            Verify Now
          </button>
          <button className="btn btn-secondary" type="button" onClick={onLiveDemo}>
            Live Demo
          </button>
        </div>

        <div className="signal-strip">
          {signals.map((signal) => (
            <div className="signal-chip" key={signal.title}>
              <span className="chip-title">{signal.title}</span>
              <span className="chip-value">{signal.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hero-visual" aria-hidden="true">
        <div className="orb orb-a"></div>
        <div className="orb orb-b"></div>
        <div className="orb orb-c"></div>
        <div className="scan-grid"></div>
        <div className="scan-beam"></div>

        <div className="shield-zone">
          <div className="radar-ring ring-a"></div>
          <div className="radar-ring ring-b"></div>
          <div className="shield-shell">
            <div className="shield-glow"></div>
            <div className="shield-lines"></div>

            <svg className="shield-icon" viewBox="0 0 240 280" role="presentation">
              <defs>
                <linearGradient id="shieldFill" x1="30" y1="20" x2="210" y2="250" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#70f4de" stopOpacity="0.34"></stop>
                  <stop offset="0.58" stopColor="#238cf5" stopOpacity="0.2"></stop>
                  <stop offset="1" stopColor="#ff9d52" stopOpacity="0.18"></stop>
                </linearGradient>
                <linearGradient id="shieldStroke" x1="47" y1="20" x2="193" y2="250" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#b9fff3"></stop>
                  <stop offset="0.52" stopColor="#7bcaff"></stop>
                  <stop offset="1" stopColor="#ffbc7d"></stop>
                </linearGradient>
              </defs>
              <path d="M120 16L198 46V134C198 196 167 235 120 264C73 235 42 196 42 134V46L120 16Z" fill="url(#shieldFill)" stroke="url(#shieldStroke)" strokeWidth="5"></path>
              <path d="M76 109C92 92 112 84 135 84C157 84 174 95 185 113" stroke="#d8fffa" strokeWidth="7" strokeLinecap="round"></path>
              <path d="M73 111C89 136 111 149 138 149C163 149 181 138 191 121" stroke="#79f9df" strokeWidth="5" strokeLinecap="round" opacity="0.9"></path>
              <circle cx="129" cy="114" r="19" fill="#0c1a2b" stroke="#f7fffb" strokeWidth="5"></circle>
              <circle cx="129" cy="114" r="8" fill="#7ef4da"></circle>
              <path d="M77 171H164" stroke="#a0d8ff" strokeWidth="5" strokeLinecap="round" opacity="0.84"></path>
              <path d="M91 190H149" stroke="#ffb566" strokeWidth="5" strokeLinecap="round" opacity="0.72"></path>
              <path d="M92 66L81 82" stroke="#ffb566" strokeWidth="4" strokeLinecap="round" opacity="0.9"></path>
              <path d="M167 68L177 83" stroke="#8eeeff" strokeWidth="4" strokeLinecap="round" opacity="0.9"></path>
            </svg>

            <div className="shield-readout">
              <span className="readout-label">Trust Index</span>
              <strong>99.2%</strong>
            </div>
          </div>
        </div>

        {alerts.map((alert) => (
          <article className={`float-card ${alert.className}`} key={alert.id}>
            <div className={`card-icon ${alertToneClass[alert.icon]}`}>{iconMap[alert.icon]}</div>
            <div>
              <p>{alert.eyebrow}</p>
              <strong>{alert.title}</strong>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default Hero;

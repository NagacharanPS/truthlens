import { Suspense, lazy } from "react";
import Loader from "./Loader";
import { SUPPORTED_LANGUAGES } from "../config/languages";

const ResultDashboard = lazy(() => import("./ResultDashboard"));

function TextVerifier({
  value,
  onChange,
  onSubmit,
  onClear,
  result,
  loading,
  error,
  notice,
  language = "auto",
  onLanguageChange,
}) {
  return (
    <div className="tool-layout">
      <form className="tool-form" onSubmit={onSubmit}>
        <div className="tool-panel-header">
          <div>
            <span className="result-label">Multilingual Verification Module</span>
            <h3 className="tool-section-title">Text Threat &amp; Scam Verification</h3>
          </div>
        </div>

        <div className="tool-meta-grid">
          <article className="tool-meta-card">
            <span className="result-label">Supported Languages</span>
            <p>English, ಕನ್ನಡ (Kannada), हिन्दी (Hindi), తెలుగు (Telugu).</p>
          </article>
          <article className="tool-meta-card">
            <span className="result-label">Output</span>
            <p>Unified status, threat score, language detection, red flags, and localized safety guidance.</p>
          </article>
        </div>

        <div className="language-selector-block" style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <label className="tool-label" htmlFor="textLanguageSelect" style={{ margin: 0 }}>
              Language Selection
            </label>
            <span className="chart-mini-pill" style={{ fontSize: "0.74rem" }}>
              Supported Languages
            </span>
          </div>
          <select
            id="textLanguageSelect"
            className="tool-input tool-select"
            value={language}
            onChange={(event) => onLanguageChange && onLanguageChange(event.target.value)}
            style={{ cursor: "pointer" }}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code} style={{ background: "#0b1822", color: "#f2f7fa" }}>
                {lang.nativeName}
              </option>
            ))}
          </select>
          <p className="tool-hint" style={{ marginTop: "6px", marginBottom: 0 }}>
            Leave on <strong>Auto Detect</strong> for automatic detection, or pick a language as a verification hint.
          </p>
        </div>

        <label className="tool-label" htmlFor="textToCheck">
          Paste suspicious text in any supported language
        </label>
        <p className="tool-hint">Use this for SMS, WhatsApp messages, bank notices, emails, or direct messages.</p>
        <textarea
          id="textToCheck"
          className="tool-input tool-textarea"
          placeholder="Paste a suspicious message here in English, Kannada, Hindi, or Telugu..."
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            Verify Content
          </button>
          <button className="btn btn-secondary" type="button" onClick={onClear} disabled={loading}>
            Clear
          </button>
        </div>
      </form>

      {(notice || error || loading || result) && (
        <div className="panel-stack">
          {notice && <div className="inline-banner inline-banner-info">{notice}</div>}
          {error && <div className="inline-banner inline-banner-warning">{error}</div>}
          {loading && (
            <Loader
              message="Detecting language, analyzing threat patterns, urgency signals, and social-engineering cues..."
            />
          )}

          {!loading && result && (
            <Suspense fallback={<Loader message="Loading analytics dashboard..." />}>
              <ResultDashboard type="text" result={result} source={value} />
            </Suspense>
          )}
        </div>
      )}
    </div>
  );
}

export default TextVerifier;

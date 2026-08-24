import { Suspense, lazy } from "react";
import Loader from "./Loader";

const ResultDashboard = lazy(() => import("./ResultDashboard"));

function UrlVerifier({ value, onChange, onSubmit, onClear, result, loading, error, notice }) {
  return (
    <div className="tool-layout">
      <form className="tool-form" onSubmit={onSubmit}>
        <div className="tool-panel-header">
          <div>
            <span className="result-label">Web Security Module</span>
            <h3 className="tool-section-title">URL Scam &amp; Phishing Verification</h3>
          </div>
        </div>

        <div className="tool-meta-grid">
          <article className="tool-meta-card">
            <span className="result-label">Checks</span>
            <p>Fake domains, suspicious keywords, HTTPS, shortened links, and common phishing structures.</p>
          </article>
          <article className="tool-meta-card">
            <span className="result-label">Output</span>
            <p>Unified status, risk score, confidence, red flags, and a clear recommendation.</p>
          </article>
        </div>

        <label className="tool-label" htmlFor="urlToCheck">
          Paste suspicious link
        </label>
        <p className="tool-hint">Use this to inspect phishing patterns, fake domains, unsafe structure, and trust signals.</p>
        <input
          id="urlToCheck"
          className="tool-input"
          type="url"
          inputMode="url"
          placeholder="https://example.com"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            Verify URL
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
              message="Checking domain trust, HTTPS availability, phishing keywords, and suspicious URL structure."
            />
          )}

          {!loading && result && (
            <Suspense fallback={<Loader message="Loading analytics dashboard..." />}>
              <ResultDashboard type="url" result={result} source={value} />
            </Suspense>
          )}
        </div>
      )}
    </div>
  );
}

export default UrlVerifier;

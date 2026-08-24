import { Suspense, lazy } from "react";
import Loader from "./Loader";
import { getImagePreviewStats } from "../utils/fallbackLogic";
import { SUPPORTED_LANGUAGES } from "../config/languages";

const ResultDashboard = lazy(() => import("./ResultDashboard"));

function ImageVerifier({
  inputKey,
  imageSource,
  onFileChange,
  onSubmit,
  onClear,
  result,
  loading,
  error,
  notice,
  language = "auto",
  onLanguageChange,
}) {
  const previewStats = imageSource ? getImagePreviewStats(imageSource) : [];

  return (
    <div className="tool-layout">
      <form className="tool-form" onSubmit={onSubmit}>
        <div className="tool-panel-header">
          <div>
            <span className="result-label">Multimodal Verification Module</span>
            <h3 className="tool-section-title">Image Authenticity &amp; OCR Verification</h3>
          </div>
        </div>

        <div className="tool-meta-grid">
          <article className="tool-meta-card">
            <span className="result-label">Accepted Content</span>
            <p>Screenshots (WhatsApp, SMS, Bank, UPI), Photos, Documents, and AI deepfakes.</p>
          </article>
          <article className="tool-meta-card">
            <span className="result-label">OCR &amp; Forensics</span>
            <p>Multilingual text extraction across 4 languages + CLIP visual AI + C2PA provenance.</p>
          </article>
        </div>

        <div className="language-selector-block" style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <label className="tool-label" htmlFor="imageLanguageSelect" style={{ margin: 0 }}>
              OCR Language Selection
            </label>
            <span className="chart-mini-pill" style={{ fontSize: "0.74rem" }}>
              Multilingual OCR
            </span>
          </div>
          <select
            id="imageLanguageSelect"
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
            Supports screenshots in English, Kannada, Hindi, and Telugu.
          </p>
        </div>

        <label className="tool-label" htmlFor="imageToCheck">
          Upload screenshot or suspicious image
        </label>
        <p className="tool-hint">
          Extracts and verifies screenshot text while performing visual forensic and AI deepfake analysis.
        </p>
        <input
          key={inputKey}
          id="imageToCheck"
          className="tool-input tool-file"
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={onFileChange}
        />

        {imageSource && (
          <div className="image-preview">
            <img className="preview-image" src={imageSource.dataUrl} alt="Selected image preview" />
            <div className="preview-meta-grid">
              {previewStats.map((stat) => (
                <div className="preview-stat" key={stat.label}>
                  <span className="metric-label">{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            Verify Image &amp; OCR
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
              message="Running multilingual OCR, checking text threats, inspecting visual textures, and verifying authenticity..."
            />
          )}

          {!loading && result && (
            <Suspense fallback={<Loader message="Loading analytics dashboard..." />}>
              <ResultDashboard type="image" result={result} source={imageSource} />
            </Suspense>
          )}
        </div>
      )}
    </div>
  );
}

export default ImageVerifier;

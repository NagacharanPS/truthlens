import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Loader from "../components/Loader";
import Navbar from "../components/Navbar";
import RecentReportsPanel from "../components/RecentReportsPanel";
import { getBackendHealth, getDefaultHealthState } from "../services/api";
import { buildResultDashboard } from "../utils/resultAnalytics";
import {
  clearDashboardHistory,
  readDashboardHistory,
  readDashboardPayload,
  saveDashboardPayload,
} from "../utils/dashboardStorage";

import AIAssistantModal from "../components/AIAssistantModal";

const ResultDashboard = lazy(() => import("../components/ResultDashboard"));
const BACKEND_HEALTH_REFRESH_MS = 10000;

function formatAnalysisTime(value) {
  if (!value) {
    return "Unknown time";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (error) {
    return "Unknown time";
  }
}

function getAnalysisLabel(type) {
  if (type === "text") {
    return "Text Threat Scan";
  }

  if (type === "image") {
    return "Image Integrity Scan";
  }

  return "URL Security Scan";
}

function getSourcePreview(payload) {
  if (payload.type === "image") {
    return payload.source?.name || "Uploaded image";
  }

  const source = String(payload.source || "").trim();

  if (!source) {
    return "Direct scan input";
  }

  if (source.length > 120) {
    return `${source.slice(0, 117)}...`;
  }

  return source;
}

function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const reportRef = useRef(null);
  const [analysis, setAnalysis] = useState(() => location.state?.analysis || readDashboardPayload());
  const [history, setHistory] = useState(() => readDashboardHistory());
  const [connection, setConnection] = useState(getDefaultHealthState);
  const [isExporting, setIsExporting] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(null);

  const handleOpenAiAssistant = (prompt = null) => {
    setAiPrompt(prompt);
    setIsAiOpen(true);
  };

  useEffect(() => {
    let isMounted = true;

    async function hydrateHealth(force = true) {
      const nextConnection = await getBackendHealth({ force: true });

      if (isMounted) {
        setConnection(nextConnection);
      }
    }

    hydrateHealth();
    const refreshId = window.setInterval(() => {
      hydrateHealth(true);
    }, BACKEND_HEALTH_REFRESH_MS);

    return () => {
      isMounted = false;
      window.clearInterval(refreshId);
    };
  }, []);

  useEffect(() => {
    const nextPayload = location.state?.analysis;

    if (nextPayload) {
      saveDashboardPayload(nextPayload);
      setAnalysis(nextPayload);
      setHistory(readDashboardHistory());
      return;
    }

    const storedPayload = readDashboardPayload();
    if (storedPayload) {
      setAnalysis(storedPayload);
      setHistory(readDashboardHistory());
    }
  }, [location.state]);

  const handleOpenHistory = (entry) => {
    saveDashboardPayload(entry);
    setAnalysis(entry);
    setHistory(readDashboardHistory());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearHistory = () => {
    clearDashboardHistory();
    setHistory([]);
  };

  const [isCopied, setIsCopied] = useState(false);

  const handleCopyJson = () => {
    if (!analysis) return;
    const exportPayload = {
      type: analysis.type,
      scannedAt: analysis.createdAt,
      mode: analysis.mode,
      result: analysis.result,
    };
    navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2)).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const handleExportPdf = async () => {    if (!reportRef.current || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: "#071018",
        scale: 2,
        useCORS: true,
        windowWidth: reportRef.current.scrollWidth,
      });

      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const margin = 8;
      const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
      const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
      const imageWidth = pageWidth;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;

      let heightLeft = imageHeight;
      let position = margin;

      pdf.addImage(imageData, "PNG", margin, position, imageWidth, imageHeight, undefined, "FAST");
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = margin - (imageHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imageData, "PNG", margin, position, imageWidth, imageHeight, undefined, "FAST");
        heightLeft -= pageHeight;
      }

      pdf.save(`truthlens-report-${analysis?.type || "scan"}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  if (!analysis) {
    return (
      <main className="page-shell" id="top">
        <div className="page-frame">
          <Navbar
            connectionStatus={connection.status}
            connectionLabel={
              connection.status === "offline"
                ? "Demo fallback active"
                : connection.status === "degraded"
                  ? "Backend needs attention"
                  : connection.status === "checking"
                    ? "Checking backend"
                    : "Live backend connected"
            }
          />
          <section className="dashboard-page-shell">
            <div className="empty-state dashboard-empty-state">
              <span className="result-label">No Report Yet</span>
              <h2>Run an analysis to open the dashboard</h2>
              <p>TruthLens will send text, image, or URL verification results here after you click Analyze.</p>
              <button className="btn btn-primary" type="button" onClick={() => navigate("/")}>
                Go Back Home
              </button>
            </div>

            <RecentReportsPanel
              history={history}
              activeId=""
              onOpen={handleOpenHistory}
              onClear={handleClearHistory}
            />
          </section>
          <Footer />
        </div>
      </main>
    );
  }

  const dashboardModel = buildResultDashboard(analysis.type, analysis.result, analysis.source);
  const connectionBannerClass =
    connection.status === "offline" || connection.status === "degraded"
      ? "inline-banner-warning"
      : "inline-banner-info";

  return (
    <main className="page-shell" id="top">
      <div className="page-frame">
        <Navbar
          connectionStatus={connection.status}
          connectionLabel={
            connection.status === "offline"
              ? "Demo fallback active"
              : connection.status === "degraded"
                ? "Backend needs attention"
                : connection.status === "checking"
                  ? "Checking backend"
                  : "Live backend connected"
          }
        />

        <section className="dashboard-page-shell">
          <div className="dashboard-page-head">
            <div className="dashboard-page-copy">
              <span className="section-kicker">Separate Analysis Dashboard</span>
              <h1 className="dashboard-page-title">TruthLens premium threat report</h1>
              <p className="section-copy">
                Review the latest verification result in a focused, judge-ready dashboard with visual scoring,
                actionable explanation, recent report history, and downloadable PDF evidence.
              </p>
            </div>

            <div className="dashboard-page-actions">
              <button className="btn btn-secondary" type="button" onClick={() => navigate("/")}>
                Back To Home
              </button>
              <button className="btn btn-primary" type="button" onClick={handleExportPdf} disabled={isExporting}>
                {isExporting ? "Exporting PDF..." : "Export PDF Report"}
              </button>
            </div>
          </div>

          {analysis.notice && <div className="inline-banner inline-banner-info">{analysis.notice}</div>}
          {connection.status === "offline" && (
            <div className={`inline-banner ${connectionBannerClass}`}>{connection.message}</div>
          )}

          <div className="dashboard-report-shell" ref={reportRef}>
            <section className="dashboard-spotlight">
              <article className="dashboard-spotlight-card">
                <span className="result-label">Final Verdict</span>
                <h2>{analysis.result.status}</h2>
                <p className="dashboard-spotlight-copy">
                  {getAnalysisLabel(analysis.type)} completed on {formatAnalysisTime(analysis.createdAt)}.
                </p>
                <p className="dashboard-spotlight-copy">{analysis.result.explanation}</p>
              </article>

              <div className="dashboard-kpi-grid">
                <article className="dashboard-kpi-card">
                  <span className="metric-label">Risk Score</span>
                  <strong>{analysis.result.riskScore}%</strong>
                  <p>Unified threat score used across every TruthLens scan.</p>
                </article>
                <article className="dashboard-kpi-card">
                  <span className="metric-label">Confidence</span>
                  <strong>{analysis.result.confidence}%</strong>
                  <p>How strongly the engine supports the current verdict.</p>
                </article>
                <article className="dashboard-kpi-card">
                  <span className="metric-label">Scan Mode</span>
                  <strong>{analysis.mode === "api" ? "Live API" : "Demo Fallback"}</strong>
                  <p>Backend mode used to generate this report.</p>
                </article>
                <article className="dashboard-kpi-card">
                  <span className="metric-label">Source</span>
                  <strong>{getAnalysisLabel(analysis.type)}</strong>
                  <p>{getSourcePreview(analysis)}</p>
                </article>
              </div>
            </section>

            <section className="dashboard-summary-grid">
              <article className="dashboard-summary-card">
                <div className="dashboard-card-top">
                  <div>
                    <span className="result-label">Red Flags</span>
                    <h3>Key findings</h3>
                  </div>
                </div>
                <div className="chip-list">
                  {analysis.result.redFlags.map((item) => (
                    <span className="chip-tag" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </article>

              <article className="dashboard-summary-card">
                <span className="result-label">Explanation</span>
                <strong className="dashboard-summary-value">{analysis.result.riskLevel} risk</strong>
                <p>{analysis.result.explanation}</p>
              </article>

              <article className="dashboard-summary-card">
                <span className="result-label">Safety Advice</span>
                <strong className="dashboard-summary-value">{dashboardModel.insights.topSignal}</strong>
                <p>{analysis.result.recommendation}</p>
              </article>
            </section>

            <section className="dashboard-full-section">
              <Suspense fallback={<Loader message="Loading dashboard analytics..." />}>
                <ResultDashboard type={analysis.type} result={analysis.result} source={analysis.source} />
              </Suspense>
            </section>

            <RecentReportsPanel
              history={history}
              activeId={analysis.id}
              onOpen={handleOpenHistory}
              onClear={handleClearHistory}
              compact={true}
            />
          </div>
        </section>

        <button
          type="button"
          className="ai-assistant-fab"
          onClick={() => handleOpenAiAssistant()}
          aria-label="Open AI Assistant"
        >
          <span className="ai-assistant-fab-icon">🤖</span>
          <span>AI Assistant</span>
          <span className="ai-assistant-fab-badge"></span>
        </button>

        <AIAssistantModal
          isOpen={isAiOpen}
          onClose={() => setIsAiOpen(false)}
          activeVerification={analysis}
          defaultPrompt={aiPrompt}
        />

        <Footer />
      </div>
    </main>
  );
}

export default Dashboard;

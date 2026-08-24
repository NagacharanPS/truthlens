import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Hero from "../components/Hero";
import Navbar from "../components/Navbar";
import RecentReportsPanel from "../components/RecentReportsPanel";
import VerificationTabs from "../components/VerificationTabs";
import AIAssistantModal from "../components/AIAssistantModal";
import {
  demoSamples,
  floatingAlerts,
  heroSignals,
  integrationLanes,
  systemMetrics,
  workspaceHighlights,
} from "../data/mockData";
import { getBackendHealth, getDefaultHealthState, verifyImage, verifyText, verifyUrl } from "../services/api";
import {
  clearDashboardHistory,
  createDashboardPayload,
  readDashboardHistory,
  saveDashboardPayload,
} from "../utils/dashboardStorage";
import { buildDemoImageSource, createImageSource, isSupportedImageFile } from "../utils/fallbackLogic";

const BACKEND_HEALTH_REFRESH_MS = 10000;

function createScanState() {
  return {
    result: null,
    loading: false,
    error: "",
    notice: "",
  };
}

function Home() {
  const navigate = useNavigate();
  const verificationRef = useRef(null);
  const [activeTab, setActiveTab] = useState("text");
  const [statusMessage, setStatusMessage] = useState("");
  const [connection, setConnection] = useState(getDefaultHealthState);
  const [scanHistory, setScanHistory] = useState(() => readDashboardHistory());

  const [textValue, setTextValue] = useState("");
  const [textLanguage, setTextLanguage] = useState("auto");
  const [textState, setTextState] = useState(createScanState);

  const [imageSource, setImageSource] = useState(null);
  const [imageLanguage, setImageLanguage] = useState("auto");
  const [imageInputKey, setImageInputKey] = useState(0);
  const [imageState, setImageState] = useState(createScanState);

  const [urlValue, setUrlValue] = useState("");
  const [urlState, setUrlState] = useState(createScanState);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(null);

  const getActiveVerificationPayload = () => {
    if (activeTab === "text" && textState.result) return textState.result;
    if (activeTab === "image" && imageState.result) return imageState.result;
    if (activeTab === "url" && urlState.result) return urlState.result;
    return textState.result || imageState.result || urlState.result || null;
  };

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

  const syncConnectionState = async () => {
    const nextConnection = await getBackendHealth({ force: true });
    setConnection(nextConnection);
  };

  const scrollToVerification = (tab = "text") => {
    setActiveTab(tab);
    verificationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openDashboard = (payload) => {
    saveDashboardPayload(payload);
    setScanHistory(readDashboardHistory());
    navigate("/dashboard", {
      state: {
        analysis: payload,
      },
    });
  };

  const openHistoryReport = (payload) => {
    saveDashboardPayload(payload);
    navigate("/dashboard", {
      state: {
        analysis: payload,
      },
    });
  };

  const resetTextModule = () => {
    setTextValue("");
    setTextLanguage("auto");
    setTextState(createScanState());
  };

  const resetImageModule = () => {
    setImageSource(null);
    setImageLanguage("auto");
    setImageInputKey((current) => current + 1);
    setImageState(createScanState());
  };

  const resetUrlModule = () => {
    setUrlValue("");
    setUrlState(createScanState());
  };

  const handleTextSubmit = async (event) => {
    event.preventDefault();

    if (!textValue.trim()) {
      setTextState({
        result: null,
        loading: false,
        error: "Paste an SMS, email, or chat message before running text verification.",
        notice: "",
      });
      return;
    }

    setTextState({
      result: null,
      loading: true,
      error: "",
      notice: "",
    });

    try {
      const response = await verifyText(textValue.trim(), textLanguage);

      setTextState({
        result: response.data,
        loading: false,
        error: "",
        notice: response.message,
      });

      await syncConnectionState();

      openDashboard(
        createDashboardPayload({
          type: "text",
          result: response.data,
          source: textValue.trim(),
          mode: response.mode,
          notice: response.message,
        }),
      );
    } catch (error) {
      setTextState({
        result: null,
        loading: false,
        error: error.message || "The text scan could not be completed.",
        notice: "",
      });
      await syncConnectionState();
    }
  };

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      setImageSource(null);
      setImageState(createScanState());
      return;
    }

    if (!isSupportedImageFile(file)) {
      setImageSource(null);
      setImageState({
        result: null,
        loading: false,
        error: "Upload a JPG, JPEG, PNG, or WEBP image for verification.",
        notice: "",
      });
      return;
    }

    try {
      const preparedSource = await createImageSource(file);
      setImageSource(preparedSource);
      setImageState({
        result: null,
        loading: false,
        error: "",
        notice: "Image ready for verification.",
      });
    } catch (error) {
      setImageSource(null);
      setImageState({
        result: null,
        loading: false,
        error: "The selected image could not be read. Try another file.",
        notice: "",
      });
    }
  };

  const handleImageSubmit = async (event) => {
    event.preventDefault();

    if (!imageSource) {
      setImageState({
        result: null,
        loading: false,
        error: "Upload an image first, or use Live Demo to test the image verification flow.",
        notice: "",
      });
      return;
    }

    setImageState({
      result: null,
      loading: true,
      error: "",
      notice: "",
    });

    try {
      const response = await verifyImage(imageSource, imageLanguage);
      setImageState({
        result: response.data,
        loading: false,
        error: "",
        notice: response.message,
      });
      await syncConnectionState();

      openDashboard(
        createDashboardPayload({
          type: "image",
          result: response.data,
          source: imageSource,
          mode: response.mode,
          notice: response.message,
        }),
      );
    } catch (error) {
      setImageState({
        result: null,
        loading: false,
        error: error.message || "The image could not be analyzed.",
        notice: "",
      });
      await syncConnectionState();
    }
  };

  const handleUrlSubmit = async (event) => {
    event.preventDefault();

    if (!urlValue.trim()) {
      setUrlState({
        result: null,
        loading: false,
        error: "Paste a suspicious link before running URL verification.",
        notice: "",
      });
      return;
    }

    setUrlState({
      result: null,
      loading: true,
      error: "",
      notice: "",
    });

    try {
      const response = await verifyUrl(urlValue.trim());
      setUrlState({
        result: response.data,
        loading: false,
        error: "",
        notice: response.message,
      });
      await syncConnectionState();

      openDashboard(
        createDashboardPayload({
          type: "url",
          result: response.data,
          source: urlValue.trim(),
          mode: response.mode,
          notice: response.message,
        }),
      );
    } catch (error) {
      setUrlState({
        result: null,
        loading: false,
        error: error.message || "The URL scan could not be completed.",
        notice: "",
      });
      await syncConnectionState();
    }
  };

  const handleLiveDemo = async () => {
    scrollToVerification("text");
    setStatusMessage("Loading live demo across text, image, and URL verification lanes...");

    const demoImage = buildDemoImageSource();
    setTextValue(demoSamples.text);
    setTextLanguage("auto");
    setUrlValue(demoSamples.url);
    setImageSource(demoImage);
    setImageLanguage("auto");

    setTextState({ result: null, loading: true, error: "", notice: "" });
    setImageState({ result: null, loading: true, error: "", notice: "" });
    setUrlState({ result: null, loading: true, error: "", notice: "" });

    try {
      const [textResponse, imageResponse, urlResponse] = await Promise.all([
        verifyText(demoSamples.text, "auto"),
        verifyImage(demoImage, "auto"),
        verifyUrl(demoSamples.url),
      ]);

      setTextState({
        result: textResponse.data,
        loading: false,
        error: "",
        notice: textResponse.message,
      });

      setImageState({
        result: imageResponse.data,
        loading: false,
        error: "",
        notice: imageResponse.message,
      });

      setUrlState({
        result: urlResponse.data,
        loading: false,
        error: "",
        notice: urlResponse.message,
      });

      await syncConnectionState();

      const modes = [textResponse.mode, imageResponse.mode, urlResponse.mode];
      const allApi = modes.every((mode) => mode === "api");
      const allDemo = modes.every((mode) => mode === "demo");

      setStatusMessage(
        allApi
          ? "Live demo loaded through the TruthShield backend."
          : allDemo
            ? "Live demo loaded in fallback demo mode because the backend is offline."
            : "Live demo loaded with a mix of live backend and demo fallback results.",
      );
    } catch (error) {
      setStatusMessage("Live demo loaded partially. You can still run each module manually.");
      setTextState((current) => ({ ...current, loading: false }));
      setImageState((current) => ({ ...current, loading: false }));
      setUrlState((current) => ({ ...current, loading: false }));
      await syncConnectionState();
    }
  };

  const handleClearHistory = () => {
    clearDashboardHistory();
    setScanHistory([]);
  };

  const connectionBannerClass =
    connection.status === "offline"
      ? "inline-banner-warning"
      : connection.status === "degraded"
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
              : "Live backend connected"
          }
        />

        <Hero
          signals={heroSignals}
          alerts={floatingAlerts}
          onVerifyNow={() => scrollToVerification("text")}
          onLiveDemo={handleLiveDemo}
        />

        <section className="workspace-section" ref={verificationRef}>
          <div className="section-copy-block section-copy-block-horizontal">
            <h2 className="section-title">Professional Verification Suite with TruthShield Intelligence</h2>
            <p className="section-copy">
              Verify multilingual text messages, inspect screenshot image forensics and OCR, and analyze suspicious links in seconds.
            </p>
          </div>

          <div className="overview-grid">
            {workspaceHighlights.map((highlight) => (
              <article className="overview-pill" key={highlight}>
                {highlight}
              </article>
            ))}
          </div>

          {connection.status === "offline" && (
            <div className={`inline-banner ${connectionBannerClass}`}>
              {connection.message}
            </div>
          )}

          <VerificationTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            statusMessage={statusMessage}
            textProps={{
              value: textValue,
              language: textLanguage,
              onLanguageChange: setTextLanguage,
              onChange: setTextValue,
              onSubmit: handleTextSubmit,
              onClear: resetTextModule,
              result: textState.result,
              loading: textState.loading,
              error: textState.error,
              notice: textState.notice,
            }}
            imageProps={{
              inputKey: imageInputKey,
              imageSource,
              language: imageLanguage,
              onLanguageChange: setImageLanguage,
              onFileChange: handleImageChange,
              onSubmit: handleImageSubmit,
              onClear: resetImageModule,
              result: imageState.result,
              loading: imageState.loading,
              error: imageState.error,
              notice: imageState.notice,
            }}
            urlProps={{
              value: urlValue,
              onChange: setUrlValue,
              onSubmit: handleUrlSubmit,
              onClear: resetUrlModule,
              result: urlState.result,
              loading: urlState.loading,
              error: urlState.error,
              notice: urlState.notice,
            }}
          />

          <RecentReportsPanel
            history={scanHistory}
            activeId=""
            onOpen={openHistoryReport}
            onClear={handleClearHistory}
            compact
          />
        </section>

        <section className="intel-section">
          <div className="intel-grid">
            {systemMetrics.map((metric) => (
              <article className="intel-card" key={metric.label}>
                <span className="result-label">{metric.label}</span>
                <strong className="intel-value">{metric.value}</strong>
                <p>{metric.note}</p>
              </article>
            ))}
          </div>

          <div className="lane-grid">
            {integrationLanes.map((lane) => (
              <article className="lane-card" key={lane.title}>
                <span className="result-label">Future Connector</span>
                <h3>{lane.title}</h3>
                <span className="tool-endpoint lane-endpoint">{lane.endpoint}</span>
                <p>{lane.description}</p>
              </article>
            ))}
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
          activeVerification={getActiveVerificationPayload()}
          defaultPrompt={aiPrompt}
        />

        <Footer />
      </div>
    </main>
  );
}

export default Home;

import TextVerifier from "./TextVerifier";
import ImageVerifier from "./ImageVerifier";
import UrlVerifier from "./UrlVerifier";

const tabs = [
  { id: "text", label: "Text Verification" },
  { id: "image", label: "Image Verification" },
  { id: "url", label: "URL Verification" },
];

function VerificationTabs({
  activeTab,
  onTabChange,
  statusMessage,
  textProps,
  imageProps,
  urlProps,
}) {
  return (
    <section className="verification-shell">
      <div className="verification-heading">
        <h2>Verification Assistant</h2>
        <p className="verification-intro">
          Select a verification lane below to analyze suspicious content across text, images, and URLs.
        </p>
      </div>

      {statusMessage && <div className="inline-banner inline-banner-success">{statusMessage}</div>}

      <div className="verification-tabs" role="tablist" aria-label="Verification tools">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              className={`verification-tab-button ${isActive ? "is-active" : ""}`}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="verification-panels">
        {activeTab === "text" && <TextVerifier {...textProps} />}
        {activeTab === "image" && <ImageVerifier {...imageProps} />}
        {activeTab === "url" && <UrlVerifier {...urlProps} />}
      </div>
    </section>
  );
}

export default VerificationTabs;

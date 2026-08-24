function formatReportTime(value) {
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

function getSourcePreview(entry) {
  if (entry.type === "image") {
    return entry.source?.name || "Uploaded image";
  }

  const source = String(entry.source || "").trim();

  if (!source) {
    return "Direct scan input";
  }

  if (source.length > 92) {
    return `${source.slice(0, 89)}...`;
  }

  return source;
}

function RecentReportsPanel({ history, activeId, onOpen, onClear, compact = false }) {
  return (
    <section className={`history-panel ${compact ? "history-panel-compact" : ""}`}>
      <div className="history-panel-head">
        <div>
          <span className="result-label">Scan History</span>
          <h3>Recent Reports</h3>
          <p className="history-panel-copy">
            Reopen the latest TruthLens scans instantly during your demo without re-running every request.
          </p>
        </div>
        {history.length > 0 && (
          <button className="btn btn-secondary history-clear-button" type="button" onClick={onClear}>
            Clear History
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="empty-state history-empty-state">
          <span className="result-label">No Saved Reports</span>
          <h3>Your latest scans will appear here</h3>
          <p>Run a text, image, or URL verification to build a reusable demo history.</p>
        </div>
      ) : (
        <div className="history-list">
          {history.map((entry) => {
            const isActive = entry.id === activeId;

            return (
              <button
                key={entry.id}
                className={`history-item ${isActive ? "is-active" : ""}`}
                type="button"
                onClick={() => onOpen(entry)}
              >
                <div className="history-item-head">
                  <div className="history-item-tags">
                    <span className="history-type-tag">{entry.type.toUpperCase()}</span>
                    <span className={`result-badge tone-${entry.result.riskLevel.toLowerCase()}`}>{entry.result.status}</span>
                  </div>
                  <strong className="history-risk-score">{entry.result.riskScore}%</strong>
                </div>

                <p className="history-source-preview">{getSourcePreview(entry)}</p>

                <div className="history-item-meta">
                  <span>{formatReportTime(entry.createdAt)}</span>
                  <span>{entry.mode === "api" ? "Live API" : "Demo Mode"}</span>
                  <span>{entry.result.confidence}% confidence</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default RecentReportsPanel;

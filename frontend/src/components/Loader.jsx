function Loader({ title = "AI Scan in Progress...", message = "Reviewing threat patterns and preparing the result card." }) {
  return (
    <div className="scan-loading" aria-live="polite">
      <span className="scan-loading-spinner" aria-hidden="true"></span>
      <div className="scan-loading-copy">
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

export default Loader;


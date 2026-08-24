export const heroSignals = [
  {
    title: "Multilingual Text",
    value: "English, Kannada, Hindi, and Telugu",
  },
  {
    title: "Image Forensics",
    value: "OCR text extraction & image authenticity",
  },
  {
    title: "URL Shield",
    value: "Phishing links, fake domains, and safety scoring",
  },
];

export const floatingAlerts = [
  {
    id: "deepfake",
    className: "card-alert",
    eyebrow: "Image Alert",
    title: "Manipulation cues detected",
    icon: "warning",
  },
  {
    id: "scan",
    className: "card-scan",
    eyebrow: "Multilingual Scan",
    title: "Threat patterns identified",
    icon: "scan",
  },
  {
    id: "phishing",
    className: "card-block",
    eyebrow: "Phishing Link",
    title: "Unsafe domain flagged",
    icon: "shield",
  },
];

export const systemMetrics = [
  {
    label: "Verification Modules",
    value: "3 Active",
    note: "Text, image, and URL checks share a unified verification dashboard.",
  },
  {
    label: "Backend Health",
    value: "Live + Fallback",
    note: "TruthLens uses the TruthShield backend engine with browser fallback support.",
  },
  {
    label: "Reports",
    value: "PDF + History",
    note: "Recent scans stay available and can be exported as polished PDF reports.",
  },
];

export const integrationLanes = [
  {
    title: "Multilingual Text Lane",
    endpoint: "Text Threat Analysis",
    description:
      "Detects scam patterns, urgency triggers, and credential phishing in English, Kannada, Hindi, and Telugu.",
  },
  {
    title: "Image Forensics Lane",
    endpoint: "Image & OCR Verification",
    description:
      "Performs multilingual OCR screenshot text extraction alongside visual manipulation forensics.",
  },
  {
    title: "URL Shield Lane",
    endpoint: "Domain Security Analysis",
    description:
      "Analyzes malicious domain structures, URL spoofing, and phishing reputation indicators.",
  },
];

export const demoSamples = {
  text: "URGENT! Your bank account will be suspended today. Verify now and share the OTP code 482991 to avoid account block. Click here for your reward refund.",
  url: "http://secure-bank-verify-login-update.xyz/account/reward?confirm=otp",
};

export const workspaceHighlights = [
  "Multilingual verification across English, Kannada, Hindi, and Telugu.",
  "Image text OCR and visual manipulation analysis.",
  "Real-time URL phishing and scam detection with actionable recommendations.",
];

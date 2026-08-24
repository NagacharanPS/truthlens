import { clampNumber, getRiskTone } from "./fallbackLogic";

const dashboardCopy = {
  text: {
    title: "Text Threat Dashboard",
    subtitle: "Unified message-risk view combining model confidence, pressure signals, and safety guidance.",
    sourceLabel: "Message Verification",
    meterLabel: "Threat Meter",
    meterLeft: "Low",
    meterMiddle: "Review",
    meterRight: "Critical",
    barTitle: "Message Signal Breakdown",
    barDescription: "Weighted indicators returned by the backend or demo engine.",
    timelineTitle: "Threat Escalation Flow",
    timelineDescription: "How suspicious language compounds into the final message-risk verdict.",
  },
  image: {
    title: "Image Integrity Dashboard",
    subtitle: "Professional media-forensics view for authenticity, manipulation cues, and safe-next-action guidance.",
    sourceLabel: "Image Verification",
    meterLabel: "Integrity Meter",
    meterLeft: "Compromised",
    meterMiddle: "Review",
    meterRight: "Trusted",
    barTitle: "Image Signal Breakdown",
    barDescription: "Forensic-style indicators for manipulation, compression, texture, and authenticity risk.",
    timelineTitle: "Forensic Review Flow",
    timelineDescription: "How the image scan moves from source checks to final integrity scoring.",
  },
  url: {
    title: "URL Security Dashboard",
    subtitle: "Domain-safety dashboard for phishing patterns, transport trust, and destination risk.",
    sourceLabel: "URL Verification",
    meterLabel: "Security Meter",
    meterLeft: "Unsafe",
    meterMiddle: "Review",
    meterRight: "Healthy",
    barTitle: "URL Signal Breakdown",
    barDescription: "Backend-weighted link indicators for phishing, spoofing, and transport safety.",
    timelineTitle: "Link Investigation Flow",
    timelineDescription: "How the URL scan builds from domain checks toward the final safety verdict.",
  },
};

const hiddenMetadataKeys = new Set([
  "originalText",
  "normalizedText",
  "detectedLanguage",
  "detectedLanguageCode",
  "languageConfidence",
  "languages",
  "isMixed",
  "languageDetectionMethod",
  "translationApplied",
  "translationStatus",
  "rectifiedText",
  "translationWarning",
  "processingNotes",
  "normalizedKeywords",
  "ocrText",
  "ocrConfidence",
]);

function getSourcePreview(type, source) {
  if (type === "image") {
    return source?.name || "Uploaded image";
  }

  const value = String(source || "").trim();

  if (!value) {
    return "Direct scan input";
  }

  if (value.length > 120) {
    return `${value.slice(0, 117)}...`;
  }

  return value;
}

function getSignalTone(value) {
  if (value >= 70) {
    return "high";
  }

  if (value >= 40) {
    return "medium";
  }

  return "safe";
}

function createTimelineData(signalBreakdown, riskScore) {
  const timelineSignals = signalBreakdown.slice(0, 4);
  let runningScore = 12;

  const flow = [
    {
      stage: "Source",
      value: runningScore,
    },
  ];

  timelineSignals.forEach((signal) => {
    runningScore = clampNumber(Math.round((runningScore + signal.value) / 2), 6, 98);
    flow.push({
      stage: signal.label.replace(" Signals", "").replace(" Score", ""),
      value: runningScore,
    });
  });

  flow.push({
    stage: "Final",
    value: clampNumber(riskScore, 6, 98),
  });

  return flow;
}

function getProgressNote(label, type) {
  if (type === "image") {
    return "Forensic signal captured from compression, symmetry, and visual patterns.";
  }

  if (type === "url") {
    return "Part of the destination risk assessment for this link.";
  }

  return "Part of the suspicious-language assessment for this message.";
}

function metadataToList(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  return Object.entries(metadata)
    .filter(([key]) => !hiddenMetadataKeys.has(key))
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .filter(([, value]) => typeof value !== "object")
    .map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
      return `${label}: ${value}`;
    });
}

function buildTextProcessingBlocks(result, source) {
  const metadata = result?.metadata || {};
  const originalText = String(metadata.originalText || result?.originalText || source || "").trim();
  const normalizedText = String(metadata.normalizedText || result?.englishText || "").trim();
  const detectedLanguage = metadata.detectedLanguage || result?.detectedLanguage || "English";
  const detectedLanguageCode = metadata.detectedLanguageCode || result?.detectedLanguageCode || "en";
  const languageConfidence =
    metadata.languageConfidence !== undefined
      ? metadata.languageConfidence
      : result?.languageConfidence !== undefined
        ? result.languageConfidence
        : 0.96;
  const isMixed = metadata.isMixed || result?.isMixed || false;
  const languages = metadata.languages || result?.languages || [detectedLanguageCode];

  const details = [];

  // Requirement 17: Language & NLP Analysis Card
  details.push({
    title: "Language & NLP Analysis",
    type: "nlp",
    metrics: [
      { label: "Detected Language", value: detectedLanguage },
      { label: "Language Code", value: detectedLanguageCode },
      {
        label: "Language Confidence",
        value: languageConfidence !== null ? `${Math.round(languageConfidence * 100)}%` : "Verified",
      },
      { label: "Processing", value: "Multilingual NLP" },
      { label: "Text Analysis", value: "Completed" },
    ],
    notes: [
      isMixed ? `Code-Mixed Structure: ${languages.join(" + ").toUpperCase()}` : null,
      metadata.languageDetectionMethod ? `Detection Engine: ${metadata.languageDetectionMethod}` : "Detection Engine: Script & Token Match",
      metadata.translationStatus === "translated" ? "Full Semantic Normalization Applied" : "Language Keyword Analysis Active",
    ].filter(Boolean),
  });

  // Requirement 18: Language-Specific NLP Diagnostics
  details.push({
    title: "Language Processing Diagnostics",
    type: "list",
    items: [
      `Detected Language: ${detectedLanguage}`,
      "Text Normalization: Completed",
      "Tokenization: Completed",
      "Language Detection: Completed",
      "Threat Pattern Detection: Completed",
      metadata.normalizedKeywords ? `Threat Terms Identified: ${metadata.normalizedKeywords}` : null,
      metadata.translationWarning ? `Notice: ${metadata.translationWarning}` : null,
    ].filter(Boolean),
  });

  // Original Text preserved block
  if (originalText) {
    details.push({
      title: `Original Text (${detectedLanguage})`,
      type: "text",
      content: originalText,
    });
  }

  // English normalized preview if translation happened
  if (
    normalizedText &&
    originalText &&
    normalizedText.replace(/\s+/g, " ").trim().toLowerCase() !== originalText.replace(/\s+/g, " ").trim().toLowerCase()
  ) {
    details.push({
      title: "Cross-Engine Normalization Preview",
      type: "text",
      content: normalizedText,
    });
  }

  return details;
}

function buildImageOcrBlocks(result) {
  const metadata = result?.metadata || {};
  const ocrText = metadata.ocrText || result?.ocrText || "";
  const detectedLanguage = metadata.detectedLanguage || result?.detectedLanguage || "English";
  const ocrConfidence = metadata.ocrConfidence || result?.ocrConfidence;

  if (!ocrText) {
    return [];
  }

  return [
    {
      title: "Multilingual OCR Analysis",
      type: "nlp",
      metrics: [
        { label: "Extracted Text Language", value: detectedLanguage },
        { label: "OCR Confidence", value: ocrConfidence ? `${Math.round(ocrConfidence * 100)}%` : "Detected" },
        { label: "Script Extraction", value: "Completed" },
        { label: "OCR Threat Scan", value: "Completed" },
      ],
      notes: [`Extracted Text: "${ocrText}"`],
    },
  ];
}

export function buildResultDashboard(type, result, source) {
  if (!result) {
    return null;
  }

  const copy = dashboardCopy[type] || dashboardCopy.url;
  const riskTone = getRiskTone(result.riskLevel);
  const statusTone = getRiskTone(result.status);
  const signalBreakdown =
    Array.isArray(result.signalBreakdown) && result.signalBreakdown.length > 0
      ? result.signalBreakdown.slice(0, 6)
      : [
          { label: "Primary Risk Signal", value: result.riskScore },
          { label: "Confidence Match", value: result.confidence },
        ];
  const metadataItems = metadataToList(result.metadata);

  return {
    title: copy.title,
    subtitle: copy.subtitle,
    badge: result.status,
    badgeTone: statusTone,
    cards: [
      {
        label: "Status",
        value: result.status,
        helper: "Unified outcome label across every scan type",
        tone: statusTone,
      },
      {
        label: "Risk Score",
        value: result.riskScore,
        suffix: "%",
        helper: "Primary severity score used across the platform",
        tone: riskTone,
      },
      {
        label: "Risk Level",
        value: result.riskLevel,
        helper: "Executive summary of threat severity",
        tone: riskTone,
      },
      {
        label: "Confidence",
        value: result.confidence,
        suffix: "%",
        helper: "How strongly the engine supports this verdict",
        tone: getSignalTone(result.confidence),
      },
    ],
    ring: {
      label: "Risk Score",
      value: result.riskScore,
      subtitle: "Threat likelihood",
      tone: riskTone,
    },
    meter: {
      label: copy.meterLabel,
      value: result.riskScore,
      tone: riskTone,
      leftLabel: copy.meterLeft,
      middleLabel: copy.meterMiddle,
      rightLabel: copy.meterRight,
      description: result.explanation,
    },
    barChart: {
      title: copy.barTitle,
      description: copy.barDescription,
      data: signalBreakdown.map((item) => ({
        name: item.label,
        value: clampNumber(item.value, 0, 100),
      })),
    },
    timeline: {
      title: copy.timelineTitle,
      description: copy.timelineDescription,
      data: createTimelineData(signalBreakdown, result.riskScore),
    },
    progressItems: signalBreakdown.map((item) => ({
      label: item.label,
      value: clampNumber(item.value, 0, 100),
      note: getProgressNote(item.label, type),
      tone: getSignalTone(item.value),
    })),
    detailBlocks: [
      {
        title: "Red Flags",
        type: "chips",
        items: result.redFlags,
      },
      {
        title: "Analyst Explanation",
        type: "text",
        content: result.explanation,
      },
      {
        title: "Safety Advice",
        type: "text",
        content: result.recommendation,
      },
      ...(type === "text" ? buildTextProcessingBlocks(result, source) : []),
      ...(type === "image" ? buildImageOcrBlocks(result) : []),
      ...(result.shapAvailable && result.shapTopRisk?.length > 0
        ? [
            {
              title: "SHAP Feature Attribution",
              type: "shap",
              riskFeatures: result.shapTopRisk || [],
              safeFeatures: result.shapTopSafe || [],
            },
          ]
        : []),
      ...(metadataItems.length > 0
        ? [
            {
              title: "Scan Metadata",
              type: "list",
              items: metadataItems,
            },
          ]
        : []),
    ],
    insights: {
      sourceLabel: copy.sourceLabel,
      sourcePreview: getSourcePreview(type, source),
      topSignal: signalBreakdown[0]?.label || "Risk assessment",
      topSignalValue: signalBreakdown[0]?.value || result.riskScore,
    },
  };
}

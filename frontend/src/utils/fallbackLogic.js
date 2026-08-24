const textSignals = {
  scam: ["claim now", "limited offer", "reward", "prize", "winner", "free", "refund", "cashback", "gift card"],
  urgency: ["urgent", "immediately", "asap", "final warning", "act now", "limited time", "expire", "suspended"],
  otp: ["otp", "one-time password", "verification code", "pin", "cvv", "password", "passcode"],
  phishing: ["verify account", "click here", "tap here", "reset account", "confirm bank", "login now", "security alert"],
  offers: ["free", "gift", "reward", "winner", "lottery", "bonus", "cashback", "discount", "refund"],
  emotion: ["family emergency", "panic", "arrest", "legal action", "crying", "help me", "urgent help", "police"],
};

const supportedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const supportedImageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
const commonTextStatus = {
  high: "Scam Detected",
  medium: "Suspicious Message",
  low: "Likely Safe",
};
const commonUrlStatus = {
  high: "Unsafe Link",
  medium: "Review Link",
  low: "Likely Safe",
};
const commonImageStatus = {
  high: "Manipulation Detected",
  medium: "Review Recommended",
  low: "Likely Authentic",
};

export function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getRiskLevel(score) {
  if (score >= 70) {
    return "High";
  }

  if (score >= 40) {
    return "Medium";
  }

  return "Low";
}

export function getRiskTone(value) {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("unsafe")) {
    return "unsafe";
  }

  if (
    normalized.includes("high") ||
    normalized.includes("detected") ||
    normalized.includes("scam") ||
    normalized.includes("manipulation")
  ) {
    return "high";
  }

  if (normalized.includes("medium") || normalized.includes("review") || normalized.includes("suspicious")) {
    return "medium";
  }

  if (normalized.includes("safe") || normalized.includes("authentic") || normalized.includes("low")) {
    return "safe";
  }

  return "low";
}

export function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function uniqueItems(items) {
  return [...new Set(items.filter(Boolean))];
}

function collectMatches(text, phrases) {
  const normalized = text.toLowerCase();
  return phrases.filter((phrase) => normalized.includes(phrase));
}

function normalizeUrlValue(value) {
  const trimmedValue = value.trim();

  if (/^[a-z]+:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
}

function getBaseDomain(host) {
  const parts = host.split(".").filter(Boolean);

  if (parts.length <= 2) {
    return host;
  }

  return parts.slice(-2).join(".");
}

function matchesTrustedDomain(host, trustedDomains) {
  return trustedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function getColorDifference(data, indexA, indexB) {
  const redDiff = data[indexA] - data[indexB];
  const greenDiff = data[indexA + 1] - data[indexB + 1];
  const blueDiff = data[indexA + 2] - data[indexB + 2];

  return Math.sqrt(redDiff * redDiff + greenDiff * greenDiff + blueDiff * blueDiff) / Math.sqrt(3);
}

function normalizeSignalBreakdown(signalBreakdown, fallbackSignals = []) {
  if (!Array.isArray(signalBreakdown) || signalBreakdown.length === 0) {
    return fallbackSignals;
  }

  return signalBreakdown
    .filter((item) => item && typeof item.label === "string")
    .map((item) => ({
      label: item.label,
      value: clampNumber(Number(item.value) || 0, 0, 100),
    }));
}

function createVerificationResult({
  type,
  status,
  riskScore,
  confidence,
  redFlags,
  explanation,
  recommendation,
  signalBreakdown,
  metadata,
}) {
  const normalizedRiskScore = clampNumber(Number(riskScore) || 0, 0, 100);

  return {
    type,
    status: status || "Review Recommended",
    riskScore: normalizedRiskScore,
    riskLevel: getRiskLevel(normalizedRiskScore),
    confidence: clampNumber(Number(confidence) || 0, 0, 100),
    redFlags: Array.isArray(redFlags) && redFlags.length > 0 ? redFlags : ["No major red flags detected"],
    explanation: explanation || "The scan completed successfully.",
    recommendation: recommendation || "Verify important claims through trusted sources before acting.",
    signalBreakdown: normalizeSignalBreakdown(signalBreakdown),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  };
}

export function isSupportedImageFile(file) {
  if (!file) {
    return false;
  }

  const lowerName = file.name.toLowerCase();
  return (
    supportedImageTypes.includes(file.type) ||
    supportedImageExtensions.some((extension) => lowerName.endsWith(extension))
  );
}

export function loadFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

export async function createImageSource(file) {
  const dataUrl = await loadFileAsDataUrl(file);

  return {
    name: file.name,
    size: file.size,
    type: file.type || "image/jpeg",
    file,
    dataUrl,
  };
}

export function getImagePreviewStats(source) {
  return [
    {
      label: "File Name",
      value: source?.name || "Unknown image",
    },
    {
      label: "Format",
      value: source?.type || "Unknown",
    },
    {
      label: "Size",
      value: formatFileSize(source?.size || 0),
    },
  ];
}

export function normalizeTextResult(result) {
  const fallbackRiskScore =
    Number(result?.riskScore) ||
    Number(result?.scamProbability) ||
    (typeof result?.trustScore === "number" ? 100 - Number(result.trustScore) : 0);
  const normalized = createVerificationResult({
    type: "text",
    status: result?.status || commonTextStatus[getRiskLevel(fallbackRiskScore).toLowerCase()],
    riskScore: fallbackRiskScore,
    confidence:
      Number(result?.confidence) || clampNumber(Number(result?.scamProbability) || fallbackRiskScore * 0.9 + 12, 40, 98),
    redFlags: result?.redFlags,
    explanation:
      result?.explanation ||
      `This message contains scam-like patterns${result?.redFlags?.length ? ` such as ${result.redFlags.slice(0, 3).join(", ")}` : ""}.`,
    recommendation: result?.recommendation || result?.safetyAdvice,
    signalBreakdown: result?.signalBreakdown,
    metadata: result?.metadata,
  });

  if (normalized.signalBreakdown.length === 0) {
    normalized.signalBreakdown = [
      { label: "Keyword Density", value: clampNumber(normalized.riskScore - 6, 4, 100) },
      { label: "Urgency Signals", value: clampNumber(normalized.riskScore - 2, 4, 100) },
      { label: "Credential Bait", value: clampNumber(normalized.riskScore + 4, 4, 100) },
      { label: "Confidence Match", value: normalized.confidence },
    ];
  }

  return normalized;
}

export function normalizeImageResult(result) {
  const fallbackRiskScore = Number(result?.riskScore) || Number(result?.fakeConfidence) || 0;
  const explanations = Array.isArray(result?.explanations) ? result.explanations : [];
  const normalized = createVerificationResult({
    type: "image",
    status: result?.status || commonImageStatus[getRiskLevel(fallbackRiskScore).toLowerCase()],
    riskScore: fallbackRiskScore,
    confidence: Number(result?.confidence) || clampNumber(fallbackRiskScore * 0.84 + 18, 40, 98),
    redFlags: result?.redFlags || explanations,
    explanation: result?.explanation || explanations[0],
    recommendation: result?.recommendation,
    signalBreakdown: result?.signalBreakdown,
    metadata: result?.metadata,
  });

  if (normalized.signalBreakdown.length === 0) {
    normalized.signalBreakdown = [
      { label: "Texture Uniformity", value: clampNumber(normalized.riskScore - 5, 4, 100) },
      { label: "Edited Region Signal", value: clampNumber(normalized.riskScore + 4, 4, 100) },
      { label: "Compression Trace", value: clampNumber(normalized.riskScore - 2, 4, 100) },
      { label: "Confidence Match", value: normalized.confidence },
    ];
  }

  return normalized;
}

export function normalizeUrlResult(result) {
  const fallbackRiskScore =
    Number(result?.riskScore) || (typeof result?.trustScore === "number" ? 100 - Number(result.trustScore) : 0);
  const threatReasons = Array.isArray(result?.threatReasons) ? result.threatReasons : [];
  const normalized = createVerificationResult({
    type: "url",
    status: result?.status || commonUrlStatus[getRiskLevel(fallbackRiskScore).toLowerCase()],
    riskScore: fallbackRiskScore,
    confidence: Number(result?.confidence) || clampNumber(fallbackRiskScore * 0.8 + 18, 40, 98),
    redFlags: result?.redFlags || threatReasons,
    explanation: result?.explanation || threatReasons[0],
    recommendation: result?.recommendation || result?.previewWarning,
    signalBreakdown: result?.signalBreakdown,
    metadata: result?.metadata,
  });

  if (normalized.signalBreakdown.length === 0) {
    normalized.signalBreakdown = [
      { label: "Domain Spoofing", value: clampNumber(normalized.riskScore + 2, 4, 100) },
      { label: "Transport Risk", value: clampNumber(normalized.riskScore - 4, 4, 100) },
      { label: "Credential Trap", value: clampNumber(normalized.riskScore + 1, 4, 100) },
      { label: "Confidence Match", value: normalized.confidence },
    ];
  }

  return normalized;
}

async function getImageMetrics(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = () => {
      const sampleSize = 120;
      const canvas = document.createElement("canvas");
      canvas.width = sampleSize;
      canvas.height = sampleSize;

      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Canvas is not available."));
        return;
      }

      context.drawImage(image, 0, 0, sampleSize, sampleSize);

      const { data } = context.getImageData(0, 0, sampleSize, sampleSize);
      let neighborDifferenceTotal = 0;
      let neighborComparisons = 0;
      let colorSpreadTotal = 0;
      let brightnessTotal = 0;
      let symmetryDifferenceTotal = 0;
      let symmetryComparisons = 0;
      let brightPixelCount = 0;
      let transparentPixelCount = 0;
      let harshEdgeCount = 0;

      for (let y = 0; y < sampleSize; y += 1) {
        for (let x = 0; x < sampleSize; x += 1) {
          const index = (y * sampleSize + x) * 4;
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const alpha = data[index + 3];
          const brightness = (red + green + blue) / 3;

          brightnessTotal += brightness;
          colorSpreadTotal += Math.max(red, green, blue) - Math.min(red, green, blue);

          if (brightness > 240) {
            brightPixelCount += 1;
          }

          if (alpha < 250) {
            transparentPixelCount += 1;
          }

          if (x < sampleSize - 1) {
            const rightIndex = index + 4;
            const rightDifference = getColorDifference(data, index, rightIndex);
            neighborDifferenceTotal += rightDifference;
            neighborComparisons += 1;

            if (rightDifference > 95) {
              harshEdgeCount += 1;
            }
          }

          if (y < sampleSize - 1) {
            const lowerIndex = index + sampleSize * 4;
            const lowerDifference = getColorDifference(data, index, lowerIndex);
            neighborDifferenceTotal += lowerDifference;
            neighborComparisons += 1;

            if (lowerDifference > 95) {
              harshEdgeCount += 1;
            }
          }

          if (x < sampleSize / 2) {
            const mirrorIndex = (y * sampleSize + (sampleSize - 1 - x)) * 4;
            symmetryDifferenceTotal += getColorDifference(data, index, mirrorIndex);
            symmetryComparisons += 1;
          }
        }
      }

      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        averageNeighborDifference: neighborDifferenceTotal / neighborComparisons,
        averageColorSpread: colorSpreadTotal / (sampleSize * sampleSize),
        averageBrightness: brightnessTotal / (sampleSize * sampleSize),
        averageSymmetryDifference: symmetryDifferenceTotal / symmetryComparisons,
        brightPixelRatio: brightPixelCount / (sampleSize * sampleSize),
        harshEdgeRatio: harshEdgeCount / Math.max(neighborComparisons, 1),
        transparencyRatio: transparentPixelCount / (sampleSize * sampleSize),
      });
    };

    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = dataUrl;
  });
}

export function fallbackVerifyText(message) {
  const normalized = message.toLowerCase();
  const scamMatches = collectMatches(message, textSignals.scam);
  const urgencyMatches = collectMatches(message, textSignals.urgency);
  const otpMatches = collectMatches(message, textSignals.otp);
  const phishingMatches = collectMatches(message, textSignals.phishing);
  const offerMatches = collectMatches(message, textSignals.offers);
  const emotionMatches = collectMatches(message, textSignals.emotion);

  let riskScore = 8;

  riskScore += scamMatches.length * 8;
  riskScore += urgencyMatches.length * 8;
  riskScore += otpMatches.length * 12;
  riskScore += phishingMatches.length * 10;
  riskScore += offerMatches.length * 7;
  riskScore += emotionMatches.length * 7;

  if (/https?:\/\/|www\./i.test(message)) {
    riskScore += 10;
  }

  if (/(click|tap)\s+(here|below)/i.test(message)) {
    riskScore += 8;
  }

  if ((message.match(/\b[A-Z]{4,}\b/g) || []).length >= 2) {
    riskScore += 6;
  }

  if (/[!?]{2,}/.test(message)) {
    riskScore += 5;
  }

  if (/\b\d{4,8}\b/.test(message) && (otpMatches.length > 0 || /\b(code|otp|pin|password)\b/i.test(message))) {
    riskScore += 15;
  }

  if (/\b(bank|upi|wallet|payment|account)\b/.test(normalized) && /\b(lock|suspend|blocked|verify|issue)\b/.test(normalized)) {
    riskScore += 10;
  }

  const redFlags = uniqueItems([
    ...scamMatches,
    ...urgencyMatches,
    ...otpMatches,
    ...phishingMatches,
    ...offerMatches,
    ...emotionMatches,
  ]);

  const clampedRiskScore = clampNumber(Math.round(riskScore), 3, 99);
  const riskLevel = getRiskLevel(clampedRiskScore);
  const confidence = clampNumber(clampedRiskScore * 0.82 + redFlags.length * 3 + 10, 46, 98);
  const signalBreakdown = [
    { label: "Keyword Density", value: clampNumber(redFlags.length * 14 + 12, 5, 100) },
    { label: "Urgency Signals", value: clampNumber(urgencyMatches.length * 22 + 16, 5, 100) },
    { label: "Credential Bait", value: clampNumber((otpMatches.length + phishingMatches.length) * 20 + 14, 5, 100) },
    { label: "Emotional Pressure", value: clampNumber(emotionMatches.length * 20 + offerMatches.length * 10 + 10, 5, 100) },
    { label: "Demo Risk Score", value: clampedRiskScore },
  ];

  let recommendation = "Stay cautious, verify the sender independently, and avoid clicking unknown links.";

  if (riskLevel === "Medium") {
    recommendation =
      "Do not share OTPs, banking details, or passwords. Double-check the sender through an official contact channel before responding.";
  }

  if (riskLevel === "High") {
    recommendation =
      "Do not reply or share personal information. Report or block the sender and verify the request through an official support channel.";
  }

  return createVerificationResult({
    type: "text",
    status: commonTextStatus[riskLevel.toLowerCase()],
    riskScore: clampedRiskScore,
    confidence,
    redFlags: redFlags.length > 0 ? redFlags : ["unexpected request"],
    explanation:
      riskLevel === "High"
        ? "This input contains scam-like patterns with urgency, credential bait, or reward pressure."
        : riskLevel === "Medium"
          ? "This input mixes legitimate-looking language with suspicious request patterns."
          : "This input shows fewer scam signals, but you should still verify unexpected requests.",
    recommendation,
    signalBreakdown,
    metadata: {
      engine: "browser-demo-text",
      inputLength: message.length,
    },
  });
}

function normalizeImageSource(source) {
  if (!source) {
    throw new Error("An image source is required.");
  }

  if (source.dataUrl) {
    return source;
  }

  if (typeof File !== "undefined" && source instanceof File) {
    return createImageSource(source);
  }

  if (source.file) {
    return createImageSource(source.file);
  }

  throw new Error("Unsupported image source.");
}

export async function fallbackVerifyImage(source) {
  const imageSource = await normalizeImageSource(source);
  const metrics = await getImageMetrics(imageSource.dataUrl);
  const fileName = imageSource.name.toLowerCase();
  const redFlags = [];
  let riskScore = 18;

  const suspiciousNameTerms = ["ai", "deepfake", "synthetic", "generated", "face-swap", "swap", "edit", "clone", "render"];
  const matchedNameTerms = suspiciousNameTerms.filter((term) => fileName.includes(term));

  if (matchedNameTerms.length > 0) {
    riskScore += matchedNameTerms.length * 8;
    redFlags.push("synthetic-style filename");
  }

  if (imageSource.type === "image/svg+xml") {
    riskScore += 12;
    redFlags.push("vector-style source");
  }

  if (metrics.width < 700 || metrics.height < 700) {
    riskScore += 10;
    redFlags.push("low resolution");
  }

  const aspectRatio = metrics.width / Math.max(metrics.height, 1);

  if (aspectRatio > 0.9 && aspectRatio < 1.1) {
    riskScore += 6;
    redFlags.push("avatar-style crop");
  }

  if (metrics.averageNeighborDifference < 22) {
    riskScore += 12;
    redFlags.push("low texture variance");
  }

  if (metrics.averageNeighborDifference > 68) {
    riskScore += 8;
    redFlags.push("high contrast edges");
  }

  if (metrics.averageSymmetryDifference < 18) {
    riskScore += 10;
    redFlags.push("high facial symmetry");
  }

  if (metrics.averageColorSpread < 28) {
    riskScore += 8;
    redFlags.push("flat color spread");
  }

  if (metrics.transparencyRatio > 0.01) {
    riskScore += 12;
    redFlags.push("transparent layer");
  }

  if (metrics.harshEdgeRatio > 0.14) {
    riskScore += 10;
    redFlags.push("cutout-like boundary");
  }

  const bytesPerPixel = imageSource.size / Math.max(metrics.width * metrics.height, 1);

  if (bytesPerPixel < 0.06 && metrics.width * metrics.height > 500000) {
    riskScore += 10;
    redFlags.push("heavy compression");
  }

  if (metrics.brightPixelRatio > 0.18) {
    riskScore += 6;
    redFlags.push("render-like highlights");
  }

  const clampedRiskScore = clampNumber(Math.round(riskScore), 5, 98);
  const riskLevel = getRiskLevel(clampedRiskScore);
  const confidence = clampNumber(clampedRiskScore * 0.86 + redFlags.length * 2 + 8, 45, 97);
  const signalBreakdown = [
    { label: "Texture Uniformity", value: clampNumber(100 - metrics.averageNeighborDifference * 1.9, 5, 100) },
    { label: "Edge Artifact Signal", value: clampNumber(metrics.harshEdgeRatio * 260 + 10, 5, 100) },
    { label: "Symmetry Signal", value: clampNumber(100 - metrics.averageSymmetryDifference * 3.2, 5, 100) },
    { label: "Compression Trace", value: clampNumber((0.12 - bytesPerPixel) * 420 + 12, 5, 100) },
    { label: "Demo Risk Score", value: clampedRiskScore },
  ];

  let recommendation = "Verify the source before trusting this image.";

  if (riskLevel === "Medium") {
    recommendation =
      "Ask for the original source, compare it with trusted references, and avoid using the image as proof until verified.";
  }

  if (riskLevel === "High") {
    recommendation =
      "Do not rely on this image alone. Cross-check it with trusted sources and request original capture details before acting on it.";
  }

  return createVerificationResult({
    type: "image",
    status: commonImageStatus[riskLevel.toLowerCase()],
    riskScore: clampedRiskScore,
    confidence,
    redFlags: redFlags.length > 0 ? uniqueItems(redFlags) : ["no strong manipulation indicators"],
    explanation:
      riskLevel === "High"
        ? "This image shows multiple synthetic or edited-media traits in the browser-side forensic scan."
        : riskLevel === "Medium"
          ? "This image has a few authenticity concerns and should be reviewed before trust."
          : "The browser-side scan found limited manipulation indicators in this image.",
    recommendation,
    signalBreakdown,
    metadata: {
      engine: "browser-demo-image",
      width: metrics.width,
      height: metrics.height,
    },
  });
}

export function fallbackVerifyUrl(urlValue) {
  let parsedUrl;
  const suspiciousTerms = ["login", "verify", "secure", "update", "bonus", "gift", "reward", "wallet", "crypto", "otp", "free"];
  const suspiciousTlds = [".zip", ".click", ".top", ".xyz", ".gq", ".tk", ".work", ".fit"];
  const shortenedDomains = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "rebrand.ly"];
  const trustedDomains = ["google.com", "microsoft.com", "apple.com", "github.com", "openai.com"];
  const localBlacklistHosts = [
    "secure-bank-verify-login-update.xyz",
    "paypa1-security-check.com",
    "wallet-otp-check.top",
    "gift-card-claim-now.click",
  ];
  const wellKnownBrands = ["google", "microsoft", "apple", "amazon", "paypal", "bank", "netflix", "instagram"];

  try {
    parsedUrl = new URL(normalizeUrlValue(urlValue));
  } catch (error) {
    return createVerificationResult({
      type: "url",
      status: "Unsafe Link",
      riskScore: 96,
      confidence: 93,
      redFlags: ["invalid link format"],
      explanation: "The link format is invalid, which is a strong reason not to trust it.",
      recommendation: "Do not open this link unless verified.",
      signalBreakdown: [
        { label: "Domain Spoofing", value: 88 },
        { label: "Transport Risk", value: 72 },
        { label: "Credential Trap", value: 74 },
        { label: "Demo Risk Score", value: 96 },
      ],
      metadata: {
        engine: "browser-demo-url",
      },
    });
  }

  const host = parsedUrl.hostname.toLowerCase();
  const baseDomain = getBaseDomain(host);
  const fullUrl = parsedUrl.href.toLowerCase();
  const pathAndQuery = `${parsedUrl.pathname}${parsedUrl.search}`.toLowerCase();
  const redFlags = [];
  let riskScore = 6;

  if (parsedUrl.protocol !== "https:") {
    riskScore += 24;
    redFlags.push("http only");
  }

  if (parsedUrl.username || parsedUrl.password) {
    riskScore += 24;
    redFlags.push("embedded credentials");
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    riskScore += 28;
    redFlags.push("raw IP address");
  }

  if (host.includes("xn--")) {
    riskScore += 24;
    redFlags.push("punycode");
  }

  if (host.split(".").length > 3) {
    riskScore += 10;
    redFlags.push("multi-subdomain pattern");
  }

  if (host.includes("-")) {
    riskScore += 8;
    redFlags.push("hyphen-heavy domain");
  }

  if (localBlacklistHosts.includes(host) || localBlacklistHosts.includes(baseDomain)) {
    riskScore += 35;
    redFlags.push("blocked domain pattern");
  }

  if (fullUrl.length > 90) {
    riskScore += 10;
    redFlags.push("long URL");
  }

  const matchedTerms = suspiciousTerms.filter((term) => host.includes(term) || pathAndQuery.includes(term));

  if (matchedTerms.length > 0) {
    riskScore += matchedTerms.length * 7;
    redFlags.push(...matchedTerms);
  }

  if (suspiciousTlds.some((tld) => host.endsWith(tld))) {
    riskScore += 12;
    redFlags.push("risky domain suffix");
  }

  if (shortenedDomains.includes(host)) {
    riskScore += 18;
    redFlags.push("shortened link");
  }

  const impersonatedBrand = wellKnownBrands.find((brand) => host.includes(brand) && !matchesTrustedDomain(host, trustedDomains));

  if (impersonatedBrand) {
    riskScore += 18;
    redFlags.push(`${impersonatedBrand} lookalike`);
  }

  if (/\d{4,}/.test(host)) {
    riskScore += 6;
    redFlags.push("numeric domain pattern");
  }

  const looksNewOrDisposable =
    suspiciousTlds.some((tld) => host.endsWith(tld)) ||
    /(?:19|20)\d{2}/.test(host) ||
    baseDomain.length > 18 ||
    (host.includes("-") && /\d/.test(host));

  if (looksNewOrDisposable) {
    riskScore += 10;
    redFlags.push("disposable-looking domain");
  }

  if (matchesTrustedDomain(host, trustedDomains) && redFlags.length === 0) {
    riskScore -= 18;
    redFlags.push("trusted domain pattern");
  }

  const clampedRiskScore = clampNumber(Math.round(riskScore), 1, 99);
  const riskLevel = getRiskLevel(clampedRiskScore);
  const confidence = clampNumber(clampedRiskScore * 0.84 + redFlags.length * 2 + 12, 48, 98);
  const signalBreakdown = [
    { label: "Domain Spoofing", value: clampNumber((impersonatedBrand ? 76 : 24) + matchedTerms.length * 6, 5, 100) },
    { label: "Transport Risk", value: parsedUrl.protocol === "https:" ? 16 : 86 },
    { label: "Credential Trap", value: clampNumber(matchedTerms.length * 14 + (pathAndQuery.includes("login") ? 18 : 10), 5, 100) },
    { label: "Structural Risk", value: clampNumber((host.split(".").length - 2) * 18 + (host.includes("-") ? 16 : 8), 5, 100) },
    { label: "Demo Risk Score", value: clampedRiskScore },
  ];

  let recommendation = "Check the exact domain carefully before opening this link.";

  if (riskLevel === "High") {
    recommendation = "Do not open this link or submit credentials. Validate it through an official website or app.";
  }

  if (riskLevel === "Medium") {
    recommendation = "Inspect the domain carefully before opening it and avoid entering sensitive details.";
  }

  return createVerificationResult({
    type: "url",
    status: commonUrlStatus[riskLevel.toLowerCase()],
    riskScore: clampedRiskScore,
    confidence,
    redFlags: redFlags.length > 0 ? uniqueItems(redFlags) : ["no strong phishing indicators"],
    explanation:
      riskLevel === "High"
        ? "This URL shows phishing-style structure, risky domain patterns, or unsafe transport signals."
        : riskLevel === "Medium"
          ? "This URL needs review because it contains mixed trust and phishing-style signals."
          : "This URL looks safer than typical phishing links, but you should still confirm the destination.",
    recommendation,
    signalBreakdown,
    metadata: {
      engine: "browser-demo-url",
      host,
      scheme: parsedUrl.protocol.replace(":", ""),
    },
  });
}

export function buildDemoImageSource() {
  const demoSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
      <defs>
        <linearGradient id="demoBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#112434"/>
          <stop offset="100%" stop-color="#0a141e"/>
        </linearGradient>
        <radialGradient id="demoGlow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#86f7dd" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="#57c8ff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="800" height="800" fill="url(#demoBg)"/>
      <circle cx="400" cy="250" r="180" fill="url(#demoGlow)"/>
      <ellipse cx="400" cy="420" rx="178" ry="210" fill="#d9d5d2"/>
      <ellipse cx="400" cy="380" rx="132" ry="156" fill="#f0e7df"/>
      <ellipse cx="346" cy="362" rx="24" ry="16" fill="#0f1b28"/>
      <ellipse cx="454" cy="362" rx="24" ry="16" fill="#0f1b28"/>
      <rect x="324" y="464" width="152" height="18" rx="9" fill="#ffba76"/>
      <path d="M268 292C316 220 487 220 533 292" fill="none" stroke="#0f1b28" stroke-width="22" stroke-linecap="round"/>
      <path d="M225 628C278 546 351 516 400 516C449 516 522 546 575 628" fill="#193447"/>
      <path d="M282 520C317 576 359 608 400 608C441 608 483 576 518 520" fill="#ffddb8" opacity="0.14"/>
    </svg>
  `.trim();

  const blob = new Blob([demoSvg], { type: "image/svg+xml" });

  return {
    name: "ai-face-demo.svg",
    size: blob.size,
    type: "image/svg+xml",
    file: null,
    dataUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(demoSvg)}`,
  };
}

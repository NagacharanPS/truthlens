import {
  fallbackVerifyImage,
  fallbackVerifyText,
  fallbackVerifyUrl,
  normalizeImageResult,
  normalizeTextResult,
  normalizeUrlResult,
} from "../utils/fallbackLogic";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_HEALTH_TIMEOUT_MS = 5000;
const HEALTH_CACHE_TTL_MS = 15000;

let healthCache = {
  checkedAt: 0,
  response: {
    status: "checking",
    message: "Checking TruthShield backend status...",
    details: null,
  },
};

function buildUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function parseTimeout(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const REQUEST_TIMEOUT_MS = parseTimeout(import.meta.env.VITE_API_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS);
const HEALTH_REQUEST_TIMEOUT_MS = parseTimeout(import.meta.env.VITE_HEALTH_TIMEOUT_MS, DEFAULT_HEALTH_TIMEOUT_MS);

async function requestJson(path, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl(path), {
      ...options,
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok) {
      const error = new Error(payload?.detail || `Request failed with status ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("The request timed out while contacting TruthShield.");
      timeoutError.code = "TIMEOUT";
      throw timeoutError;
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function cacheHealth(response) {
  healthCache = {
    checkedAt: Date.now(),
    response,
  };

  return response;
}

function isNetworkFailure(error) {
  return !error?.status || error?.code === "TIMEOUT" || error?.name === "TypeError";
}

function buildFallbackMessage(scanType, reason = "offline") {
  if (reason === "timeout") {
    if (scanType === "image") {
      return "TruthShield took too long to answer the image scan, so TruthLens switched this request to demo mode.";
    }

    if (scanType === "url") {
      return "TruthShield took too long to answer the URL scan, so TruthLens switched this request to demo mode.";
    }

    return "TruthShield took too long to answer the text scan, so TruthLens switched this request to demo mode.";
  }

  if (scanType === "image") {
    return "TruthShield backend is unavailable, so TruthLens switched to demo image analysis mode.";
  }

  if (scanType === "url") {
    return "TruthShield backend is unavailable, so TruthLens switched to demo URL analysis mode.";
  }

  return "TruthShield backend is unavailable, so TruthLens switched to demo text analysis mode.";
}

function buildTextSuccessMessage(result) {
  const metadata = result?.metadata || {};
  const detectedLanguage = metadata.detectedLanguage || "English";

  if (metadata.translationStatus === "partial") {
    return `TruthShield detected ${detectedLanguage} input and applied partial English normalization before analysis.`;
  }

  if (metadata.translationApplied) {
    return `TruthShield detected ${detectedLanguage} input and normalized it into English before analysis.`;
  }

  if (metadata.rectifiedText) {
    return "TruthShield cleaned broken words or common spelling issues before analysis.";
  }

  return "";
}

function normalizeHealthPayload(data) {
  const normalizedStatus = data?.status === "offline" ? "offline" : "online";

  return {
    status: normalizedStatus,
    message: "TruthShield backend connected.",
    details: data,
  };
}

async function refreshBackendHealth({ offlineMessage } = {}) {
  try {
    const data = await requestJson("/api/health", {}, HEALTH_REQUEST_TIMEOUT_MS);
    return cacheHealth(normalizeHealthPayload(data));
  } catch (error) {
    return cacheHealth({
      status: "offline",
      message: offlineMessage || "TruthShield backend is offline. TruthLens will continue in demo mode.",
      details: null,
    });
  }
}

async function executeVerification({
  path,
  options,
  type,
  normalize,
  fallback,
  buildSuccessMessage,
}) {
  try {
    const data = await requestJson(path, options);
    const normalizedData = normalize(data);

    cacheHealth({
      status: "online",
      message: "TruthShield backend connected.",
      details: null,
    });

    return {
      data: normalizedData,
      mode: "api",
      message: buildSuccessMessage ? buildSuccessMessage(normalizedData, data) : "",
    };
  } catch (error) {
    if (!isNetworkFailure(error) && error?.status < 500) {
      throw error;
    }

    const fallbackReason = error?.code === "TIMEOUT" ? "timeout" : "offline";

    if (fallbackReason === "timeout") {
      cacheHealth({
        status: "degraded",
        message: "TruthShield is taking longer than expected. Demo mode handled the last scan.",
        details: null,
      });
    } else {
      await refreshBackendHealth({
        offlineMessage: "TruthShield backend is offline. Demo mode is active.",
      });
    }

    return {
      data: await fallback(),
      mode: "demo",
      message: buildFallbackMessage(type, fallbackReason),
    };
  }
}

export function getDefaultHealthState() {
  return {
    status: "checking",
    message: "Checking TruthShield backend status...",
    details: null,
  };
}

export async function getBackendHealth({ force = false } = {}) {
  const cacheIsFresh = Date.now() - healthCache.checkedAt < HEALTH_CACHE_TTL_MS;

  if (!force && cacheIsFresh) {
    return healthCache.response;
  }

  try {
    const data = await requestJson("/api/health", {}, HEALTH_REQUEST_TIMEOUT_MS);
    return cacheHealth(normalizeHealthPayload(data));
  } catch (error) {
    return cacheHealth({
      status: "offline",
      message: "TruthShield backend is offline. TruthLens will continue in demo mode.",
      details: null,
    });
  }
}

export async function verifyText(text, language = "auto") {
  return executeVerification({
    path: "/api/verify/text",
    options: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, language: language || "auto" }),
    },
    type: "text",
    normalize: normalizeTextResult,
    buildSuccessMessage: buildTextSuccessMessage,
    fallback: () => fallbackVerifyText(text, language),
  });
}

export async function verifyImage(fileOrSource, language = "auto") {
  const uploadFile =
    fileOrSource?.file ?? (typeof File !== "undefined" && fileOrSource instanceof File ? fileOrSource : null);

  if (!uploadFile) {
    return {
      data: await fallbackVerifyImage(fileOrSource),
      mode: "demo",
      message: "Demo image loaded with browser-side image heuristics.",
    };
  }

  const formData = new FormData();
  formData.append("image", uploadFile);
  if (language && language !== "auto") {
    formData.append("language", language);
  }

  return executeVerification({
    path: "/api/verify/image",
    options: {
      method: "POST",
      body: formData,
    },
    type: "image",
    normalize: normalizeImageResult,
    fallback: () => fallbackVerifyImage(fileOrSource),
  });
}

export async function verifyUrl(url) {
  return executeVerification({
    path: "/api/verify/url",
    options: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    },
    type: "url",
    normalize: normalizeUrlResult,
    fallback: () => fallbackVerifyUrl(url),
  });
}

function isVerificationValid(v) {
  if (!v || typeof v !== "object") return false;
  return (
    v.riskScore !== undefined ||
    v.riskLevel !== undefined ||
    v.status !== undefined ||
    (Array.isArray(v.redFlags) && v.redFlags.length > 0)
  );
}

function generateLocalExplanation(verification, userQuery = "") {
  const v = verification || {};
  const q = (userQuery || "").toLowerCase();

  if (!isVerificationValid(v)) {
    return (
      "### ⚠️ No Verification Found Yet\n\n" +
      "You haven't run a verification scan yet. Please go to the **Text**, **Image**, or **URL** " +
      "verification module, submit your input, and click **Verify**.\n\n" +
      "Once analyzed, I will explain all the risk scores, red flags, and solutions for you!"
    );
  }

  const scanType = (v.type || "content").toUpperCase();
  const riskLevel = v.riskLevel || "Unknown";
  const riskScore = v.riskScore ?? 0;
  const status = v.status || "Completed";
  const redFlags = Array.isArray(v.redFlags) ? v.redFlags : [];
  const recommendation = v.recommendation || "Exercise caution with this content.";

  if (q.includes("solution") || q.includes("what to do") || q.includes("fix") || q.includes("protect") || q.includes("action")) {
    return `### 🛡️ Recommended Solutions & Action Plan (${riskLevel} Risk ${scanType})\n\n**Primary Recommendation:** ${recommendation}\n\n#### Immediate Steps to Take:\n1. **Do Not Engage:** Avoid clicking unverified links or downloading unexpected attachments.\n2. **Verify Out-of-Band:** Cross-reference through official contact channels (e.g. authentic websites, verified phone numbers).\n3. **Protect Credentials:** Never disclose passwords, OTPs, or financial details.\n4. **Report & Isolate:** Flag suspicious messages/URLs to your security team or provider.`;
  }

  return `### 📊 TruthLens AI Analytics Summary: ${scanType} Scan\n\n- **Overall Risk:** **${riskLevel}** (${riskScore}/100 Risk Score)\n- **Detection Status:** \`${status}\` (Confidence: ${v.confidence ?? 0}%)\n- **Identified Red Flags:** ${redFlags.length ? redFlags.join(", ") : "None detected"}\n\n#### 💡 Core Threat Analysis:\n${v.explanation || "Risk calculated using heuristic pattern matching and neural verification models."}\n\n#### 🛡️ Recommendation:\n> ${recommendation}`;
}

export async function explainAnalytics({ verification, userQuery = "", chatHistory = [] }) {
  try {
    const payload = await requestJson("/api/explain", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        verification: verification || {},
        user_query: userQuery,
        chat_history: chatHistory,
      }),
    });

    return payload?.explanation || generateLocalExplanation(verification, userQuery);
  } catch (error) {
    return generateLocalExplanation(verification, userQuery);
  }
}


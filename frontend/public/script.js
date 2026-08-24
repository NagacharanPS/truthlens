// Set this from the backend or hosting layer later if the API lives on another origin.
const API_BASE_URL = window.TRUTHLENS_API_BASE_URL || "";

const visual = document.querySelector(".hero-visual");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const modal = document.querySelector("#verificationModal");
const verifyNowButton = document.querySelector("#verifyNowButton");
const liveDemoButton = document.querySelector("#liveDemoButton");
const closeVerificationModal = document.querySelector("#closeVerificationModal");
const backdrop = document.querySelector(".verification-backdrop");
const verificationStatus = document.querySelector("#verificationStatus");
const scanLoading = document.querySelector("#scanLoading");
const scanLoadingMessage = document.querySelector("#scanLoadingMessage");
const tabButtons = Array.from(document.querySelectorAll(".verification-tab-button"));
const tabPanels = Array.from(document.querySelectorAll(".verification-tab-panel"));
const clearButtons = Array.from(document.querySelectorAll("[data-clear-target]"));
const toolForms = Array.from(document.querySelectorAll(".tool-form"));

const textForm = document.querySelector("#textVerificationForm");
const textInput = document.querySelector("#textToCheck");
const textResultCard = document.querySelector("#textResultCard");
const textScamProbability = document.querySelector("#textScamProbability");
const textRiskLevel = document.querySelector("#textRiskLevel");
const textRiskBadge = document.querySelector("#textRiskBadge");
const textRedFlags = document.querySelector("#textRedFlags");
const textSafetyAdvice = document.querySelector("#textSafetyAdvice");

const imageForm = document.querySelector("#imageVerificationForm");
const imageInput = document.querySelector("#imageToCheck");
const imagePreview = document.querySelector("#imagePreview");
const imagePreviewImage = document.querySelector("#imagePreviewImage");
const imagePreviewMeta = document.querySelector("#imagePreviewMeta");
const imageResultCard = document.querySelector("#imageResultCard");
const imageFakeConfidence = document.querySelector("#imageFakeConfidence");
const imageRiskLevel = document.querySelector("#imageRiskLevel");
const imageRiskBadge = document.querySelector("#imageRiskBadge");
const imageExplanationList = document.querySelector("#imageExplanationList");
const imageSafetyRecommendation = document.querySelector("#imageSafetyRecommendation");

const urlForm = document.querySelector("#urlVerificationForm");
const urlInput = document.querySelector("#urlToCheck");
const urlResultCard = document.querySelector("#urlResultCard");
const urlSafetyStatus = document.querySelector("#urlSafetyStatus");
const urlTrustScore = document.querySelector("#urlTrustScore");
const urlStatusBadge = document.querySelector("#urlStatusBadge");
const urlThreatReasons = document.querySelector("#urlThreatReasons");
const urlPreviewWarning = document.querySelector("#urlPreviewWarning");

const dashboardHeadline = document.querySelector("#dashboardHeadline");
const dashboardTotalScans = document.querySelector("#dashboardTotalScans");
const dashboardScamsBlocked = document.querySelector("#dashboardScamsBlocked");
const dashboardDeepfakesDetected = document.querySelector("#dashboardDeepfakesDetected");
const dashboardTrendChange = document.querySelector("#dashboardTrendChange");
const dashboardRecentCount = document.querySelector("#dashboardRecentCount");
const trendAreaPath = document.querySelector("#trendAreaPath");
const trendLinePath = document.querySelector("#trendLinePath");
const trendPointsGroup = document.querySelector("#trendPointsGroup");
const trendLabelRow = document.querySelector("#trendLabelRow");
const recentReportsList = document.querySelector("#recentReportsList");

const badgeClasses = ["risk-low", "risk-medium", "risk-high", "status-safe", "status-unsafe"];
const supportedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const supportedImageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
const textSignals = {
  scam: ["claim now", "limited offer", "reward", "prize", "winner", "free", "refund", "cashback", "gift card"],
  urgency: ["urgent", "immediately", "asap", "final warning", "act now", "limited time", "expire", "suspended"],
  otp: ["otp", "one-time password", "verification code", "pin", "cvv", "password", "passcode"],
  phishing: ["verify account", "click here", "tap here", "reset account", "confirm bank", "login now", "security alert"],
  offers: ["free", "gift", "reward", "winner", "lottery", "bonus", "cashback", "discount", "refund"],
  emotion: ["family emergency", "panic", "arrest", "legal action", "crying", "help me", "urgent help", "police"],
};

const appState = {
  currentImageSource: null,
  isLoading: false,
  lastFocusedElement: null,
};

const analyticsState = {
  totals: {
    scansToday: 184,
    scamsBlocked: 41,
    deepfakesDetected: 16,
  },
  trendLabels: ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "Now"],
  trendValues: [24, 31, 29, 46, 43, 57, 63],
  recentReports: [
    {
      id: "report-1",
      type: "URL Shield",
      title: "secure-login-alert.xyz",
      verdict: "Unsafe",
      severity: "high",
      summary: "Fake banking domain and phishing keywords triggered multiple alerts.",
      createdAt: Date.now() - 1000 * 60 * 18,
    },
    {
      id: "report-2",
      type: "Text Scan",
      title: "Wallet reward message",
      verdict: "Medium Risk",
      severity: "medium",
      summary: "Urgency language and OTP bait raised the scam probability.",
      createdAt: Date.now() - 1000 * 60 * 31,
    },
    {
      id: "report-3",
      type: "Image Scan",
      title: "Profile selfie review",
      verdict: "High Risk",
      severity: "high",
      summary: "Synthetic portrait symmetry and over-smoothed detail increased deepfake confidence.",
      createdAt: Date.now() - 1000 * 60 * 52,
    },
    {
      id: "report-4",
      type: "URL Shield",
      title: "account-auth-check.click",
      verdict: "Unsafe",
      severity: "high",
      summary: "Disposable top-level domain and impersonation-style structure were detected.",
      createdAt: Date.now() - 1000 * 60 * 76,
    },
    {
      id: "report-5",
      type: "Text Scan",
      title: "Courier OTP notice",
      verdict: "Medium Risk",
      severity: "medium",
      summary: "Delivery scam wording and verification-code requests matched known fraud patterns.",
      createdAt: Date.now() - 1000 * 60 * 104,
    },
  ],
  reportCounter: 5,
};

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getRiskLevel(score) {
  if (score >= 70) {
    return "High";
  }

  if (score >= 35) {
    return "Medium";
  }

  return "Low";
}

function uniqueItems(items) {
  return [...new Set(items)];
}

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setBadgeClass(element, className) {
  if (!element) {
    return;
  }

  element.classList.remove(...badgeClasses);

  if (className) {
    element.classList.add(className);
  }
}

function showStatus(message, tone = "success") {
  if (!verificationStatus) {
    return;
  }

  verificationStatus.hidden = false;
  verificationStatus.textContent = message;
  verificationStatus.dataset.tone = tone;
}

function hideStatus() {
  if (!verificationStatus) {
    return;
  }

  verificationStatus.hidden = true;
  verificationStatus.textContent = "";
  delete verificationStatus.dataset.tone;
}

function showError(message) {
  showStatus(message, "warning");
}

function setInteractiveState(isDisabled) {
  toolForms.forEach((form) => {
    Array.from(form.elements).forEach((element) => {
      if ("disabled" in element) {
        element.disabled = isDisabled;
      }
    });
  });

  clearButtons.forEach((button) => {
    button.disabled = isDisabled;
  });
}

function showLoading(message = "AI Scan in Progress... Reviewing threat patterns and preparing the result card.") {
  appState.isLoading = true;

  if (scanLoadingMessage) {
    scanLoadingMessage.textContent = message;
  }

  if (scanLoading) {
    scanLoading.hidden = false;
  }

  hideStatus();
  setInteractiveState(true);
}

function hideLoading() {
  appState.isLoading = false;

  if (scanLoading) {
    scanLoading.hidden = true;
  }

  if (scanLoadingMessage) {
    scanLoadingMessage.textContent = "";
  }

  setInteractiveState(false);
}

function createChip(text) {
  const chip = document.createElement("span");
  chip.className = "chip-tag";
  chip.textContent = text;
  return chip;
}

function createPreviewStat(label, value) {
  const stat = document.createElement("div");
  stat.className = "preview-stat";

  const statLabel = document.createElement("span");
  statLabel.className = "metric-label";
  statLabel.textContent = label;

  const statValue = document.createElement("strong");
  statValue.textContent = value;

  stat.appendChild(statLabel);
  stat.appendChild(statValue);

  return stat;
}

function renderChipList(container, items) {
  if (!container) {
    return;
  }

  container.innerHTML = "";
  items.forEach((item) => {
    container.appendChild(createChip(item));
  });
}

function renderList(container, items) {
  if (!container) {
    return;
  }

  container.innerHTML = "";
  items.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    container.appendChild(listItem);
  });
}

function revealResultCard(card) {
  if (!card) {
    return;
  }

  card.hidden = false;
  card.classList.remove("is-visible");

  requestAnimationFrame(() => {
    card.classList.add("is-visible");
  });
}

function hideResultCard(card) {
  if (!card) {
    return;
  }

  card.hidden = true;
  card.classList.remove("is-visible");
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

function getRelativeTimeLabel(timestamp) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));

  if (elapsedMinutes < 1) {
    return "Just now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `${elapsedHours} hr ago`;
  }

  return `${Math.floor(elapsedHours / 24)} day ago`;
}

function formatDashboardCount(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function focusFieldForTab(tabName) {
  const focusMap = {
    dashboard: dashboardHeadline,
    text: textInput,
    image: imageInput,
    url: urlInput,
  };

  const field = focusMap[tabName];

  if (field) {
    field.focus();
  }
}

function setActiveTab(tabName) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === tabName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === tabName;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  if (tabName === "dashboard") {
    renderDashboard();
  }
}

function animateDashboardCount(element, targetValue) {
  if (!element) {
    return;
  }

  if (element._countAnimationFrame) {
    cancelAnimationFrame(element._countAnimationFrame);
  }

  const startValue = Number(element.dataset.currentValue || 0);
  const duration = reducedMotionQuery.matches ? 0 : 720;
  const startTime = performance.now();

  const updateCount = (currentTime) => {
    const progress = duration === 0 ? 1 : Math.min((currentTime - startTime) / duration, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(startValue + (targetValue - startValue) * easedProgress);
    element.textContent = formatDashboardCount(currentValue);

    if (progress < 1) {
      element._countAnimationFrame = requestAnimationFrame(updateCount);
      return;
    }

    delete element._countAnimationFrame;
    element.dataset.currentValue = String(targetValue);
    element.textContent = formatDashboardCount(targetValue);
  };

  element._countAnimationFrame = requestAnimationFrame(updateCount);
}

function getTrendPoints(values) {
  const startX = 60;
  const endX = 660;
  const baseY = 260;
  const topY = 40;
  const xStep = (endX - startX) / Math.max(values.length - 1, 1);

  return values.map((value, index) => {
    const normalizedValue = clampNumber(value, 0, 100) / 100;

    return {
      x: startX + index * xStep,
      y: baseY - normalizedValue * (baseY - topY),
    };
  });
}

function buildLinePath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function buildAreaPath(points) {
  if (points.length === 0) {
    return "";
  }

  const linePath = buildLinePath(points);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return `${linePath} L ${lastPoint.x.toFixed(1)} 260 L ${firstPoint.x.toFixed(1)} 260 Z`;
}

function animateTrendLine(pathElement) {
  if (!pathElement) {
    return;
  }

  const pathLength = pathElement.getTotalLength();

  pathElement.style.transition = "none";
  pathElement.style.strokeDasharray = `${pathLength}`;
  pathElement.style.strokeDashoffset = `${pathLength}`;
  pathElement.getBoundingClientRect();

  if (reducedMotionQuery.matches) {
    pathElement.style.strokeDashoffset = "0";
    return;
  }

  pathElement.style.transition = "stroke-dashoffset 900ms ease";
  pathElement.style.strokeDashoffset = "0";
}

function renderTrendLabels() {
  if (!trendLabelRow) {
    return;
  }

  trendLabelRow.innerHTML = "";

  analyticsState.trendLabels.forEach((label) => {
    const labelItem = document.createElement("span");
    labelItem.textContent = label;
    trendLabelRow.appendChild(labelItem);
  });
}

function renderTrendChart() {
  if (!trendLinePath || !trendAreaPath || !trendPointsGroup) {
    return;
  }

  const points = getTrendPoints(analyticsState.trendValues);
  trendAreaPath.setAttribute("d", buildAreaPath(points));
  trendLinePath.setAttribute("d", buildLinePath(points));
  animateTrendLine(trendLinePath);

  trendPointsGroup.innerHTML = "";

  points.forEach((point, index) => {
    const pointElement = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pointElement.setAttribute("class", "trend-point");
    pointElement.setAttribute("cx", point.x.toFixed(1));
    pointElement.setAttribute("cy", point.y.toFixed(1));
    pointElement.setAttribute("r", "6");
    pointElement.style.animationDelay = `${index * 0.12}s`;
    trendPointsGroup.appendChild(pointElement);
  });

  renderTrendLabels();

  if (dashboardTrendChange) {
    const latestValue = analyticsState.trendValues[analyticsState.trendValues.length - 1];
    const previousValue = analyticsState.trendValues[analyticsState.trendValues.length - 2] || latestValue;
    const percentChange = previousValue === 0 ? latestValue : Math.round(((latestValue - previousValue) / previousValue) * 100);
    const prefix = percentChange >= 0 ? "+" : "";

    dashboardTrendChange.textContent = `${prefix}${percentChange}%`;
    dashboardTrendChange.classList.remove("trend-up", "trend-down");
    dashboardTrendChange.classList.add(percentChange >= 0 ? "trend-up" : "trend-down");
  }
}

function renderRecentReports() {
  if (!recentReportsList) {
    return;
  }

  recentReportsList.innerHTML = "";

  analyticsState.recentReports.forEach((report) => {
    const item = document.createElement("li");
    item.className = `recent-report-item severity-${report.severity}`;

    const main = document.createElement("div");
    main.className = "report-main";

    const type = document.createElement("span");
    type.className = "report-type";
    type.textContent = report.type;

    const title = document.createElement("h4");
    title.className = "report-title";
    title.textContent = report.title;

    const summary = document.createElement("p");
    summary.className = "report-summary";
    summary.textContent = report.summary;

    main.appendChild(type);
    main.appendChild(title);
    main.appendChild(summary);

    const meta = document.createElement("div");
    meta.className = "report-meta";

    const verdict = document.createElement("span");
    verdict.className = "report-verdict";
    verdict.textContent = report.verdict;

    const time = document.createElement("p");
    time.className = "report-time";
    time.textContent = getRelativeTimeLabel(report.createdAt);

    meta.appendChild(verdict);
    meta.appendChild(time);

    item.appendChild(main);
    item.appendChild(meta);
    recentReportsList.appendChild(item);
  });

  if (dashboardRecentCount) {
    const countLabel = analyticsState.recentReports.length === 1 ? "report" : "reports";
    dashboardRecentCount.textContent = `${analyticsState.recentReports.length} ${countLabel}`;
  }
}

function renderDashboard() {
  animateDashboardCount(dashboardTotalScans, analyticsState.totals.scansToday);
  animateDashboardCount(dashboardScamsBlocked, analyticsState.totals.scamsBlocked);
  animateDashboardCount(dashboardDeepfakesDetected, analyticsState.totals.deepfakesDetected);
  renderTrendChart();
  renderRecentReports();
}

function getUrlDisplayTitle(urlValue) {
  try {
    return new URL(normalizeUrlValue(urlValue)).hostname;
  } catch (error) {
    return "Malformed link";
  }
}

function getUrlSeverityLevel(result) {
  if (result.status === "Unsafe") {
    return "high";
  }

  if (result.trustScore < 70) {
    return "medium";
  }

  return "low";
}

function recordAnalyticsEvent(eventDetails) {
  analyticsState.totals.scansToday += 1;

  if (eventDetails.type === "image" && eventDetails.severity !== "low") {
    analyticsState.totals.deepfakesDetected += 1;
  }

  if ((eventDetails.type === "text" || eventDetails.type === "url") && eventDetails.severity !== "low") {
    analyticsState.totals.scamsBlocked += 1;
  }

  const previousTrendValue = analyticsState.trendValues[analyticsState.trendValues.length - 1] || 30;
  const nextTrendValue = clampNumber(
    Math.round(previousTrendValue * 0.42 + eventDetails.signal * 0.58),
    8,
    99,
  );

  analyticsState.trendValues = [...analyticsState.trendValues.slice(1), nextTrendValue];

  analyticsState.reportCounter += 1;
  analyticsState.recentReports = [
    {
      id: `report-${analyticsState.reportCounter}`,
      type: eventDetails.reportType,
      title: eventDetails.title,
      verdict: eventDetails.verdict,
      severity: eventDetails.severity,
      summary: eventDetails.summary,
      createdAt: Date.now(),
    },
    ...analyticsState.recentReports,
  ].slice(0, 5);

  renderDashboard();
}

function openModal(tabName = "text") {
  if (!modal) {
    return;
  }

  appState.lastFocusedElement = document.activeElement;
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  setActiveTab(tabName);

  requestAnimationFrame(() => {
    focusFieldForTab(tabName);
  });
}

function closeModal() {
  if (!modal) {
    return;
  }

  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  hideLoading();
  hideStatus();

  if (appState.lastFocusedElement instanceof HTMLElement) {
    appState.lastFocusedElement.focus();
  }
}

// Keeps the existing hero animation responsive to pointer movement.
function setupHeroPointerEffect() {
  if (!visual || reducedMotionQuery.matches) {
    return;
  }

  let frameId = 0;

  const setPointer = (x, y) => {
    visual.style.setProperty("--pointer-x", x.toFixed(3));
    visual.style.setProperty("--pointer-y", y.toFixed(3));
  };

  const queueUpdate = (event) => {
    if (frameId) {
      cancelAnimationFrame(frameId);
    }

    frameId = requestAnimationFrame(() => {
      const bounds = visual.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
      setPointer(x, y);
      frameId = 0;
    });
  };

  visual.addEventListener("pointermove", queueUpdate);
  visual.addEventListener("pointerleave", () => {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }

    setPointer(0, 0);
  });
}

function isSupportedImageFile(file) {
  if (!file) {
    return false;
  }

  const normalizedName = file.name.toLowerCase();
  const hasSupportedMimeType = supportedImageTypes.includes(file.type);
  const hasSupportedExtension = supportedImageExtensions.some((extension) => normalizedName.endsWith(extension));
  return hasSupportedMimeType || hasSupportedExtension;
}

function loadFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read the image file."));
    reader.readAsDataURL(file);
  });
}

function setImageSource(source) {
  appState.currentImageSource = source;

  if (!imagePreview || !imagePreviewImage || !imagePreviewMeta) {
    return;
  }

  imagePreview.hidden = false;
  imagePreviewImage.src = source.dataUrl;
  imagePreviewMeta.innerHTML = "";
  imagePreviewMeta.appendChild(createPreviewStat("File Name", source.name));
  imagePreviewMeta.appendChild(
    createPreviewStat("Format", (source.type || "Unknown").replace("image/", "").toUpperCase()),
  );
  imagePreviewMeta.appendChild(createPreviewStat("File Size", formatFileSize(source.size)));
}

function getColorDifference(data, indexA, indexB) {
  const redDifference = Math.abs(data[indexA] - data[indexB]);
  const greenDifference = Math.abs(data[indexA + 1] - data[indexB + 1]);
  const blueDifference = Math.abs(data[indexA + 2] - data[indexB + 2]);

  return (redDifference + greenDifference + blueDifference) / 3;
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

function normalizeTextResult(result) {
  return {
    scamProbability: clampNumber(Number(result?.scamProbability) || 0, 0, 100),
    riskLevel: ["Low", "Medium", "High"].includes(result?.riskLevel) ? result.riskLevel : "Low",
    redFlags: Array.isArray(result?.redFlags) && result.redFlags.length > 0 ? result.redFlags : ["No obvious red flag words found"],
    safetyAdvice: result?.safetyAdvice || "Verify the sender independently before taking action.",
  };
}

function normalizeImageResult(result) {
  return {
    fakeConfidence: clampNumber(Number(result?.fakeConfidence) || 0, 0, 100),
    riskLevel: ["Low", "Medium", "High"].includes(result?.riskLevel) ? result.riskLevel : "Low",
    explanations: Array.isArray(result?.explanations) && result.explanations.length > 0
      ? result.explanations
      : ["No strong manipulation signals were detected in this scan."],
    recommendation: result?.recommendation || "Verify the source before relying on the image.",
  };
}

function normalizeUrlResult(result) {
  return {
    status: result?.status === "Unsafe" ? "Unsafe" : "Safe",
    trustScore: clampNumber(Number(result?.trustScore) || 0, 0, 100),
    threatReasons: Array.isArray(result?.threatReasons) && result.threatReasons.length > 0
      ? result.threatReasons
      : ["No strong phishing patterns were detected in this scan."],
    previewWarning: result?.previewWarning || "Confirm the exact domain before opening the link.",
  };
}

function renderTextResult(result) {
  const normalizedResult = normalizeTextResult(result);

  textScamProbability.textContent = `${normalizedResult.scamProbability}%`;
  textRiskLevel.textContent = normalizedResult.riskLevel;
  textRiskBadge.textContent = normalizedResult.riskLevel;
  textSafetyAdvice.textContent = normalizedResult.safetyAdvice;
  renderChipList(textRedFlags, normalizedResult.redFlags);
  setBadgeClass(textRiskBadge, `risk-${normalizedResult.riskLevel.toLowerCase()}`);
  revealResultCard(textResultCard);
}

function renderImageResult(result) {
  const normalizedResult = normalizeImageResult(result);

  imageFakeConfidence.textContent = `${normalizedResult.fakeConfidence}%`;
  imageRiskLevel.textContent = normalizedResult.riskLevel;
  imageRiskBadge.textContent = normalizedResult.riskLevel;
  imageSafetyRecommendation.textContent = normalizedResult.recommendation;
  renderList(imageExplanationList, normalizedResult.explanations);
  setBadgeClass(imageRiskBadge, `risk-${normalizedResult.riskLevel.toLowerCase()}`);
  revealResultCard(imageResultCard);
}

function renderUrlResult(result) {
  const normalizedResult = normalizeUrlResult(result);

  urlSafetyStatus.textContent = normalizedResult.status;
  urlTrustScore.textContent = `${normalizedResult.trustScore}%`;
  urlStatusBadge.textContent = normalizedResult.status;
  urlPreviewWarning.textContent = normalizedResult.previewWarning;
  renderList(urlThreatReasons, normalizedResult.threatReasons);
  setBadgeClass(urlStatusBadge, normalizedResult.status === "Safe" ? "status-safe" : "status-unsafe");
  revealResultCard(urlResultCard);
}

function resetTextModule() {
  if (textForm) {
    textForm.reset();
  }

  renderChipList(textRedFlags, []);
  hideResultCard(textResultCard);
}

function resetImageModule(clearFileInput = true) {
  appState.currentImageSource = null;

  if (clearFileInput && imageInput) {
    imageInput.value = "";
  }

  if (imagePreview) {
    imagePreview.hidden = true;
  }

  if (imagePreviewImage) {
    imagePreviewImage.removeAttribute("src");
  }

  if (imagePreviewMeta) {
    imagePreviewMeta.innerHTML = "";
  }

  renderList(imageExplanationList, []);
  hideResultCard(imageResultCard);
}

function resetUrlModule() {
  if (urlForm) {
    urlForm.reset();
  }

  renderList(urlThreatReasons, []);
  hideResultCard(urlResultCard);
}

// Demo fallback keeps the frontend presentation-ready when the backend is offline.
function fallbackDemoTextAnalysis(message) {
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

  const scamProbability = clampNumber(Math.round(riskScore), 3, 99);
  const riskLevel = getRiskLevel(scamProbability);

  let safetyAdvice = "Stay cautious, verify the sender independently, and avoid clicking unknown links.";

  if (riskLevel === "Medium") {
    safetyAdvice = "Do not share OTPs, banking details, or passwords. Double-check the sender through an official contact channel before responding.";
  }

  if (riskLevel === "High") {
    safetyAdvice = "Avoid replying, do not share personal or banking information, and report or block the sender. Contact the brand or person through an official channel if needed.";
  }

  if (redFlags.length === 0) {
    redFlags.push("No obvious scam keywords detected");
  }

  return {
    scamProbability,
    riskLevel,
    redFlags,
    safetyAdvice,
  };
}

async function fallbackDemoImageAnalysis(source) {
  const imageSource = source.dataUrl
    ? source
    : {
        name: source.file?.name || "uploaded-image",
        size: source.file?.size || 0,
        type: source.file?.type || "image/jpeg",
        file: source.file || null,
        dataUrl: await loadFileAsDataUrl(source.file),
      };

  const metrics = await getImageMetrics(imageSource.dataUrl);
  const fileName = imageSource.name.toLowerCase();
  const explanations = [];
  let confidenceScore = 18;

  const suspiciousNameTerms = ["ai", "deepfake", "synthetic", "generated", "face-swap", "swap", "edit", "clone", "render"];
  const profileTerms = ["profile", "avatar", "selfie", "dp", "portrait"];
  const matchedNameTerms = suspiciousNameTerms.filter((term) => fileName.includes(term));
  const matchedProfileTerms = profileTerms.filter((term) => fileName.includes(term));

  if (matchedNameTerms.length > 0) {
    confidenceScore += matchedNameTerms.length * 8;
    explanations.push(`Possible edited-media naming pattern found: ${matchedNameTerms.join(", ")}.`);
  }

  if (matchedProfileTerms.length > 0) {
    confidenceScore += matchedProfileTerms.length * 5;
    explanations.push(`Profile-style image naming detected: ${matchedProfileTerms.join(", ")}.`);
  }

  if (imageSource.type === "image/svg+xml") {
    confidenceScore += 12;
    explanations.push("Vector-style image format detected, which is unusual for a direct camera photo.");
  }

  if (metrics.width < 700 || metrics.height < 700) {
    confidenceScore += 10;
    explanations.push("Low image dimensions can hide editing traces and reduce forensic confidence.");
  }

  const aspectRatio = metrics.width / Math.max(metrics.height, 1);

  if (aspectRatio > 0.9 && aspectRatio < 1.1) {
    confidenceScore += 6;
    explanations.push("Near-square framing matches a common pattern seen in generated avatars and profile images.");
  }

  if (metrics.averageNeighborDifference < 22) {
    confidenceScore += 12;
    explanations.push("Possible AI-generated facial texture or over-smoothed detail detected.");
  }

  if (metrics.averageNeighborDifference > 68) {
    confidenceScore += 8;
    explanations.push("Sharp local contrast suggests aggressive editing, filtering, or compression artifacts.");
  }

  if (metrics.averageSymmetryDifference < 18) {
    confidenceScore += 10;
    explanations.push("Unusually balanced left-right symmetry can appear in synthetic portraits.");
  }

  if (metrics.averageColorSpread < 28) {
    confidenceScore += 8;
    explanations.push("Color spread is limited, which may point to over-smoothed or generated surfaces.");
  }

  if (metrics.transparencyRatio > 0.01) {
    confidenceScore += 12;
    explanations.push("Transparent or cutout-like areas suggest possible edited or layered image content.");
  }

  if (metrics.harshEdgeRatio > 0.14) {
    confidenceScore += 10;
    explanations.push("Unnatural background pattern or pasted boundaries may be present around high-contrast edges.");
  }

  if (aspectRatio > 0.9 && aspectRatio < 1.1 && metrics.averageSymmetryDifference < 18 && metrics.averageNeighborDifference < 22) {
    confidenceScore += 10;
    explanations.push("Avatar framing plus smooth facial symmetry is a common fake profile image clue.");
  }

  const bytesPerPixel = imageSource.size / Math.max(metrics.width * metrics.height, 1);

  if (bytesPerPixel < 0.06 && metrics.width * metrics.height > 500000) {
    confidenceScore += 10;
    explanations.push("The file is very light for its resolution, which can indicate synthetic export or heavy compression.");
  }

  if (metrics.brightPixelRatio > 0.18) {
    confidenceScore += 6;
    explanations.push("Heavy highlight regions may point to stylized rendering or over-processed lighting.");
  }

  if (explanations.length === 0) {
    explanations.push("No strong manipulation or synthetic-pattern clues were detected in this browser-side scan.");
    explanations.push("Visual noise, symmetry, and compression look closer to a natural image than to a heavily edited asset.");
    confidenceScore = 22;
  }

  const fakeConfidence = clampNumber(Math.round(confidenceScore), 5, 98);
  const riskLevel = getRiskLevel(fakeConfidence);

  let recommendation = "Verify the source before trusting this image.";

  if (riskLevel === "Medium") {
    recommendation = "Ask for the original source, compare it with trusted references, and avoid using the image as proof until verified.";
  }

  if (riskLevel === "High") {
    recommendation = "Do not rely on this image alone. Cross-check it with trusted sources and request original capture details before acting on it.";
  }

  return {
    fakeConfidence,
    riskLevel,
    explanations,
    recommendation,
  };
}

function fallbackDemoUrlAnalysis(urlValue) {
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
    return {
      status: "Unsafe",
      trustScore: 5,
      threatReasons: ["The link format is invalid, which is a strong reason not to trust it."],
      previewWarning: "Do not open this link unless verified.",
    };
  }

  const host = parsedUrl.hostname.toLowerCase();
  const baseDomain = getBaseDomain(host);
  const fullUrl = parsedUrl.href.toLowerCase();
  const pathAndQuery = `${parsedUrl.pathname}${parsedUrl.search}`.toLowerCase();
  const threatReasons = [];
  let riskScore = 6;

  if (parsedUrl.protocol !== "https:") {
    riskScore += 24;
    threatReasons.push("HTTPS is missing from this link.");
  }

  if (parsedUrl.username || parsedUrl.password) {
    riskScore += 24;
    threatReasons.push("Embedded username or password fields are often used to hide the real destination.");
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    riskScore += 28;
    threatReasons.push("The link uses a raw IP address instead of a standard domain.");
  }

  if (host.includes("xn--")) {
    riskScore += 24;
    threatReasons.push("Punycode is present, which can be used for lookalike phishing domains.");
  }

  if (host.split(".").length > 3) {
    riskScore += 10;
    threatReasons.push("Multiple subdomains can hide the real registered domain.");
  }

  if (host.includes("-")) {
    riskScore += 8;
    threatReasons.push("Hyphen-heavy domains can be used to imitate trusted brands.");
  }

  if (localBlacklistHosts.includes(host) || localBlacklistHosts.includes(baseDomain)) {
    riskScore += 35;
    threatReasons.push("Suspicious domain pattern matches a locally blocked example.");
  }

  if (fullUrl.length > 90) {
    riskScore += 10;
    threatReasons.push("Very long URLs can bury suspicious path segments.");
  }

  const matchedTerms = suspiciousTerms.filter((term) => host.includes(term) || pathAndQuery.includes(term));

  if (matchedTerms.length > 0) {
    riskScore += matchedTerms.length * 7;
    threatReasons.push(`Suspicious keywords detected: ${matchedTerms.join(", ")}.`);
  }

  if (suspiciousTlds.some((tld) => host.endsWith(tld))) {
    riskScore += 12;
    threatReasons.push("The top-level domain is frequently seen in throwaway or phishing links.");
  }

  if (shortenedDomains.includes(host)) {
    riskScore += 18;
    threatReasons.push("This is a shortened link, so the final destination is hidden.");
  }

  const impersonatedBrand = wellKnownBrands.find((brand) => host.includes(brand) && !matchesTrustedDomain(host, trustedDomains));

  if (impersonatedBrand) {
    riskScore += 18;
    threatReasons.push(`The domain appears to imitate a known brand: ${impersonatedBrand}.`);
  }

  if (/\d{4,}/.test(host)) {
    riskScore += 6;
    threatReasons.push("Long numeric patterns in the host can signal a low-trust domain.");
  }

  const looksNewOrDisposable =
    suspiciousTlds.some((tld) => host.endsWith(tld)) ||
    /(?:19|20)\d{2}/.test(host) ||
    baseDomain.length > 18 ||
    (host.includes("-") && /\d/.test(host));

  if (looksNewOrDisposable) {
    riskScore += 10;
    threatReasons.push("The domain pattern looks new or disposable, which is a phishing warning signal.");
  }

  if (matchesTrustedDomain(host, trustedDomains) && threatReasons.length === 0) {
    riskScore -= 18;
    threatReasons.push("The domain pattern matches a well-known mainstream service.");
  }

  const clampedRiskScore = clampNumber(Math.round(riskScore), 1, 99);
  const trustScore = clampNumber(100 - clampedRiskScore, 1, 99);
  const status = clampedRiskScore >= 40 ? "Unsafe" : "Safe";

  let previewWarning = "Check the exact domain carefully before opening this link.";

  if (status === "Unsafe") {
    previewWarning = "Do not open this link unless verified.";
  }

  if (parsedUrl.protocol === "https:" && status === "Safe") {
    previewWarning = "HTTPS is present, but still confirm the domain spelling before opening the page.";
  }

  if (threatReasons.length === 0) {
    threatReasons.push("No strong phishing structure was detected in this browser-side scan.");
  }

  return {
    status,
    trustScore,
    threatReasons,
    previewWarning,
  };
}

// These verify functions try the backend first and fall back to browser-side demo logic.
async function verifyText(text) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/verify/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`Text verification failed with status ${response.status}`);
    }

    return normalizeTextResult(await response.json());
  } catch (error) {
    showError("Backend API is unavailable, so TruthLens used the built-in demo model for this text scan.");
    return fallbackDemoTextAnalysis(text);
  }
}

async function verifyImage(source) {
  if (!source?.file) {
    return fallbackDemoImageAnalysis(source);
  }

  try {
    const formData = new FormData();
    formData.append("image", source.file);

    const response = await fetch(`${API_BASE_URL}/api/verify/image`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Image verification failed with status ${response.status}`);
    }

    return normalizeImageResult(await response.json());
  } catch (error) {
    showError("Backend API is unavailable, so TruthLens used the built-in demo model for this image scan.");
    return fallbackDemoImageAnalysis(source);
  }
}

async function verifyUrl(url) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/verify/url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`URL verification failed with status ${response.status}`);
    }

    return normalizeUrlResult(await response.json());
  } catch (error) {
    showError("Backend API is unavailable, so TruthLens used the built-in demo model for this URL scan.");
    return fallbackDemoUrlAnalysis(url);
  }
}

function createDemoImageSource() {
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

async function loadDemoData() {
  resetTextModule();
  resetUrlModule();
  resetImageModule();
  hideStatus();

  textInput.value = "URGENT! Your bank account will be suspended today. Verify now and share the OTP code 482991 to avoid account block. Click here for your reward refund.";
  urlInput.value = "http://secure-bank-verify-login-update.xyz/account/reward?confirm=otp";

  const demoImageSource = createDemoImageSource();
  setImageSource(demoImageSource);

  showLoading("AI Scan in Progress... Running the built-in TruthLens demo checks across text, image, and URL modules.");

  try {
    const [textResult, imageResult, urlResult] = await Promise.all([
      Promise.resolve(fallbackDemoTextAnalysis(textInput.value)),
      fallbackDemoImageAnalysis(demoImageSource),
      Promise.resolve(fallbackDemoUrlAnalysis(urlInput.value)),
    ]);

    renderTextResult(textResult);
    renderImageResult(imageResult);
    renderUrlResult(urlResult);

    recordAnalyticsEvent({
      type: "text",
      reportType: "Text Scan",
      title: "Live demo text scan",
      verdict: `${textResult.riskLevel} Risk`,
      severity: textResult.riskLevel.toLowerCase(),
      signal: textResult.scamProbability,
      summary: `Red flags found: ${textResult.redFlags.slice(0, 3).join(", ")}.`,
    });

    recordAnalyticsEvent({
      type: "image",
      reportType: "Image Scan",
      title: demoImageSource.name,
      verdict: `${imageResult.riskLevel} Risk`,
      severity: imageResult.riskLevel.toLowerCase(),
      signal: imageResult.fakeConfidence,
      summary: imageResult.explanations[0],
    });

    recordAnalyticsEvent({
      type: "url",
      reportType: "URL Shield",
      title: getUrlDisplayTitle(urlInput.value),
      verdict: urlResult.status,
      severity: getUrlSeverityLevel(urlResult),
      signal: 100 - urlResult.trustScore,
      summary: urlResult.threatReasons[0],
    });

    showStatus("Live demo loaded. TruthLens filled each module with sample data and demo scan results.", "success");
  } catch (error) {
    showError("Live demo text and URL loaded, but the demo image could not be analyzed in this browser.");
  } finally {
    hideLoading();
  }
}

// Wire the UI once all helpers are ready.
function setupEventListeners() {
  if (verifyNowButton) {
    verifyNowButton.addEventListener("click", () => {
      hideStatus();
      openModal("text");
    });
  }

  if (liveDemoButton) {
    liveDemoButton.addEventListener("click", async () => {
      openModal("text");
      await loadDemoData();
    });
  }

  if (closeVerificationModal) {
    closeVerificationModal.addEventListener("click", closeModal);
  }

  if (backdrop) {
    backdrop.addEventListener("click", closeModal);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.hidden) {
      closeModal();
    }
  });

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tabTarget);
    });
  });

  if (textForm) {
    textForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const message = textInput.value.trim();

      if (!message) {
        showError("Paste an SMS, WhatsApp message, email, or chat message before running text verification.");
        return;
      }

      hideResultCard(textResultCard);
      showLoading("AI Scan in Progress... Reviewing language patterns, red flags, and social-engineering cues.");

      try {
        const result = await verifyText(message);
        renderTextResult(result);
        recordAnalyticsEvent({
          type: "text",
          reportType: "Text Scan",
          title: message.slice(0, 42) || "Suspicious message",
          verdict: `${result.riskLevel} Risk`,
          severity: result.riskLevel.toLowerCase(),
          signal: result.scamProbability,
          summary: `Red flags found: ${result.redFlags.slice(0, 3).join(", ")}.`,
        });

        if (verificationStatus.hidden) {
          showStatus("Text verification completed.", "success");
        }
      } finally {
        hideLoading();
      }
    });
  }

  if (imageInput) {
    imageInput.addEventListener("change", async () => {
      const file = imageInput.files?.[0];

      if (!file) {
        resetImageModule(false);
        return;
      }

      if (!isSupportedImageFile(file)) {
        resetImageModule();
        showError("Upload a JPG, JPEG, PNG, or WEBP image for verification.");
        return;
      }

      try {
        const dataUrl = await loadFileAsDataUrl(file);
        setImageSource({
          name: file.name,
          size: file.size,
          type: file.type,
          file,
          dataUrl,
        });
        showStatus("Image ready for verification.", "success");
      } catch (error) {
        resetImageModule();
        showError("The selected image could not be read. Try another JPG, PNG, or WEBP file.");
      }
    });
  }

  if (imageForm) {
    imageForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!appState.currentImageSource) {
        showError("Upload an image first, or use Live Demo to test the image verification flow.");
        return;
      }

      hideResultCard(imageResultCard);
      showLoading("AI Scan in Progress... Inspecting visual artifacts, texture consistency, and manipulation signals.");

      try {
        const result = await verifyImage(appState.currentImageSource);
        renderImageResult(result);
        recordAnalyticsEvent({
          type: "image",
          reportType: "Image Scan",
          title: appState.currentImageSource.name,
          verdict: `${result.riskLevel} Risk`,
          severity: result.riskLevel.toLowerCase(),
          signal: result.fakeConfidence,
          summary: result.explanations[0],
        });

        if (verificationStatus.hidden) {
          showStatus("Image verification completed.", "success");
        }
      } catch (error) {
        showError("The image could not be analyzed. Try a different file or check the backend connection.");
      } finally {
        hideLoading();
      }
    });
  }

  if (urlForm) {
    urlForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const rawUrl = urlInput.value.trim();

      if (!rawUrl) {
        showError("Paste a suspicious link before running URL verification.");
        return;
      }

      hideResultCard(urlResultCard);
      showLoading("AI Scan in Progress... Checking domain trust, HTTPS availability, phishing terms, and redirect patterns.");

      try {
        const result = await verifyUrl(rawUrl);
        renderUrlResult(result);
        recordAnalyticsEvent({
          type: "url",
          reportType: "URL Shield",
          title: getUrlDisplayTitle(rawUrl),
          verdict: result.status,
          severity: getUrlSeverityLevel(result),
          signal: 100 - result.trustScore,
          summary: result.threatReasons[0],
        });

        if (verificationStatus.hidden) {
          showStatus("URL verification completed.", "success");
        }
      } finally {
        hideLoading();
      }
    });
  }

  clearButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.clearTarget;

      if (target === "text") {
        resetTextModule();
      }

      if (target === "image") {
        resetImageModule();
      }

      if (target === "url") {
        resetUrlModule();
      }

      hideStatus();
    });
  });
}

setupHeroPointerEffect();
setupEventListeners();
renderDashboard();

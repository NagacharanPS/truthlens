const DASHBOARD_STORAGE_KEY = "truthlens.dashboard.analysis";
const DASHBOARD_HISTORY_KEY = "truthlens.dashboard.history";
const HISTORY_LIMIT = 8;

function cloneSourceForStorage(type, source) {
  if (type === "image") {
    if (!source) {
      return null;
    }

    return {
      name: source.name || "uploaded-image",
      size: source.size || 0,
      type: source.type || "image/jpeg",
      dataUrl: source.dataUrl || "",
    };
  }

  return source || "";
}

function parseStoredValue(storage, key) {
  const rawValue = storage.getItem(key);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    return null;
  }
}

function writeStoredValue(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

export function createDashboardPayload({ type, result, source, mode, notice }) {
  return {
    id: `${type}-${Date.now()}`,
    type,
    result,
    source: cloneSourceForStorage(type, source),
    mode: mode || "demo",
    notice: notice || "",
    createdAt: new Date().toISOString(),
  };
}

export function saveDashboardPayload(payload) {
  if (typeof window === "undefined" || !payload) {
    return;
  }

  writeStoredValue(window.sessionStorage, DASHBOARD_STORAGE_KEY, payload);
  upsertDashboardHistory(payload);
}

export function readDashboardPayload() {
  if (typeof window === "undefined") {
    return null;
  }

  return parseStoredValue(window.sessionStorage, DASHBOARD_STORAGE_KEY);
}

export function readDashboardHistory() {
  if (typeof window === "undefined") {
    return [];
  }

  const history = parseStoredValue(window.localStorage, DASHBOARD_HISTORY_KEY);
  return Array.isArray(history) ? history : [];
}

export function upsertDashboardHistory(payload) {
  if (typeof window === "undefined" || !payload) {
    return [];
  }

  const nextHistory = [
    payload,
    ...readDashboardHistory().filter((entry) => entry?.id && entry.id !== payload.id),
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, HISTORY_LIMIT);

  writeStoredValue(window.localStorage, DASHBOARD_HISTORY_KEY, nextHistory);
  return nextHistory;
}

export function clearDashboardHistory() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(DASHBOARD_HISTORY_KEY);
}

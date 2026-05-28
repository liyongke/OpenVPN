async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

const CONTROL_TOKEN_STORAGE_KEY = "portal.controlToken";
const CONTROL_TOKEN_EVENT = "portal-control-token-changed";

export function getStoredControlToken() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(CONTROL_TOKEN_STORAGE_KEY) || "";
}

export function setStoredControlToken(token) {
  if (typeof window === "undefined") {
    return;
  }
  const value = String(token || "").trim();
  if (value) {
    window.localStorage.setItem(CONTROL_TOKEN_STORAGE_KEY, value);
  } else {
    window.localStorage.removeItem(CONTROL_TOKEN_STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(CONTROL_TOKEN_EVENT, { detail: value }));
}

export function getStoredControlTokenEventName() {
  return CONTROL_TOKEN_EVENT;
}

async function postJson(path, body, token = "") {
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.detail) {
        detail = String(payload.detail);
      }
    } catch {
      // Keep default error message when response is not JSON.
    }
    throw new Error(detail);
  }

  return response.json();
}

export function getLiveSummary() {
  return fetchJson("/api/live/summary");
}

export function getHistory7d() {
  return fetchJson("/api/history/7d");
}

export function getPortalStatus() {
  return fetchJson("/api/portal/status");
}

export function getBackendMonitoring() {
  return fetchJson("/api/monitoring/backend");
}

export function getMapSessions() {
  return fetchJson("/api/map/sessions");
}

export function getControlLatency(windowSeconds = 300) {
  const params = new URLSearchParams();
  params.set("window_seconds", String(windowSeconds));
  return fetchJson(`/api/control/latency?${params.toString()}`);
}

export async function getControlFeatures(token = "") {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch("/api/control/features", { cache: "no-store", headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

export function runControlAction(action, token = "", payload = {}) {
  return postJson("/api/control/actions", { action, ...payload }, token);
}

export function loginControl(username, password) {
  return postJson("/api/control/auth/login", { username, password });
}

export function logoutControl(token = "") {
  return postJson("/api/control/auth/logout", {}, token);
}

export function getStatusFile(file = "", lines = 400) {
  const params = new URLSearchParams();
  if (file) {
    params.set("file", file);
  }
  params.set("lines", String(lines));
  return fetchJson(`/api/status-file?${params.toString()}`);
}

export function subscribeLiveSessions(onSnapshot, onError) {
  const source = new EventSource("/api/live/sessions");

  source.addEventListener("snapshot", (event) => {
    try {
      const envelope = JSON.parse(event.data);
      if (envelope?.payload) {
        onSnapshot(envelope.payload);
      }
    } catch (error) {
      if (onError) {
        onError(error);
      }
    }
  });

  source.onerror = (error) => {
    if (onError) {
      onError(error);
    }
  };

  return () => {
    source.close();
  };
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
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

export function getControlFeatures() {
  return fetchJson("/api/control/features");
}

export function runControlAction(action, token = "") {
  return postJson("/api/control/actions", { action }, token);
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

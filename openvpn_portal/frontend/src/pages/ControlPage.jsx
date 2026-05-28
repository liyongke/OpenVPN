import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";
import {
  getBackendMonitoring,
  getControlFeatures,
  getStoredControlToken,
  getMapSessions,
  loginControl,
  logoutControl,
  runControlAction,
  setStoredControlToken,
} from "../api/client";
import "leaflet/dist/leaflet.css";

const DEFAULT_FEATURES = {
  enabled: false,
  control_available: false,
  auth_required: true,
  auth_mode: "secret_session",
  config_error: "",
  allowed_actions: [],
};

const DEFAULT_MONITORING = {
  backend_online: false,
  refresh_attempts: 0,
  refresh_failures: 0,
  refresh_error_rate: 0,
  last_refresh_age_seconds: 0,
  last_successful_refresh_age_seconds: 0,
  last_refresh_error: "",
  sse_subscribers: 0,
  live_poll_seconds: 1,
};

const DEFAULT_MAP = {
  generated_at: "",
  updated_at: "",
  session_total: 0,
  mappable_total: 0,
  mappable_trusted_total: 0,
  country_breakdown: [],
  provider_breakdown: [],
  sessions: [],
};

export function ControlPage() {
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [controlToken, setControlToken] = useState(() => getStoredControlToken());
  const [authOpen, setAuthOpen] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [result, setResult] = useState("");
  const [monitoring, setMonitoring] = useState(DEFAULT_MONITORING);
  const [monitoringError, setMonitoringError] = useState("");
  const [mapData, setMapData] = useState(DEFAULT_MAP);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    let mounted = true;

    const refreshFeatures = async () => {
      try {
        const payload = await getControlFeatures(controlToken.trim());
        if (mounted) {
          setFeatures(payload);
        }
      } catch (error) {
        if (mounted) {
          setResult(`Failed to load control features: ${error.message}`);
        }
      }
    };

    refreshFeatures();

    return () => {
      mounted = false;
    };
  }, [controlToken]);

  useEffect(() => {
    let mounted = true;

    const refreshMap = async () => {
      try {
        const payload = await getMapSessions();
        if (!mounted) {
          return;
        }
        setMapData(payload);
        setMapError("");
      } catch (error) {
        if (!mounted) {
          return;
        }
        setMapError(`Map data fetch failed: ${error.message}`);
      }
    };

    refreshMap();
    const interval = window.setInterval(refreshMap, 45000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const markerGroups = useMemo(() => {
    const groups = new Map();
    for (const session of mapData.sessions || []) {
      if (!session.map_eligible) {
        continue;
      }

      const geo = session.geo || {};
      const lat = Number(geo.latitude);
      const lon = Number(geo.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }

      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          lat,
          lon,
          trustedCount: 0,
          suspectCount: 0,
          sessions: [],
          country: geo.country || "unknown",
          city: geo.city || "",
          provider: geo.isp || "",
        });
      }

      const item = groups.get(key);
      item.sessions.push(session);
      if (session.audit_class === "trusted") {
        item.trustedCount += 1;
      } else {
        item.suspectCount += 1;
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.sessions.length - a.sessions.length);
  }, [mapData.sessions]);

  const mapCenter = useMemo(() => {
    if (!markerGroups.length) {
      return [20, 0];
    }
    const lat = markerGroups.reduce((sum, item) => sum + item.lat, 0) / markerGroups.length;
    const lon = markerGroups.reduce((sum, item) => sum + item.lon, 0) / markerGroups.length;
    return [lat, lon];
  }, [markerGroups]);

  useEffect(() => {
    let mounted = true;

    const refreshMonitoring = async () => {
      try {
        const payload = await getBackendMonitoring();
        if (!mounted) {
          return;
        }
        setMonitoring(payload);
        setMonitoringError("");
      } catch (error) {
        if (!mounted) {
          return;
        }
        setMonitoringError(`Monitoring fetch failed: ${error.message}`);
      }
    };

    refreshMonitoring();
    const interval = window.setInterval(refreshMonitoring, 15000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const allowedActions = useMemo(() => new Set(features.allowed_actions || []), [features.allowed_actions]);

  const execute = async (action) => {
    setLoadingAction(action);
    setResult("");
    try {
      const payload = await runControlAction(action, controlToken.trim());
      setResult(`${payload.message} (${payload.action})`);
    } catch (error) {
      setResult(`Action failed: ${error.message}`);
    } finally {
      setLoadingAction("");
    }
  };

  const login = async () => {
    if (features.auth_mode !== "secret_session") {
      setAuthMessage(
        features.config_error ||
          "Control auth is not configured. Set PORTAL_CONTROL_AUTH_SECRET_ID and configure secret credentials.",
      );
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const payload = await loginControl(authUsername.trim(), authPassword);
      const issuedToken = String(payload?.control_token || "").trim();
      if (!issuedToken) {
        throw new Error("Control login returned empty session token");
      }
      setControlToken(issuedToken);
      setStoredControlToken(issuedToken);
      setAuthOpen(false);
      setAuthPassword("");
      setAuthMessage("Control pane unlocked");
    } catch (error) {
      setAuthMessage(`Login failed: ${error.message}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await logoutControl(controlToken.trim());
    } catch {
      // Ignore logout errors and clear local session anyway.
    } finally {
      setControlToken("");
      setStoredControlToken("");
      setAuthBusy(false);
      setAuthMessage("Control pane locked");
    }
  };

  const canUseSessionAuth = features.auth_mode === "secret_session";
  const isUnlocked = Boolean(features.enabled);
  const operationsState = !features.control_available ? "unconfigured" : features.enabled ? "enabled" : "locked";
  const canSubmitAuth = canUseSessionAuth && !authBusy && authUsername.trim() && authPassword;

  return (
    <section className="panel control-placeholder">
      <div className="control-header">
        <div>
          <div className="brand-title">
            <svg className="brand-icon page-brand-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M13.9 2.6a1 1 0 0 0-1.8 0l-.5 1.2a7.8 7.8 0 0 0-1.7.7L8.7 3.8a1 1 0 0 0-1.3.2L5.9 5.5a1 1 0 0 0-.2 1.3l.7 1.2a7.8 7.8 0 0 0-.7 1.7l-1.2.5a1 1 0 0 0 0 1.8l1.2.5c.1.6.4 1.2.7 1.7l-.7 1.2a1 1 0 0 0 .2 1.3l1.5 1.5a1 1 0 0 0 1.3.2l1.2-.7c.6.3 1.1.5 1.7.7l.5 1.2a1 1 0 0 0 1.8 0l.5-1.2c.6-.1 1.2-.4 1.7-.7l1.2.7a1 1 0 0 0 1.3-.2l1.5-1.5a1 1 0 0 0 .2-1.3l-.7-1.2c.3-.6.5-1.1.7-1.7l1.2-.5a1 1 0 0 0 0-1.8l-1.2-.5a7.8 7.8 0 0 0-.7-1.7l.7-1.2a1 1 0 0 0-.2-1.3L16.6 4a1 1 0 0 0-1.3-.2l-1.2.7a7.8 7.8 0 0 0-1.7-.7l-.5-1.2zM13 8.5a2.5 2.5 0 1 1-2 4.6 2.5 2.5 0 0 1 2-4.6z" />
            </svg>
            <div>
              <h2>Operations Center</h2>
            </div>
          </div>
        </div>
        <div className="chip-row control-header-chips" aria-label="Operations status summary">
          <span className="chip">
            Operations API <strong>{operationsState}</strong>
          </span>
          <span className="chip">
            Auth <strong>{features.auth_required ? "required" : "optional"}</strong>
          </span>
          <span className="chip">
            Backend <strong>{monitoring.backend_online ? "online" : "offline"}</strong>
          </span>
        </div>
        <button
          type="button"
          className="control-auth-icon"
          onClick={() => setAuthOpen((prev) => !prev)}
          aria-label="Open control authentication"
          title="Authenticate control actions"
        >
          {isUnlocked ? "🔓" : "🔒"}
        </button>
      </div>

      <div className="control-grid">
        <article className="control-card">
          <div className="section-title-help">
            <h3>Backend Monitoring</h3>
            <span className="help-tip" title="Collector health, refresh cadence, and error rates.">?</span>
          </div>
          <div className="chip-row monitor-chip-row" aria-label="Backend collector monitoring">
            <span className="chip">
              Poll <strong>{monitoring.live_poll_seconds}s</strong>
            </span>
            <span className="chip">
              Attempts <strong>{monitoring.refresh_attempts}</strong>
            </span>
            <span className="chip">
              Failures <strong>{monitoring.refresh_failures}</strong>
            </span>
            <span className="chip">
              Error rate <strong>{Math.round((Number(monitoring.refresh_error_rate || 0) * 10000)) / 100}%</strong>
            </span>
            <span className="chip">
              Last ok <strong>{Math.round(Number(monitoring.last_successful_refresh_age_seconds || 0))}s ago</strong>
            </span>
            <span className="chip">
              SSE subs <strong>{monitoring.sse_subscribers || 0}</strong>
            </span>
          </div>
          {monitoring.last_refresh_error ? (
            <p className="control-result control-result-error">Last collector error: {monitoring.last_refresh_error}</p>
          ) : (
            <p className="hint">Healthy.</p>
          )}
          {monitoringError ? <p className="control-result control-result-error">{monitoringError}</p> : null}
        </article>

        <article className="control-card">
          <div className="section-title-help">
            <h3>Actions</h3>
            <span className="help-tip" title="Manual control operations. Login required.">?</span>
          </div>
          <div className="control-actions">
            <button
              type="button"
              className="control-button"
              disabled={!features.enabled || !allowedActions.has("refresh_snapshot") || loadingAction !== ""}
              onClick={() => execute("refresh_snapshot")}
            >
              {loadingAction === "refresh_snapshot" ? "Running..." : "Refresh Live Snapshot"}
            </button>
            <button
              type="button"
              className="control-button"
              disabled={!features.enabled || !allowedActions.has("sample_history") || loadingAction !== ""}
              onClick={() => execute("sample_history")}
            >
              {loadingAction === "sample_history" ? "Running..." : "Insert History Sample"}
            </button>
            <button
              type="button"
              className="control-button"
              disabled={!features.enabled || !allowedActions.has("terminate_head_session") || loadingAction !== ""}
              onClick={() => execute("terminate_head_session")}
            >
              {loadingAction === "terminate_head_session" ? "Running..." : "Force Terminate Head Session"}
            </button>
          </div>
          {!features.enabled ? (
            <p className="hint">
              {features.control_available
                ? "Locked."
                : "Control auth unavailable."}
            </p>
          ) : null}
          {result ? <p className="control-result">{result}</p> : null}
        </article>

        <article className="control-card control-access-card">
          <div className="section-title-help">
            <h3>Access & Session</h3>
            <span className="help-tip" title="Current auth mode and session token state.">?</span>
          </div>
          <div className="chip-row monitor-chip-row" aria-label="Control authentication state">
            <span className="chip">
              Mode <strong>{features.auth_mode || "secret_session"}</strong>
            </span>
            <span className="chip">
              Session <strong>{controlToken.trim() ? "present" : "empty"}</strong>
            </span>
          </div>
          <p className="hint">
            {features.control_available
              ? "Use lock to sign in."
              : "Control auth unavailable."}
          </p>
          <div className="control-token-panel" aria-label="Control token section">
            <div className="control-token-panel-head">
              <label className="control-label" htmlFor="control-token-input">
                Control Token
              </label>
              <button
                type="button"
                className="control-button control-token-clear"
                disabled={authBusy || !controlToken.trim()}
                onClick={logout}
              >
                Clear
              </button>
            </div>
            <input
              id="control-token-input"
              className="control-input"
              type="password"
              autoComplete="off"
              placeholder="Session token issued after login"
              value={controlToken}
              onChange={(event) => setControlToken(event.target.value)}
            />
          </div>
        </article>

        <article className="control-card map-card map-card-bottom">
          <div className="section-title-help">
            <h3>Session Geo Map</h3>
            <span className="help-tip" title="Approximate geo view from public endpoint IP addresses.">?</span>
          </div>
          <div className="chip-row monitor-chip-row" aria-label="Session map summary">
            <span className="chip">
              Sessions <strong>{mapData.session_total || 0}</strong>
            </span>
            <span className="chip">
              Mappable <strong>{mapData.mappable_total || 0}</strong>
            </span>
            <span className="chip">
              Trusted mappable <strong>{mapData.mappable_trusted_total || 0}</strong>
            </span>
          </div>

          {markerGroups.length ? (
            <div className="map-wrap map-wrap-large">
              <MapContainer center={mapCenter} zoom={2} minZoom={2} scrollWheelZoom className="leaflet-map leaflet-map-large">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {markerGroups.map((marker) => {
                  const total = marker.sessions.length;
                  const radius = Math.min(16, 5 + total * 1.3);
                  const hasSuspect = marker.suspectCount > 0;
                  const color = hasSuspect ? "#ff6b8b" : "#4ad0a8";
                  const topSession = marker.sessions[0] || {};
                  const topUser = topSession.username || topSession.common_name || "n/a";
                  return (
                    <CircleMarker
                      key={marker.key}
                      center={[marker.lat, marker.lon]}
                      radius={radius}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.36, weight: 1.2 }}
                    >
                      <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                        <div className="map-tooltip">
                          <strong>
                            {marker.city ? `${marker.city}, ` : ""}
                            {marker.country || "unknown"}
                          </strong>
                          <div>Total: {total} | Trusted: {marker.trustedCount} | Suspect: {marker.suspectCount}</div>
                          <div>Top user: {topUser}</div>
                          <div>{marker.provider || "Provider unknown"}</div>
                        </div>
                      </Tooltip>
                      <Popup>
                        <div className="map-popup">
                          <strong>
                            {marker.city ? `${marker.city}, ` : ""}
                            {marker.country || "unknown"}
                          </strong>
                          <div>Total sessions: {total}</div>
                          <div>Trusted: {marker.trustedCount}</div>
                          <div>Suspect: {marker.suspectCount}</div>
                          <div>{marker.provider || "Provider unknown"}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </div>
          ) : (
            <p className="hint">No public endpoint locations available for map rendering yet.</p>
          )}

          {mapError ? <p className="control-result control-result-error">{mapError}</p> : null}
        </article>
      </div>

      {authOpen ? (
        <div className="control-auth-modal-backdrop" role="presentation" onClick={() => setAuthOpen(false)}>
          <article
            className="control-auth-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Control authentication popup"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="control-auth-modal-head">
              <h3>Control Authentication</h3>
              <button
                type="button"
                className="control-auth-close"
                onClick={() => setAuthOpen(false)}
                aria-label="Close authentication popup"
              >
                x
              </button>
            </div>
            {canUseSessionAuth ? (
              <>
                <label className="control-label" htmlFor="control-auth-username">
                  Username
                </label>
                <input
                  id="control-auth-username"
                  className="control-input"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter control username"
                  value={authUsername}
                  onChange={(event) => setAuthUsername(event.target.value)}
                />
                <label className="control-label" htmlFor="control-auth-password">
                  Password
                </label>
                <input
                  id="control-auth-password"
                  className="control-input"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter control password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                />
                <div className="control-auth-actions">
                  <button type="button" className="control-button" disabled={!canSubmitAuth} onClick={login}>
                    {authBusy ? "Authorizing..." : "Authorize"}
                  </button>
                  <button
                    type="button"
                    className="control-button"
                    disabled={authBusy || !controlToken.trim()}
                    onClick={logout}
                  >
                    Lock
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="hint">
                  {features.config_error ||
                    "Control auth is not configured. Set PORTAL_CONTROL_AUTH_SECRET_ID and add username plus password_hash in AWS Secrets Manager."}
                </p>
              </>
            )}
            {authMessage ? <p className="control-result">{authMessage}</p> : null}
          </article>
        </div>
      ) : null}
    </section>
  );
}

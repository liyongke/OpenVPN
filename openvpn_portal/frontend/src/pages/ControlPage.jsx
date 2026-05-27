import { useEffect, useMemo, useState } from "react";
import { getBackendMonitoring, getControlFeatures, runControlAction } from "../api/client";

const DEFAULT_FEATURES = {
  enabled: false,
  auth_required: true,
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

export function ControlPage() {
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [token, setToken] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [result, setResult] = useState("");
  const [monitoring, setMonitoring] = useState(DEFAULT_MONITORING);
  const [monitoringError, setMonitoringError] = useState("");

  useEffect(() => {
    let mounted = true;

    getControlFeatures()
      .then((payload) => {
        if (mounted) {
          setFeatures(payload);
        }
      })
      .catch((error) => {
        if (mounted) {
          setResult(`Failed to load control features: ${error.message}`);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

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
      const payload = await runControlAction(action, token.trim());
      setResult(`${payload.message} (${payload.action})`);
    } catch (error) {
      setResult(`Action failed: ${error.message}`);
    } finally {
      setLoadingAction("");
    }
  };

  return (
    <section className="panel control-placeholder">
      <p className="eyebrow">Administrative Surface</p>
      <h2>Operations Center</h2>
      <p className="sub">
        Feature-flagged operations require authentication and are disabled by default.
      </p>
      <div className="chip-row">
        <span className="chip">
          Operations API <strong>{features.enabled ? "enabled" : "disabled"}</strong>
        </span>
        <span className="chip">
          Auth <strong>{features.auth_required ? "required" : "optional"}</strong>
        </span>
        <span className="chip">
          Backend <strong>{monitoring.backend_online ? "online" : "offline"}</strong>
        </span>
      </div>

      <div className="control-grid">
        <article className="control-card">
          <h3>Backend Monitoring</h3>
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
            <p className="hint">Collector loop healthy. No recent refresh error reported.</p>
          )}
          {monitoringError ? <p className="control-result control-result-error">{monitoringError}</p> : null}
        </article>

        <article className="control-card">
          <h3>Credentials</h3>
          <label className="control-label" htmlFor="control-token">
            Bearer token
          </label>
          <input
            id="control-token"
            className="control-input"
            type="password"
            autoComplete="off"
            placeholder="Enter control token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <p className="hint">Token is sent only when executing actions.</p>
        </article>

        <article className="control-card">
          <h3>Actions</h3>
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
          </div>
          {!features.enabled ? <p className="hint">Enable with PORTAL_CONTROL_ENABLED=1 on backend.</p> : null}
          {result ? <p className="control-result">{result}</p> : null}
        </article>
      </div>
    </section>
  );
}

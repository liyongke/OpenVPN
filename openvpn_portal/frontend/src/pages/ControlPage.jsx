import { useEffect, useMemo, useState } from "react";
import { getControlFeatures, runControlAction } from "../api/client";

const DEFAULT_FEATURES = {
  enabled: false,
  auth_required: true,
  allowed_actions: [],
};

export function ControlPage() {
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [token, setToken] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [result, setResult] = useState("");

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
      <h2>Control Actions</h2>
      <p className="sub">
        Feature-flagged control actions require authentication and are disabled by default.
      </p>
      <div className="chip-row">
        <span className="chip">
          Control API <strong>{features.enabled ? "enabled" : "disabled"}</strong>
        </span>
        <span className="chip">
          Auth <strong>{features.auth_required ? "required" : "optional"}</strong>
        </span>
      </div>

      <div className="control-grid">
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

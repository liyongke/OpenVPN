import { useEffect, useMemo, useState } from "react";
import {
  getControlFeatures,
  getHistory7d,
  getStoredControlTokenEventName,
  getLiveSummary,
  getStoredControlToken,
  runControlAction,
  subscribeLiveSessions,
} from "../api/client";

const EMPTY_SNAPSHOT = {
  summary: {
    active_clients: 0,
    trusted_active_clients: 0,
    suspect_active_clients: 0,
    total_mib_received: 0,
    total_mib_sent: 0,
    protocol_breakdown: { tcp: 0, udp: 0 },
    trusted_device_breakdown: { phone: 0, pc: 0, unknown: 0 },
    unique_identities_trusted: 0,
    unique_real_endpoints_trusted: 0,
    unique_real_endpoints_raw: 0,
    user_usage: [],
  },
  diagnostics: {
    cross_protocol_duplicate_count: 0,
    cross_protocol_duplicates: [],
  },
  sessions: [],
  status_sources: [],
  status_exists: false,
  updated_at: "n/a",
  generated_at: "n/a",
};

const EMPTY_CONTROL_FEATURES = {
  enabled: false,
  control_available: false,
  auth_required: true,
  auth_mode: "secret_session",
  config_error: "",
  allowed_actions: [],
};

function HistoryChart({ days }) {
  if (!days.length) {
    return <p className="chart-empty">No data.</p>;
  }

  const ordered = [...days].sort((a, b) => String(a.day).localeCompare(String(b.day)));
  const width = 980;
  const height = 220;
  const pad = { top: 20, right: 24, bottom: 42, left: 54 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const peakMax = Math.max(
    1,
    ...ordered.map((d) => Number(d.peak_trusted_active_clients || d.peak_active_clients || 0)),
  );
  const trafficMax = Math.max(
    1,
    ...ordered.map((d) => Number(d.max_total_mib_received || 0) + Number(d.max_total_mib_sent || 0)),
  );
  const slot = innerW / ordered.length;
  const barW = Math.max(18, slot * 0.5);

  const points = ordered
    .map((d, i) => {
      const clients = Number(d.peak_trusted_active_clients || d.peak_active_clients || 0);
      const x = Math.round(pad.left + i * slot + slot / 2);
      const y = Math.round(pad.top + innerH - (clients / peakMax) * innerH);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="History chart with traffic and peak clients">
        <line
          x1={pad.left}
          y1={pad.top + innerH}
          x2={width - pad.right}
          y2={pad.top + innerH}
          className="hist-axis"
        />
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + innerH} className="hist-axis" />

        {ordered.map((d, i) => {
          const totalMiB = Number(d.max_total_mib_received || 0) + Number(d.max_total_mib_sent || 0);
          const h = Math.max(2, Math.round((totalMiB / trafficMax) * innerH));
          const x = Math.round(pad.left + i * slot + (slot - barW) / 2);
          const y = pad.top + innerH - h;
          return <rect key={`bar-${d.day}`} x={x} y={y} width={Math.round(barW)} height={h} rx="4" className="hist-bar" />;
        })}

        <polyline points={points} fill="none" className="hist-line" />

        {ordered.map((d, i) => {
          const clients = Number(d.peak_trusted_active_clients || d.peak_active_clients || 0);
          const raw = Number(d.peak_active_clients || 0);
          const suspect = Number(d.peak_suspect_active_clients || 0);
          const x = Math.round(pad.left + i * slot + slot / 2);
          const y = Math.round(pad.top + innerH - (clients / peakMax) * innerH);
          return (
            <circle key={`dot-${d.day}`} cx={x} cy={y} r="3.5" className="hist-dot">
              <title>{`${d.day}: trusted peak ${clients}, raw peak ${raw}, suspect peak ${suspect}`}</title>
            </circle>
          );
        })}

        {ordered.map((d, i) => {
          const x = Math.round(pad.left + i * slot + slot / 2);
          const shortDay = String(d.day).slice(5);
          return (
            <text key={`label-${d.day}`} x={x} y={height - 16} textAnchor="middle" className="hist-label">
              {shortDay}
            </text>
          );
        })}
      </svg>
      <div className="hist-legend">
        <span>
          <i className="legend-swatch bar" /> Traffic
        </span>
        <span>
          <i className="legend-swatch line" /> Trusted peak
        </span>
      </div>
    </>
  );
}

export function DashboardPage() {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [historyDays, setHistoryDays] = useState([]);
  const [historyError, setHistoryError] = useState(false);
  const [controlFeatures, setControlFeatures] = useState(EMPTY_CONTROL_FEATURES);
  const [controlToken, setControlToken] = useState(() => getStoredControlToken());
  const [terminatingKey, setTerminatingKey] = useState("");
  const [terminateResult, setTerminateResult] = useState("");

  useEffect(() => {
    let mounted = true;

    getLiveSummary()
      .then((payload) => {
        if (mounted) {
          setSnapshot(payload);
        }
      })
      .catch(() => {
        if (mounted) {
          setSnapshot(EMPTY_SNAPSHOT);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    getControlFeatures(controlToken)
      .then((payload) => {
        if (mounted) {
          setControlFeatures(payload || EMPTY_CONTROL_FEATURES);
        }
      })
      .catch(() => {
        if (mounted) {
          setControlFeatures(EMPTY_CONTROL_FEATURES);
        }
      });

    return () => {
      mounted = false;
    };
  }, [controlToken]);

  useEffect(() => {
    const syncControlToken = () => {
      setControlToken(getStoredControlToken());
    };
    const controlTokenEvent = getStoredControlTokenEventName();

    window.addEventListener("storage", syncControlToken);
    window.addEventListener("focus", syncControlToken);
    window.addEventListener(controlTokenEvent, syncControlToken);
    return () => {
      window.removeEventListener("storage", syncControlToken);
      window.removeEventListener("focus", syncControlToken);
      window.removeEventListener(controlTokenEvent, syncControlToken);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let reconnectTimer = null;
    let unsubscribe = null;

    const connect = () => {
      unsubscribe = subscribeLiveSessions(
        (payload) => {
          if (mounted) {
            setSnapshot(payload);
          }
        },
        () => {
          if (!mounted) {
            return;
          }
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
          reconnectTimer = window.setTimeout(connect, 2000);
        },
      );
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const refreshHistory = async () => {
      try {
        const payload = await getHistory7d();
        if (!mounted) {
          return;
        }
        setHistoryDays(payload.days || []);
        setHistoryError(false);
      } catch {
        if (mounted) {
          setHistoryDays([]);
          setHistoryError(true);
        }
      }
    };

    refreshHistory();
    const interval = window.setInterval(refreshHistory, 30000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const summary = snapshot.summary || EMPTY_SNAPSHOT.summary;
  const sessions = snapshot.sessions || [];
  const usageUsers = summary.user_usage || [];

  const trustedIdentities = Number(summary.unique_identities_trusted || 0);
  const trustedEndpoints = Number(summary.unique_real_endpoints_trusted || 0);
  const rawEndpoints = Number(summary.unique_real_endpoints_raw || 0);
  const trustShare = rawEndpoints > 0 ? Math.round((trustedEndpoints / rawEndpoints) * 100) : 0;
  const identityDensity = trustedEndpoints > 0 ? trustedIdentities / trustedEndpoints : trustedIdentities;
  const coverageFill = Math.max(6, Math.min(100, trustShare));

  const usageStats = useMemo(() => {
    const usageSessions = usageUsers.reduce((total, user) => total + Number(user.session_count || 0), 0);
    return {
      usageSessions,
      topUser: usageUsers.length ? usageUsers[0].username : "n/a",
    };
  }, [usageUsers]);

  const historySamples = historyDays.reduce((total, day) => total + Number(day.sample_count || 0), 0);
  const historyLatest = historyDays.length
    ? historyDays[historyDays.length - 1].last_sampled_at || historyDays[historyDays.length - 1].day || "n/a"
    : "n/a";
  const historyLatestShort = String(historyLatest).replace("T", " ").replace("Z", "").slice(0, 19) || "n/a";

  const protocol = summary.protocol_breakdown || { tcp: 0, udp: 0 };
  const devices = summary.trusted_device_breakdown || summary.device_breakdown || { phone: 0, pc: 0, unknown: 0 };
  const diagnostics = snapshot.diagnostics || { cross_protocol_duplicate_count: 0, cross_protocol_duplicates: [] };
  const duplicateCount = Number(diagnostics.cross_protocol_duplicate_count || 0);
  const duplicatePreview = Array.isArray(diagnostics.cross_protocol_duplicates)
    ? diagnostics.cross_protocol_duplicates.slice(0, 3)
    : [];
  const trustedDeviceTotal = Math.max(0, Number(devices.phone || 0) + Number(devices.pc || 0) + Number(devices.unknown || 0));
  const deviceDistribution = [
    {
      key: "phone",
      label: "Phone",
      value: Number(devices.phone || 0),
      pct: trustedDeviceTotal > 0 ? Math.round((Number(devices.phone || 0) / trustedDeviceTotal) * 100) : 0,
    },
    {
      key: "pc",
      label: "PC",
      value: Number(devices.pc || 0),
      pct: trustedDeviceTotal > 0 ? Math.round((Number(devices.pc || 0) / trustedDeviceTotal) * 100) : 0,
    },
    {
      key: "unknown",
      label: "Unknown",
      value: Number(devices.unknown || 0),
      pct: trustedDeviceTotal > 0 ? Math.round((Number(devices.unknown || 0) / trustedDeviceTotal) * 100) : 0,
    },
  ];
  const duplicateRatioBase = Math.max(1, trustedIdentities || Number(summary.trusted_active_clients || 0));
  const duplicateRatioPct = Math.min(100, Math.round((duplicateCount / duplicateRatioBase) * 100));
  const allowedActions = new Set(controlFeatures.allowed_actions || []);
  const canTerminateSession = Boolean(controlFeatures.enabled) && allowedActions.has("terminate_head_session");

  const sessionActionKey = (session, index) =>
    [
      session.protocol || "",
      session.real_address || "",
      session.virtual_address || "",
      session.common_name || "",
      session.client_id ?? "",
      index,
    ].join("|");

  const handleTerminateSession = async (session, index) => {
    const actionKey = sessionActionKey(session, index);
    setTerminatingKey(actionKey);
    setTerminateResult("");
    try {
      const payload = await runControlAction("terminate_head_session", controlToken, {
        target_username: session.username || "",
        target_common_name: session.common_name || "",
        target_real_address: session.real_address || "",
        target_virtual_address: session.virtual_address || "",
        target_protocol: session.protocol || "",
        target_client_id: session.client_id ?? null,
      });
      const target = payload?.terminated?.real_address || "target unknown";
      setTerminateResult(`Termination request sent (${target})`);
    } catch (error) {
      setTerminateResult(`Termination failed: ${error.message}`);
    } finally {
      setTerminatingKey("");
    }
  };

  return (
    <>
      <header className="top hero">
        <div className="brand-row">
          <div className="brand-title">
              <svg className="brand-icon page-brand-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3 4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4zm0 10a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7zm10-10a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V4zm0 10a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7z" />
              </svg>
            <div>
              <h1>Dashboard</h1>
            </div>
          </div>
          <div className="live-pill" aria-label="Live stream enabled">
            Live stream enabled
          </div>
        </div>
        <div className="hero-meta">
          <span>
            Updated: <strong>{snapshot.updated_at || "n/a"}</strong>
          </span>
          <span>
            Rendered: <strong>{snapshot.generated_at || "n/a"}</strong>
          </span>
          <span>
            Status files: <strong>{String(snapshot.status_exists)}</strong>
          </span>
        </div>
      </header>

      <section className="cards cards-main" aria-label="Primary metrics">
        <article className="card summary-card sessions-overview">
          <h2>Sessions</h2>
          <div className="summary-list" aria-label="Session summary">
            <div className="summary-row">
              <span className="summary-icon active" aria-hidden="true" />
              <span className="summary-label">Active</span>
              <strong className="summary-value">{summary.active_clients || 0}</strong>
            </div>
            <div className="summary-row">
              <span className="summary-icon trusted" aria-hidden="true" />
              <span className="summary-label">Trusted</span>
              <strong className="summary-value">{summary.trusted_active_clients ?? summary.active_clients ?? 0}</strong>
            </div>
            <div className="summary-row">
              <span className="summary-icon suspect" aria-hidden="true" />
              <span className="summary-label">Suspect</span>
              <strong className="summary-value">{summary.suspect_active_clients ?? 0}</strong>
            </div>
          </div>
        </article>
        <article className="card summary-card transport-overview">
          <h2>Transport</h2>
          <div className="summary-list" aria-label="Transport summary">
            <div className="summary-row">
              <span className="summary-icon download" aria-hidden="true" />
              <span className="summary-label">Download</span>
              <strong className="summary-value">{summary.total_mib_received || 0} MiB</strong>
            </div>
            <div className="summary-row">
              <span className="summary-icon upload" aria-hidden="true" />
              <span className="summary-label">Upload</span>
              <strong className="summary-value">{summary.total_mib_sent || 0} MiB</strong>
            </div>
            <div className="summary-row">
              <span className="summary-icon split" aria-hidden="true" />
              <span className="summary-label">Split</span>
              <strong className="summary-value">TCP {protocol.tcp || 0} / UDP {protocol.udp || 0}</strong>
            </div>
          </div>
        </article>
        <article className="card summary-card devices-overview">
          <div className="card-head">
            <h2>Device Mix (Trusted)</h2>
            <span className="help-tip" title="Trusted-only device composition from current snapshot.">?</span>
          </div>
          <div className="summary-list" aria-label="Trusted device summary">
            {deviceDistribution.map((item) => (
              <div className="summary-row" key={`top-${item.key}`}>
                <span className={`summary-icon ${item.key}`} aria-hidden="true" />
                <span className="summary-label">{item.label}</span>
                <strong className="summary-value">{item.value}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel section-panel aggregate-card" aria-label="Identity analytics">
          <div className="aggregate-head">
            <div className="card-head">
              <h2>Coverage &amp; Duplicate Integrity</h2>
              <span className="help-tip" title="Aggregates trusted endpoint coverage and cross-protocol identity duplication.">?</span>
            </div>
            <span className="coverage-badge">{trustShare}% trust share</span>
          </div>

          <div className="aggregate-grid">
            <div className="aggregate-coverage">
              <div className="section-title-help">
                <h3>Trusted Identity Coverage</h3>
                <span className="help-tip" title="Trusted identity and endpoint concentration versus raw endpoint surface.">?</span>
              </div>
              <div className="coverage-grid">
                <div className="coverage-stat">
                  <span className="coverage-stat-value">{trustedIdentities}</span>
                  <span className="coverage-stat-label">Trusted identities</span>
                </div>
                <div className="coverage-stat">
                  <span className="coverage-stat-value">{trustedEndpoints}</span>
                  <span className="coverage-stat-label">Trusted endpoints</span>
                </div>
                <div className="coverage-stat">
                  <span className="coverage-stat-value">{rawEndpoints}</span>
                  <span className="coverage-stat-label">Raw endpoints</span>
                </div>
              </div>
              <div className="coverage-bar" aria-hidden="true">
                <span className="coverage-bar-fill" style={{ width: `${coverageFill}%` }} />
              </div>
              <div className="coverage-meta">
                <span>
                  <strong>{trustShare}%</strong> trusted endpoint share
                </span>
                <span>
                  <strong>{identityDensity.toFixed(2)}x</strong> identities per endpoint
                </span>
              </div>
            </div>

            <div className="aggregate-duplicates">
              <div className="section-title-help">
                <h3>Cross-Protocol Duplicates</h3>
                <span className="help-tip" title="Identities simultaneously present on TCP and UDP in the same snapshot.">?</span>
              </div>
              <p className="metric small">{duplicateCount}</p>
              <div className="duplicate-meter" aria-hidden="true">
                <span className="duplicate-meter-fill" style={{ width: `${Math.max(4, duplicateRatioPct)}%` }} />
              </div>
              {duplicatePreview.length ? (
                <p className="source-meta">
                  {duplicatePreview
                    .map((item) => `${item.identity} [${(item.protocols || []).join("/")}]`)
                    .join(" | ")}
                </p>
              ) : <p className="source-meta">None</p>}
            </div>
          </div>
      </section>

      <section className="panel section-panel">
        <div className="section-heading">
          <div>
            <div className="section-title-help">
              <h2>Active Sessions</h2>
              <span className="help-tip" title="Live connections with protocol/device/audit labels.">?</span>
            </div>
          </div>
          <div className="sessions-toolbar">
            <div className="chip-row compact-chips" aria-label="Active session summary">
              <span className="chip">
                <strong>{summary.active_clients ?? 0}</strong> raw
              </span>
              <span className="chip">
                <strong>{summary.trusted_active_clients ?? 0}</strong> trusted
              </span>
              <span className="chip">
                <strong>{summary.suspect_active_clients ?? 0}</strong> suspect
              </span>
            </div>
          </div>
        </div>
        {controlFeatures.enabled ? null : controlFeatures.control_available ? (
          <p className="hint">Row termination stays locked until you log in from the control icon.</p>
        ) : (
          <p className="hint">Session termination unavailable.</p>
        )}
        {terminateResult ? <p className="control-result">{terminateResult}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th aria-label="Terminate session" />
                <th>User</th>
                <th>Device</th>
                <th>Platform</th>
                <th>Protocol</th>
                <th>Common Name</th>
                <th>Real Address</th>
                <th>Virtual Address</th>
                <th>Download (MiB)</th>
                <th>Upload (MiB)</th>
                <th>Connected Since</th>
                <th>Connected (min)</th>
                <th>Audit</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan="13">No active sessions found in status file.</td>
                </tr>
              ) : (
                sessions.map((session, index) => (
                  <tr key={`${session.username}-${session.common_name}-${index}`}>
                    <td>
                      <button
                        type="button"
                        className="session-terminate-button"
                        disabled={!canTerminateSession || Boolean(terminatingKey)}
                        onClick={() => handleTerminateSession(session, index)}
                        aria-label={`Terminate session for ${session.username || session.common_name || "client"}`}
                        title={canTerminateSession ? "Force terminate this session" : "Log in to enable termination"}
                      >
                        &times;
                      </button>
                    </td>
                    <td>{session.username}</td>
                    <td>{session.device_type || "unknown"}</td>
                    <td>{session.device_platform || "unknown"}</td>
                    <td>{session.protocol || "unknown"}</td>
                    <td>{session.common_name}</td>
                    <td>{session.real_address}</td>
                    <td>{session.virtual_address || ""}</td>
                    <td>{session.mib_received}</td>
                    <td>{session.mib_sent}</td>
                    <td>{session.connected_since}</td>
                    <td>
                      {session.connected_for_minutes === null || session.connected_for_minutes === undefined
                        ? "n/a"
                        : session.connected_for_minutes}
                    </td>
                    <td>
                      {session.audit_class || "trusted"}
                      {session.audit_flags && session.audit_flags.length
                        ? ` (${session.audit_flags.join(", ")})`
                        : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel section-panel">
        <div className="section-heading">
          <div>
            <div className="section-title-help">
              <h2>Usage by User (Current Snapshot)</h2>
              <span className="help-tip" title="Users ranked by current snapshot traffic.">?</span>
            </div>
          </div>
          <div className="chip-row compact-chips" aria-label="User usage summary">
            <span className="chip">
              <strong>{usageUsers.length}</strong> users
            </span>
            <span className="chip">
              <strong>{usageStats.usageSessions}</strong> sessions
            </span>
            <span className="chip">
              <strong>{usageStats.topUser}</strong> top user
            </span>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Sessions</th>
                <th>Download (MiB)</th>
                <th>Upload (MiB)</th>
              </tr>
            </thead>
            <tbody>
              {usageUsers.length === 0 ? (
                <tr>
                  <td colSpan="4">No user usage available from current status snapshot.</td>
                </tr>
              ) : (
                usageUsers.map((user) => (
                  <tr key={user.username}>
                    <td>{user.username}</td>
                    <td>{user.session_count}</td>
                    <td>{user.mib_received}</td>
                    <td>{user.mib_sent}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel section-panel">
        <div className="section-heading">
          <div>
            <div className="section-title-help">
              <h2>History (Last 7 Days)</h2>
              <span className="help-tip" title="Daily peaks and traffic maxima from retained samples.">?</span>
            </div>
          </div>
          <div className="chip-row compact-chips" aria-label="History summary">
            <span className="chip">
              <strong>{historyDays.length}</strong> days
            </span>
            <span className="chip">
              <strong>{historySamples}</strong> samples
            </span>
            <span className="chip">
              <strong>{historyLatestShort}</strong> latest
            </span>
          </div>
        </div>
        <div className="history-chart" aria-label="7 day history chart">
          <HistoryChart days={historyDays} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Day (UTC)</th>
                <th>Samples</th>
                <th>Peak Active (Raw)</th>
                <th>Peak Active (Trusted)</th>
                <th>Peak Suspect</th>
                <th>Avg Active (Trusted)</th>
                <th>Max Download Snapshot (MiB)</th>
                <th>Max Upload Snapshot (MiB)</th>
                <th>Last Sample</th>
              </tr>
            </thead>
            <tbody>
              {historyError ? (
                <tr>
                  <td colSpan="9">Failed to load history data.</td>
                </tr>
              ) : historyDays.length === 0 ? (
                <tr>
                  <td colSpan="9">No history yet. This table fills as snapshots are collected.</td>
                </tr>
              ) : (
                historyDays.map((day) => (
                  <tr key={day.day}>
                    <td>{day.day}</td>
                    <td>{day.sample_count}</td>
                    <td>{day.peak_active_clients}</td>
                    <td>{day.peak_trusted_active_clients ?? day.peak_active_clients}</td>
                    <td>{day.peak_suspect_active_clients ?? 0}</td>
                    <td>{day.avg_trusted_active_clients ?? day.avg_active_clients}</td>
                    <td>{day.max_total_mib_received}</td>
                    <td>{day.max_total_mib_sent}</td>
                    <td>{day.last_sampled_at || "n/a"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

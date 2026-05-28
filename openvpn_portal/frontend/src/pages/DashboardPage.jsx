import { useEffect, useMemo, useState } from "react";
import { getControlFeatures, getHistory7d, getLiveSummary, runControlAction, subscribeLiveSessions } from "../api/client";

const portalIconUrl = "/static/openvpn-icon.svg";

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
  sessions: [],
  status_sources: [],
  status_exists: false,
  updated_at: "n/a",
  generated_at: "n/a",
};

const EMPTY_CONTROL_FEATURES = {
  enabled: false,
  auth_required: true,
  allowed_actions: [],
};

function HistoryChart({ days }) {
  if (!days.length) {
    return <p className="chart-empty">No chart data yet. Samples appear every minute.</p>;
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
          <i className="legend-swatch bar" /> Daily max traffic snapshot (MiB)
        </span>
        <span>
          <i className="legend-swatch line" /> Daily peak trusted sessions
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
  const [terminateToken, setTerminateToken] = useState("");
  const [terminateLoading, setTerminateLoading] = useState(false);
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

    getControlFeatures()
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

  const protocol = summary.protocol_breakdown || { tcp: 0, udp: 0 };
  const devices = summary.trusted_device_breakdown || summary.device_breakdown || { phone: 0, pc: 0, unknown: 0 };
  const allowedActions = new Set(controlFeatures.allowed_actions || []);
  const canTerminateHeadSession =
    Boolean(controlFeatures.enabled) && allowedActions.has("terminate_head_session") && sessions.length > 0;

  const handleTerminateHeadSession = async () => {
    setTerminateLoading(true);
    setTerminateResult("");
    try {
      const payload = await runControlAction("terminate_head_session", terminateToken.trim());
      const target = payload?.terminated?.real_address || "target unknown";
      setTerminateResult(`Termination request sent (${target})`);
    } catch (error) {
      setTerminateResult(`Termination failed: ${error.message}`);
    } finally {
      setTerminateLoading(false);
    }
  };

  return (
    <>
      <header className="top hero">
        <div className="brand-row">
          <div className="brand-title">
            <img className="brand-icon" src={portalIconUrl} alt="OpenVPN icon" />
            <div>
              <p className="eyebrow">OpenVPN Ops Portal</p>
              <h1>Live VPN Dashboard</h1>
            </div>
          </div>
          <div className="live-pill" aria-label="Live stream enabled">
            Live stream enabled
          </div>
        </div>
        <p className="sub">Observability-first surface. Control actions are feature-flagged and token-gated.</p>
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
        <article className="card metric-card">
          <h2>Active Sessions</h2>
          <p className="metric">{summary.active_clients || 0}</p>
          <p className="metric-foot">Raw status sessions</p>
        </article>
        <article className="card metric-card trusted">
          <h2>Trusted Sessions</h2>
          <p className="metric">{summary.trusted_active_clients ?? summary.active_clients ?? 0}</p>
          <p className="metric-foot">Identity validated</p>
        </article>
        <article className="card metric-card suspect">
          <h2>Suspect Sessions</h2>
          <p className="metric">{summary.suspect_active_clients ?? 0}</p>
          <p className="metric-foot">Needs review</p>
        </article>
        <article className="card metric-card traffic">
          <h2>Total Download</h2>
          <p className="metric">{summary.total_mib_received || 0} MiB</p>
          <p className="metric-foot">Current snapshot</p>
        </article>
        <article className="card metric-card traffic">
          <h2>Total Upload</h2>
          <p className="metric">{summary.total_mib_sent || 0} MiB</p>
          <p className="metric-foot">Current snapshot</p>
        </article>
        <article className="card metric-card mix">
          <h2>Transport</h2>
          <p className="metric small">TCP {protocol.tcp || 0} / UDP {protocol.udp || 0}</p>
          <p className="metric-foot">Connection split</p>
        </article>
      </section>

      <section className="cards cards-sub">
        <article className="card">
          <h2>Device Mix (Trusted)</h2>
          <p className="metric small">
            Phone {devices.phone || 0} / PC {devices.pc || 0} / Unknown {devices.unknown || 0}
          </p>
          <p className="hint">
            Trusted sessions exclude clearly unauthenticated/noise entries. Raw device counts remain available via API
            summary.
          </p>
        </article>
        <article className="card coverage-card">
          <h2>Trusted Identity Coverage</h2>
          <div className="coverage-header">
            <p className="coverage-kicker">Audit baseline for stable identities versus changing endpoints</p>
            <span className="coverage-badge">{trustShare}% trust share</span>
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
          <p className="hint">Useful audit baseline for real user/device diversity versus transient endpoint storms.</p>
        </article>
      </section>

      <section className="panel section-panel">
        <div className="section-heading">
          <div>
            <h2>Active Sessions</h2>
            <p className="section-subtitle">Live sessions with audit labels, protocol mix, and connection details.</p>
          </div>
          <div className="sessions-toolbar">
            <div className="chip-row" aria-label="Active session summary">
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
            <div className="sessions-action-row">
              <input
                type="password"
                className="control-input sessions-token-input"
                placeholder="Control token"
                value={terminateToken}
                onChange={(event) => setTerminateToken(event.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="control-button sessions-action-button"
                disabled={!canTerminateHeadSession || terminateLoading}
                onClick={handleTerminateHeadSession}
              >
                {terminateLoading ? "Terminating..." : "Force Terminate Head Session"}
              </button>
            </div>
          </div>
        </div>
        {controlFeatures.enabled ? null : (
          <p className="hint">Session termination is disabled. Enable with PORTAL_CONTROL_ENABLED=1.</p>
        )}
        {terminateResult ? <p className="control-result">{terminateResult}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
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
                  <td colSpan="12">No active sessions found in status file.</td>
                </tr>
              ) : (
                sessions.map((session, index) => (
                  <tr key={`${session.username}-${session.common_name}-${index}`}>
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
            <h2>Usage by User (Current Snapshot)</h2>
            <p className="section-subtitle">Ranked by total traffic so the busiest users stay visible first.</p>
          </div>
          <div className="chip-row" aria-label="User usage summary">
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
            <h2>History (Last 7 Days)</h2>
            <p className="section-subtitle">
              Daily snapshots highlight active-client peaks and traffic maxima across the retention window.
            </p>
          </div>
          <div className="chip-row" aria-label="History summary">
            <span className="chip">
              <strong>{historyDays.length}</strong> days
            </span>
            <span className="chip">
              <strong>{historySamples}</strong> samples
            </span>
            <span className="chip">
              <strong>{historyLatest}</strong> latest
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

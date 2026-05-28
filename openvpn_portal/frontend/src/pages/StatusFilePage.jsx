import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getControlLatency, getStatusFile } from "../api/client";

const portalIconUrl = "/static/openvpn-icon.svg";

const EMPTY_STATUS = {
  status_file: "",
  read_error: "",
  raw_text: "",
  status_exists: false,
  updated_at: "",
  generated_at: "",
  status_sources: [],
  source_entry: {},
  source_summary: {},
  source_parse_diagnostics: {},
  source_sessions: [],
  sessions: [],
  source_device_inference_counts: {},
  device_hints_file: {},
  diagnostics: {},
  parse_diagnostics: {},
};

const STATUS_LINE_COUNT = 800;
const SOURCE_STALE_THRESHOLD_SECONDS = 90;
const LATENCY_WINDOW_SECONDS = 300;

const EMPTY_CONTROL_LATENCY = {
  window_seconds: LATENCY_WINDOW_SECONDS,
  overall: {
    samples: 0,
    failures: 0,
    failure_rate: 0,
    last_latency_ms: 0,
    p50_latency_ms: 0,
    p95_latency_ms: 0,
  },
  protocols: {},
  latest_errors: [],
};

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatFreshness(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return `${safeNumber(value, 0).toFixed(1)}s`;
}

function identityForSession(session) {
  return String(session?.username || session?.common_name || "").trim();
}

export function StatusFilePage() {
  const [searchParams] = useSearchParams();
  const selectedFile = searchParams.get("file") || "";
  const sourceFilter = (searchParams.get("filter") || "all").toLowerCase();
  const sessionClassFilter = (searchParams.get("sessionClass") || "all").toLowerCase();
  const selectedIdentity = (searchParams.get("identity") || "").trim();
  const [statusData, setStatusData] = useState(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedSources, setExpandedSources] = useState({});
  const [sourceLoading, setSourceLoading] = useState({});
  const [sourceLogs, setSourceLogs] = useState({});
  const [controlLatency, setControlLatency] = useState(EMPTY_CONTROL_LATENCY);
  const [latencyError, setLatencyError] = useState("");
  const [copyState, setCopyState] = useState("");
  const [timeNowMs, setTimeNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    getStatusFile(selectedFile, STATUS_LINE_COUNT)
      .then((payload) => {
        if (mounted) {
          setStatusData(payload);
          const sourceEntries = payload.status_sources || [];
          const autoSourcePath = selectedFile || (sourceEntries.length === 1 ? sourceEntries[0].path : "");

          if (autoSourcePath) {
            setExpandedSources((prev) => ({ ...prev, [autoSourcePath]: true }));
            setSourceLogs((prev) => ({
              ...prev,
              [autoSourcePath]: {
                raw_text: payload.raw_text || "",
                read_error: payload.read_error || "",
                source_summary: payload.source_summary || {},
                source_sessions: payload.source_sessions || [],
                source_device_inference_counts: payload.source_device_inference_counts || {},
                source_parse_diagnostics: payload.source_parse_diagnostics || {},
                diagnostics: payload.diagnostics || {},
              },
            }));
          }
        }
      })
      .catch((fetchError) => {
        if (mounted) {
          setError(fetchError.message || "Failed to load status file");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [selectedFile]);

  useEffect(() => {
    let mounted = true;

    const refreshLatency = async () => {
      try {
        const payload = await getControlLatency(LATENCY_WINDOW_SECONDS);
        if (!mounted) {
          return;
        }
        setControlLatency(payload || EMPTY_CONTROL_LATENCY);
        setLatencyError("");
      } catch (fetchError) {
        if (!mounted) {
          return;
        }
        setLatencyError(fetchError.message || "Failed to load control latency");
      }
    };

    refreshLatency();
    const timer = window.setInterval(refreshLatency, 15000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const buildStatusFileLink = (overrides = {}) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(overrides).forEach(([key, value]) => {
      const normalized = String(value ?? "").trim();
      if (!normalized || normalized === "all") {
        next.delete(key);
      } else {
        next.set(key, normalized);
      }
    });
    const query = next.toString();
    return query ? `/status-file?${query}` : "/status-file";
  };

  const statusSources = useMemo(() => statusData.status_sources || [], [statusData.status_sources]);
  const allSessions = useMemo(() => statusData.sessions || [], [statusData.sessions]);

  const liveCount = useMemo(
    () => statusSources.filter((source) => Boolean(source.exists)).length,
    [statusSources],
  );

  const offlineCount = useMemo(
    () => Math.max(0, statusSources.length - liveCount),
    [statusSources, liveCount],
  );

  const filteredSources = useMemo(() => {
    if (sourceFilter === "live") {
      return statusSources.filter((source) => Boolean(source.exists));
    }
    if (sourceFilter === "offline") {
      return statusSources.filter((source) => !Boolean(source.exists));
    }
    return statusSources;
  }, [statusSources, sourceFilter]);

  const selectedSourceSummary = statusData.source_summary || {};
  const selectedInferenceCounts = statusData.source_device_inference_counts || {};
  const selectedInferenceEntries = Object.entries(selectedInferenceCounts).sort((a, b) => Number(b[1]) - Number(a[1]));
  const selectedDuplicateCount = Number(statusData.diagnostics?.cross_protocol_duplicate_count || 0);
  const selectedParseDiagnostics = statusData.source_parse_diagnostics || {};
  const duplicateIdentities = Array.isArray(statusData.diagnostics?.cross_protocol_duplicates)
    ? statusData.diagnostics.cross_protocol_duplicates
    : [];
  const duplicateIdentitySet = useMemo(() => {
    const set = new Set();
    duplicateIdentities.forEach((entry) => {
      const identity = String(entry?.identity || "").trim().toLowerCase();
      if (identity) {
        set.add(identity);
      }
    });
    return set;
  }, [duplicateIdentities]);

  const generatedAtMs = Date.parse(statusData.generated_at || "");
  const generatedAgeSeconds = Number.isFinite(generatedAtMs)
    ? Math.max(0, (timeNowMs - generatedAtMs) / 1000)
    : null;

  const identitySessions = useMemo(() => {
    if (!selectedIdentity) {
      return { tcp: [], udp: [], unknown: [] };
    }

    const key = selectedIdentity.toLowerCase();
    const selected = allSessions.filter((session) => identityForSession(session).toLowerCase() === key);

    return {
      tcp: selected.filter((session) => String(session.protocol || "").toLowerCase() === "tcp"),
      udp: selected.filter((session) => String(session.protocol || "").toLowerCase() === "udp"),
      unknown: selected.filter((session) => {
        const protocol = String(session.protocol || "").toLowerCase();
        return protocol !== "tcp" && protocol !== "udp";
      }),
    };
  }, [allSessions, selectedIdentity]);

  const filterSourceSessionsByClass = (sessions) => {
    if (sessionClassFilter === "trusted") {
      return sessions.filter((session) => String(session.audit_class || "trusted") === "trusted");
    }
    if (sessionClassFilter === "suspect") {
      return sessions.filter((session) => String(session.audit_class || "trusted") !== "trusted");
    }
    if (sessionClassFilter === "duplicate") {
      return sessions.filter((session) => duplicateIdentitySet.has(identityForSession(session).toLowerCase()));
    }
    return sessions;
  };

  const exportCurrentSnapshot = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      query: {
        file: selectedFile,
        filter: sourceFilter,
        sessionClass: sessionClassFilter,
        identity: selectedIdentity,
      },
      source_freshness_threshold_seconds: SOURCE_STALE_THRESHOLD_SECONDS,
      generated_at: statusData.generated_at || "",
      status_sources: filteredSources,
      selected_source_summary: statusData.source_summary || {},
      selected_source_parse_diagnostics: statusData.source_parse_diagnostics || {},
      selected_source_sessions: filterSourceSessionsByClass(statusData.source_sessions || []),
      diagnostics: statusData.diagnostics || {},
      parse_diagnostics: statusData.parse_diagnostics || {},
      control_latency: controlLatency,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `status-explorer-snapshot-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  };

  const copyIncidentSummary = async () => {
    const staleSourceCount = statusSources.filter((source) => {
      const freshness = source?.freshness_seconds;
      return freshness !== null && freshness !== undefined && Number(freshness) > SOURCE_STALE_THRESHOLD_SECONDS;
    }).length;
    const parseErrorCount = statusSources.reduce((acc, source) => acc + safeNumber(source?.parse_error_count, 0), 0);
    const summary = [
      `generated_at=${statusData.generated_at || "n/a"}`,
      `sources_total=${statusSources.length}`,
      `sources_stale=${staleSourceCount}`,
      `parse_errors_total=${parseErrorCount}`,
      `cross_protocol_duplicates=${selectedDuplicateCount}`,
      `control_p95_ms=${safeNumber(controlLatency.overall?.p95_latency_ms, 0)}`,
      `control_failure_rate=${safeNumber(controlLatency.overall?.failure_rate, 0)}`,
      `active_filters=source:${sourceFilter},session:${sessionClassFilter},identity:${selectedIdentity || "none"}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      setCopyState("Incident summary copied.");
      window.setTimeout(() => setCopyState(""), 2200);
    } catch {
      setCopyState("Clipboard write failed.");
      window.setTimeout(() => setCopyState(""), 2200);
    }
  };

  const toggleSourceView = async (sourcePath) => {
    const isExpanded = Boolean(expandedSources[sourcePath]);
    if (isExpanded) {
      setExpandedSources((prev) => ({ ...prev, [sourcePath]: false }));
      return;
    }

    setExpandedSources((prev) => ({ ...prev, [sourcePath]: true }));

    if (sourceLogs[sourcePath] || sourceLoading[sourcePath]) {
      return;
    }

    setSourceLoading((prev) => ({ ...prev, [sourcePath]: true }));
    try {
      const payload = await getStatusFile(sourcePath, STATUS_LINE_COUNT);
      setSourceLogs((prev) => ({
        ...prev,
        [sourcePath]: {
          raw_text: payload.raw_text || "",
          read_error: payload.read_error || "",
          source_summary: payload.source_summary || {},
          source_sessions: payload.source_sessions || [],
          source_device_inference_counts: payload.source_device_inference_counts || {},
          source_parse_diagnostics: payload.source_parse_diagnostics || {},
          diagnostics: payload.diagnostics || {},
        },
      }));
    } catch (fetchError) {
      setSourceLogs((prev) => ({
        ...prev,
        [sourcePath]: {
          raw_text: "",
          read_error: fetchError.message || "Failed to load status file",
          source_summary: {},
          source_sessions: [],
          source_device_inference_counts: {},
          source_parse_diagnostics: {},
          diagnostics: {},
        },
      }));
    } finally {
      setSourceLoading((prev) => ({ ...prev, [sourcePath]: false }));
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
              <h1>Status Explorer</h1>
            </div>
          </div>
          <div className="status-hero-controls">
            <div className="live-pill">Read-only source</div>
            <div className="chip-row status-hero-chip-row" aria-label="Status explorer source filters">
              <span className={`chip ${sourceFilter === "all" ? "is-active" : ""}`}>
                <Link className="chip-link" to={buildStatusFileLink({ filter: "all" })}>
                  <strong>{statusSources.length}</strong> all
                </Link>
              </span>
              <span className={`chip ${sourceFilter === "live" ? "is-active" : ""}`}>
                <Link className="chip-link" to={buildStatusFileLink({ filter: "live" })}>
                  <strong>{liveCount}</strong> live
                </Link>
              </span>
              <span className={`chip ${sourceFilter === "offline" ? "is-active" : ""}`}>
                <Link className="chip-link" to={buildStatusFileLink({ filter: "offline" })}>
                  <strong>{offlineCount}</strong> offline
                </Link>
              </span>
            </div>
          </div>
        </div>
        <p className="sub">Raw tails plus parsed backend diagnostics (session trust, device-hint source, and cross-protocol duplicates).</p>
        <p className="hint">
          Auto-refresh age: <strong>{generatedAgeSeconds === null ? "n/a" : `${generatedAgeSeconds.toFixed(1)}s`}</strong>
        </p>
        <p className="source-path">
          <Link to="/">Back to dashboard</Link>
        </p>
      </header>

      <section className="panel section-panel">
        <h2>Source</h2>
        <div className="hero-meta">
          <span>
            Path: <strong>{statusData.status_file || "n/a"}</strong>
          </span>
          <span>
            Exists: <strong>{String(statusData.status_exists)}</strong>
          </span>
          <span>
            Updated at: <strong>{statusData.updated_at || "n/a"}</strong>
          </span>
          <span>
            Generated at: <strong>{statusData.generated_at || "n/a"}</strong>
          </span>
        </div>
        <div className="chip-row" aria-label="Selected source diagnostics">
          <span className="chip">
            <strong>{selectedSourceSummary.session_count || 0}</strong> sessions
          </span>
          <span className="chip">
            <strong>{selectedSourceSummary.trusted_count || 0}</strong> trusted
          </span>
          <span className="chip">
            <strong>{selectedSourceSummary.suspect_count || 0}</strong> suspect
          </span>
          <span className="chip">
            <strong>{selectedDuplicateCount}</strong> cross-protocol duplicates
          </span>
          <span className="chip">
            <strong>{safeNumber(selectedParseDiagnostics.client_rows_skipped, 0)}</strong> selected parse errors
          </span>
          <span className="chip">
            <strong>{safeNumber(controlLatency.overall?.p95_latency_ms, 0)}</strong> p95 control ms
          </span>
        </div>
        <div className="status-actions">
          <button type="button" className="source-view-button" onClick={exportCurrentSnapshot}>
            Export Snapshot JSON
          </button>
          <button type="button" className="source-view-button" onClick={copyIncidentSummary}>
            Copy Incident Summary
          </button>
          {copyState ? <span className="source-meta">{copyState}</span> : null}
        </div>
        <div className="chip-row" aria-label="Source session class filters">
          <span className={`chip ${sessionClassFilter === "all" ? "is-active" : ""}`}>
            <Link className="chip-link" to={buildStatusFileLink({ sessionClass: "all" })}>
              all sessions
            </Link>
          </span>
          <span className={`chip ${sessionClassFilter === "trusted" ? "is-active" : ""}`}>
            <Link className="chip-link" to={buildStatusFileLink({ sessionClass: "trusted" })}>
              trusted
            </Link>
          </span>
          <span className={`chip ${sessionClassFilter === "suspect" ? "is-active" : ""}`}>
            <Link className="chip-link" to={buildStatusFileLink({ sessionClass: "suspect" })}>
              suspect
            </Link>
          </span>
          <span className={`chip ${sessionClassFilter === "duplicate" ? "is-active" : ""}`}>
            <Link className="chip-link" to={buildStatusFileLink({ sessionClass: "duplicate" })}>
              duplicate identity
            </Link>
          </span>
        </div>
        <p className="hint">
          Status files in use: TCP and UDP are live server snapshots; <strong>{statusData.device_hints_file?.path || "device hints"}</strong>{" "}
          is metadata from client-connect that enriches device/platform labels.
        </p>
        <p className="source-meta">
          Parser mode={selectedParseDiagnostics.parse_mode || "n/a"} | parsed={safeNumber(selectedParseDiagnostics.client_rows_parsed, 0)}
          /{safeNumber(selectedParseDiagnostics.client_rows_seen, 0)} | skipped={safeNumber(selectedParseDiagnostics.client_rows_skipped, 0)}
        </p>
        {selectedInferenceEntries.length ? (
          <p className="source-meta">
            Device inference: {selectedInferenceEntries.map(([key, count]) => `${key}=${count}`).join(" | ")}
          </p>
        ) : null}

        {filteredSources.length ? (
          <>
            <p className="hint">View logs per source:</p>
            <div className="source-list">
              {filteredSources.map((source) => {
                const sourcePath = source.path;
                const isExpanded = Boolean(expandedSources[sourcePath]);
                const isBusy = Boolean(sourceLoading[sourcePath]);
                const payload = sourceLogs[sourcePath];
                const sourceSummary = payload?.source_summary || {};
                const sourceInference = payload?.source_device_inference_counts || {};
                const sourceInferenceItems = Object.entries(sourceInference).sort((a, b) => Number(b[1]) - Number(a[1]));
                const parseDiagnostics = payload?.source_parse_diagnostics || source.parse_diagnostics || {};
                const parsedSessions = filterSourceSessionsByClass(payload?.source_sessions || []);
                const sourceFreshnessSeconds = source?.freshness_seconds;
                const isStale = sourceFreshnessSeconds !== null
                  && sourceFreshnessSeconds !== undefined
                  && Number(sourceFreshnessSeconds) > SOURCE_STALE_THRESHOLD_SECONDS;

                return (
                  <article className="source-item" key={sourcePath}>
                    <div className="source-head">
                      <p className="source-path">{sourcePath}</p>
                      <div className="source-head-right">
                        <span className={`chip ${isStale ? "chip-warn" : ""}`}>
                          freshness {formatFreshness(sourceFreshnessSeconds)}
                        </span>
                        {isStale ? <span className="chip chip-warn">stale source</span> : null}
                      </div>
                      <button
                        type="button"
                        className="source-view-button"
                        onClick={() => toggleSourceView(sourcePath)}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Hide" : "View"} log ${sourcePath}`}
                      >
                        <svg viewBox="0 0 24 24" className="source-view-icon" aria-hidden="true" focusable="false">
                          <path d="M12 5c6.2 0 10 7 10 7s-3.8 7-10 7S2 12 2 12s3.8-7 10-7zm0 2.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2zm0 2.2a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z" />
                        </svg>
                        <span>{isExpanded ? "Hide" : "View"}</span>
                      </button>
                    </div>
                    <p className="source-meta">
                      protocol={source.protocol || "unknown"} | exists={String(Boolean(source.exists))} | sessions={
                        source.session_count || 0
                      } | trusted={sourceSummary.trusted_count ?? "n/a"} | suspect={sourceSummary.suspect_count ?? "n/a"} |
                      parse errors={safeNumber(source.parse_error_count, 0)}
                    </p>

                    {isExpanded ? (
                      <div className="source-log-panel">
                        <p className="status-scroll-hint">Showing the latest {STATUS_LINE_COUNT} lines for this source.</p>
                        <p className="source-meta">
                          panel refresh age: {generatedAgeSeconds === null ? "n/a" : `${generatedAgeSeconds.toFixed(1)}s`}
                        </p>
                        <div className="chip-row" aria-label={`Source panel filters ${sourcePath}`}>
                          <span className={`chip ${sessionClassFilter === "all" ? "is-active" : ""}`}>
                            <Link className="chip-link" to={buildStatusFileLink({ file: sourcePath, sessionClass: "all" })}>
                              all
                            </Link>
                          </span>
                          <span className={`chip ${sessionClassFilter === "trusted" ? "is-active" : ""}`}>
                            <Link className="chip-link" to={buildStatusFileLink({ file: sourcePath, sessionClass: "trusted" })}>
                              trusted
                            </Link>
                          </span>
                          <span className={`chip ${sessionClassFilter === "suspect" ? "is-active" : ""}`}>
                            <Link className="chip-link" to={buildStatusFileLink({ file: sourcePath, sessionClass: "suspect" })}>
                              suspect
                            </Link>
                          </span>
                          <span className={`chip ${sessionClassFilter === "duplicate" ? "is-active" : ""}`}>
                            <Link className="chip-link" to={buildStatusFileLink({ file: sourcePath, sessionClass: "duplicate" })}>
                              duplicate identity
                            </Link>
                          </span>
                        </div>
                        <p className="source-meta">
                          parser={parseDiagnostics.parse_mode || "n/a"} | parsed={safeNumber(parseDiagnostics.client_rows_parsed, 0)}/
                          {safeNumber(parseDiagnostics.client_rows_seen, 0)} | skipped={safeNumber(parseDiagnostics.client_rows_skipped, 0)}
                        </p>
                        {Object.keys(parseDiagnostics.skip_reasons || {}).length ? (
                          <p className="source-meta">
                            skip reasons: {Object.entries(parseDiagnostics.skip_reasons)
                              .map(([reason, count]) => `${reason}=${count}`)
                              .join(" | ")}
                          </p>
                        ) : null}
                        {isBusy ? (
                          <p className="section-empty">Loading log view...</p>
                        ) : payload?.read_error ? (
                          <p className="error">{payload.read_error}</p>
                        ) : (
                          <>
                            {sourceInferenceItems.length ? (
                              <p className="source-meta">
                                device inference: {sourceInferenceItems.map(([key, count]) => `${key}=${count}`).join(" | ")}
                              </p>
                            ) : null}
                            {parsedSessions.length ? (
                              <div className="table-wrap source-session-table-wrap">
                                <table>
                                  <thead>
                                    <tr>
                                      <th>User</th>
                                      <th>Protocol</th>
                                      <th>Real Address</th>
                                      <th>Virtual Address</th>
                                      <th>Platform</th>
                                      <th>Inference</th>
                                      <th>Audit</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {parsedSessions.map((session, index) => (
                                      <tr
                                        key={`${session.username || "unknown"}-${session.real_address || "unknown"}-${index}`}
                                      >
                                        <td>{session.username || session.common_name || "unknown"}</td>
                                        <td>{session.protocol || "unknown"}</td>
                                        <td>{session.real_address || ""}</td>
                                        <td>{session.virtual_address || ""}</td>
                                        <td>{session.device_platform || "unknown"}</td>
                                        <td>{session.device_inference_source || "fallback:unknown"}</td>
                                        <td>{session.audit_class || "trusted"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                            {payload?.raw_text ? (
                              <pre className="status-content status-content-inline">{payload.raw_text}</pre>
                            ) : (
                              <p className="section-empty">No readable content available.</p>
                            )}
                          </>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        ) : statusSources.length ? (
          <p className="section-empty">No sources match the selected filter.</p>
        ) : null}

        {duplicateIdentities.length ? (
          <>
            <h2>Identity Drill-Down</h2>
            <p className="hint">Select an identity to compare TCP and UDP sessions side-by-side.</p>
            <div className="chip-row" aria-label="Duplicate identity selector">
              {duplicateIdentities.map((entry) => {
                const identity = String(entry.identity || "");
                const active = selectedIdentity.toLowerCase() === identity.toLowerCase();
                return (
                  <span key={identity} className={`chip ${active ? "is-active" : ""}`}>
                    <Link className="chip-link" to={buildStatusFileLink({ identity })}>
                      {identity}
                    </Link>
                  </span>
                );
              })}
              {selectedIdentity ? (
                <span className="chip">
                  <Link className="chip-link" to={buildStatusFileLink({ identity: "" })}>
                    clear identity
                  </Link>
                </span>
              ) : null}
            </div>
            {selectedIdentity ? (
              <div className="identity-grid">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th colSpan="4">TCP</th>
                      </tr>
                      <tr>
                        <th>User</th>
                        <th>Real Address</th>
                        <th>Virtual Address</th>
                        <th>Audit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {identitySessions.tcp.length ? (
                        identitySessions.tcp.map((session, index) => (
                          <tr key={`tcp-${session.real_address || "none"}-${index}`}>
                            <td>{identityForSession(session) || "unknown"}</td>
                            <td>{session.real_address || ""}</td>
                            <td>{session.virtual_address || ""}</td>
                            <td>{session.audit_class || "trusted"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4">No TCP sessions for selected identity.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th colSpan="4">UDP</th>
                      </tr>
                      <tr>
                        <th>User</th>
                        <th>Real Address</th>
                        <th>Virtual Address</th>
                        <th>Audit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {identitySessions.udp.length ? (
                        identitySessions.udp.map((session, index) => (
                          <tr key={`udp-${session.real_address || "none"}-${index}`}>
                            <td>{identityForSession(session) || "unknown"}</td>
                            <td>{session.real_address || ""}</td>
                            <td>{session.virtual_address || ""}</td>
                            <td>{session.audit_class || "trusted"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4">No UDP sessions for selected identity.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <h2>Control Command Latency</h2>
        <p className="source-meta">
          window={safeNumber(controlLatency.window_seconds, LATENCY_WINDOW_SECONDS)}s | samples={safeNumber(controlLatency.overall?.samples, 0)} |
          failures={safeNumber(controlLatency.overall?.failures, 0)} | p50={safeNumber(controlLatency.overall?.p50_latency_ms, 0)}ms |
          p95={safeNumber(controlLatency.overall?.p95_latency_ms, 0)}ms
        </p>
        {Object.entries(controlLatency.protocols || {}).length ? (
          <div className="chip-row">
            {Object.entries(controlLatency.protocols).map(([protocol, stats]) => (
              <span className="chip" key={protocol}>
                {protocol}: p95 {safeNumber(stats?.p95_latency_ms, 0)}ms / err {safeNumber(stats?.failure_rate, 0)}
              </span>
            ))}
          </div>
        ) : null}
        {latencyError ? <p className="error">{latencyError}</p> : null}

        {error ? <p className="error">{error}</p> : null}
        {statusData.read_error ? <p className="error">{statusData.read_error}</p> : null}
      </section>
    </>
  );
}

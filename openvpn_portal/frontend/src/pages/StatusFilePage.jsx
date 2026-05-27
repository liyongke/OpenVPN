import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getStatusFile } from "../api/client";

const portalIconUrl = "/static/openvpn-icon.svg";

const EMPTY_STATUS = {
  status_file: "",
  read_error: "",
  raw_text: "",
  status_exists: false,
  updated_at: "",
  generated_at: "",
  status_sources: [],
};

const STATUS_LINE_COUNT = 800;

export function StatusFilePage() {
  const [searchParams] = useSearchParams();
  const selectedFile = searchParams.get("file") || "";
  const sourceFilter = (searchParams.get("filter") || "all").toLowerCase();
  const [statusData, setStatusData] = useState(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedSources, setExpandedSources] = useState({});
  const [sourceLoading, setSourceLoading] = useState({});
  const [sourceLogs, setSourceLogs] = useState({});

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

  const statusSources = useMemo(() => statusData.status_sources || [], [statusData.status_sources]);

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
        },
      }));
    } catch (fetchError) {
      setSourceLogs((prev) => ({
        ...prev,
        [sourcePath]: {
          raw_text: "",
          read_error: fetchError.message || "Failed to load status file",
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
                <Link className="chip-link" to="/status-file?filter=all">
                  <strong>{statusSources.length}</strong> all
                </Link>
              </span>
              <span className={`chip ${sourceFilter === "live" ? "is-active" : ""}`}>
                <Link className="chip-link" to="/status-file?filter=live">
                  <strong>{liveCount}</strong> live
                </Link>
              </span>
              <span className={`chip ${sourceFilter === "offline" ? "is-active" : ""}`}>
                <Link className="chip-link" to="/status-file?filter=offline">
                  <strong>{offlineCount}</strong> offline
                </Link>
              </span>
            </div>
          </div>
        </div>
        <p className="sub">Showing the latest lines from selected OpenVPN status sources.</p>
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

        {filteredSources.length ? (
          <>
            <p className="hint">View logs per source:</p>
            <div className="source-list">
              {filteredSources.map((source) => {
                const sourcePath = source.path;
                const isExpanded = Boolean(expandedSources[sourcePath]);
                const isBusy = Boolean(sourceLoading[sourcePath]);
                const payload = sourceLogs[sourcePath];

                return (
                  <article className="source-item" key={sourcePath}>
                    <div className="source-head">
                      <p className="source-path">{sourcePath}</p>
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
                      }
                    </p>

                    {isExpanded ? (
                      <div className="source-log-panel">
                        <p className="status-scroll-hint">Showing the latest {STATUS_LINE_COUNT} lines for this source.</p>
                        {isBusy ? (
                          <p className="section-empty">Loading log view...</p>
                        ) : payload?.read_error ? (
                          <p className="error">{payload.read_error}</p>
                        ) : payload?.raw_text ? (
                          <pre className="status-content status-content-inline">{payload.raw_text}</pre>
                        ) : (
                          <p className="section-empty">No readable content available.</p>
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

        {error ? <p className="error">{error}</p> : null}
        {statusData.read_error ? <p className="error">{statusData.read_error}</p> : null}
      </section>

      <section className="panel section-panel">
        <details className="raw-view">
          <summary className="raw-view-summary">Full Raw View</summary>
          <div className="raw-view-body">
            <p className="status-scroll-hint">Legacy single-block raw output, kept for quick copy or full-file scanning.</p>
            {loading ? (
              <p className="section-empty">Loading status explorer...</p>
            ) : statusData.read_error ? (
              <p className="error">{statusData.read_error}</p>
            ) : statusData.raw_text ? (
              <pre className="status-content">{statusData.raw_text}</pre>
            ) : (
              <p className="section-empty">No readable content available.</p>
            )}
          </div>
        </details>
      </section>
    </>
  );
}

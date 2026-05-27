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

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    getStatusFile(selectedFile, STATUS_LINE_COUNT)
      .then((payload) => {
        if (mounted) {
          setStatusData(payload);
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
            <p className="hint">Switch source:</p>
            <div className="source-list">
              {filteredSources.map((source) => (
                <article className="source-item" key={source.path}>
                  <p className="source-path">
                    <Link to={`/status-file?file=${encodeURIComponent(source.path)}&filter=${sourceFilter}`}>
                      {source.path}
                    </Link>
                  </p>
                  <p className="source-meta">
                    protocol={source.protocol || "unknown"} | exists={String(Boolean(source.exists))} | sessions={
                      source.session_count || 0
                    }
                  </p>
                </article>
              ))}
            </div>
          </>
        ) : statusSources.length ? (
          <p className="section-empty">No sources match the selected filter.</p>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
        {statusData.read_error ? <p className="error">{statusData.read_error}</p> : null}
      </section>

      <section className="panel section-panel">
        <h2>Last {STATUS_LINE_COUNT} Lines</h2>
        <p className="status-scroll-hint">
          Scroll inside the panel to inspect older lines from the latest {STATUS_LINE_COUNT} entries.
        </p>
        {loading ? (
          <p className="section-empty">Loading status explorer...</p>
        ) : statusData.raw_text ? (
          <pre className="status-content">{statusData.raw_text}</pre>
        ) : (
          <p className="section-empty">No readable content available.</p>
        )}
      </section>
    </>
  );
}

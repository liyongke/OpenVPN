import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getStatusFile } from "../api/client";

const EMPTY_STATUS = {
  status_file: "",
  read_error: "",
  raw_text: "",
  status_exists: false,
  updated_at: "",
  generated_at: "",
  status_sources: [],
};

export function StatusFilePage() {
  const [searchParams] = useSearchParams();
  const selectedFile = searchParams.get("file") || "";
  const [statusData, setStatusData] = useState(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    getStatusFile(selectedFile, 400)
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

  return (
    <>
      <header className="top hero">
        <div className="brand-row">
          <div className="brand-title">
            <img className="brand-icon" src="/static/openvpn-icon.svg" alt="OpenVPN icon" />
            <div>
              <p className="eyebrow">OpenVPN Ops Portal</p>
              <h1>Status File Viewer</h1>
            </div>
          </div>
          <div className="live-pill">Read-only source</div>
        </div>
        <p className="sub">Showing the latest lines from a selected OpenVPN status source.</p>
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

        {statusSources.length ? (
          <>
            <p className="hint">Switch source:</p>
            <div className="source-list">
              {statusSources.map((source) => (
                <article className="source-item" key={source.path}>
                  <p className="source-path">
                    <Link to={`/status-file?file=${encodeURIComponent(source.path)}`}>{source.path}</Link>
                  </p>
                  <p className="source-meta">
                    protocol={source.protocol || "unknown"} | sessions={source.session_count || 0}
                  </p>
                </article>
              ))}
            </div>
          </>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
        {statusData.read_error ? <p className="error">{statusData.read_error}</p> : null}
      </section>

      <section className="panel section-panel">
        <h2>Last 400 Lines</h2>
        {loading ? (
          <p className="section-empty">Loading status file...</p>
        ) : statusData.raw_text ? (
          <pre className="status-content">{statusData.raw_text}</pre>
        ) : (
          <p className="section-empty">No readable content available.</p>
        )}
      </section>
    </>
  );
}

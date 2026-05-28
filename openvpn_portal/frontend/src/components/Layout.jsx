import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { getPortalStatus } from "../api/client";

const portalIconUrl = "/static/openvpn-icon.svg";

function NavItem({ to, label, iconPath, muted = false }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => {
        const classes = ["nav-link"];
        if (isActive) {
          classes.push("active");
        }
        if (muted) {
          classes.push("muted");
        }
        return classes.join(" ");
      }}
    >
      <span className="nav-link-content">
        <svg className="nav-link-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d={iconPath} />
        </svg>
        <span>{label}</span>
      </span>
    </NavLink>
  );
}

export function Layout({ children }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [portalStatus, setPortalStatus] = useState({
    backend_online: false,
    source_freshness_seconds: null,
    source_live: 0,
    source_total: 0,
    sse_subscribers: 0,
    sse_latency_hint_ms: 0,
  });

  useEffect(() => {
    document.title = "OpenVPN";
  }, []);

  useEffect(() => {
    let mounted = true;

    const refreshHealth = async () => {
      try {
        const payload = await getPortalStatus();
        if (mounted) {
          setPortalStatus(payload);
        }
      } catch {
        if (mounted) {
          setPortalStatus((prev) => ({
            ...prev,
            backend_online: false,
          }));
        }
      }
    };

    refreshHealth();
    const interval = window.setInterval(refreshHealth, 15000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="bg-orb orb-a" aria-hidden="true" />
      <div className="bg-orb orb-b" aria-hidden="true" />

      <aside className={`side-nav panel ${isCollapsed ? "collapsed" : ""}`}>
        <button
          type="button"
          className="side-brand-toggle side-brand"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!isCollapsed}
          onClick={() => setIsCollapsed((prev) => !prev)}
        >
          <span className="side-brand-icon-wrap">
            <img className="brand-icon" src={portalIconUrl} alt="OpenVPN icon" />
          </span>
          <div className="side-brand-meta">
            <div className="side-brand-title-row">
              <h1 className="side-brand-name">OpenVPN Portal</h1>
            </div>
          </div>
        </button>
        <div className="side-brand-divider" aria-hidden="true" />

        <div className="api-state" aria-live="polite">
          <span className={`api-dot ${portalStatus.backend_online ? "online" : "offline"}`} />
          <span>{portalStatus.backend_online ? "Backend online" : "Backend offline"}</span>
        </div>

        <div className="sidebar-stats">
          <span>
            Sources <strong>{portalStatus.source_live}</strong>/{portalStatus.source_total}
          </span>
          <span>
            Freshness <strong>{portalStatus.source_freshness_seconds ?? "n/a"}s</strong>
          </span>
          <span>
            SSE subs <strong>{portalStatus.sse_subscribers}</strong>
          </span>
          <span>
            SSE lag <strong>{portalStatus.sse_latency_hint_ms}ms</strong>
          </span>
        </div>

        <nav className="nav-links" aria-label="Primary navigation">
          <NavItem
            to="/"
            label="Dashboard"
            iconPath="M3 4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4zm0 10a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7zm10-10a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V4zm0 10a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7z"
          />
          <NavItem
            to="/status-file"
            label="Status Explorer"
            iconPath="M12 4c5.8 0 9.4 6.5 9.5 6.8a1 1 0 0 1 0 .4C21.4 11.5 17.8 18 12 18S2.6 11.5 2.5 11.2a1 1 0 0 1 0-.4C2.6 10.5 6.2 4 12 4zm0 2c-3.9 0-6.7 3.9-7.5 5 .8 1.1 3.6 5 7.5 5s6.7-3.9 7.5-5c-.8-1.1-3.6-5-7.5-5zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z"
          />
          <NavItem
            to="/operations"
            label="Operations Center"
            iconPath="M13.9 2.6a1 1 0 0 0-1.8 0l-.5 1.2a7.8 7.8 0 0 0-1.7.7L8.7 3.8a1 1 0 0 0-1.3.2L5.9 5.5a1 1 0 0 0-.2 1.3l.7 1.2a7.8 7.8 0 0 0-.7 1.7l-1.2.5a1 1 0 0 0 0 1.8l1.2.5c.1.6.4 1.2.7 1.7l-.7 1.2a1 1 0 0 0 .2 1.3l1.5 1.5a1 1 0 0 0 1.3.2l1.2-.7c.6.3 1.1.5 1.7.7l.5 1.2a1 1 0 0 0 1.8 0l.5-1.2c.6-.1 1.2-.4 1.7-.7l1.2.7a1 1 0 0 0 1.3-.2l1.5-1.5a1 1 0 0 0 .2-1.3l-.7-1.2c.3-.6.5-1.1.7-1.7l1.2-.5a1 1 0 0 0 0-1.8l-1.2-.5a7.8 7.8 0 0 0-.7-1.7l.7-1.2a1 1 0 0 0-.2-1.3L16.6 4a1 1 0 0 0-1.3-.2l-1.2.7a7.8 7.8 0 0 0-1.7-.7l-.5-1.2zM13 8.5a2.5 2.5 0 1 1-2 4.6 2.5 2.5 0 0 1 2-4.6z"
            muted
          />
        </nav>
      </aside>

      <main className="container dashboard-shell">{children}</main>
    </div>
  );
}

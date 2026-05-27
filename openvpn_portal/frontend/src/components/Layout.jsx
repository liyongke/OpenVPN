import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { getPortalStatus } from "../api/client";

const portalIconUrl = "/static/openvpn-icon.svg";

function NavItem({ to, label, muted = false }) {
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
      {label}
    </NavLink>
  );
}

export function Layout({ children }) {
  const [portalStatus, setPortalStatus] = useState({
    backend_online: false,
    source_freshness_seconds: null,
    source_live: 0,
    source_total: 0,
    sse_subscribers: 0,
    sse_latency_hint_ms: 0,
  });

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

      <aside className="side-nav panel">
        <div className="side-brand">
          <img className="brand-icon" src={portalIconUrl} alt="OpenVPN icon" />
          <div>
            <p className="eyebrow">OpenVPN Ops Portal</p>
            <h1>Portal SPA</h1>
          </div>
        </div>

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
          <NavItem to="/" label="Dashboard" />
          <NavItem to="/status-file" label="Status Explorer" />
          <NavItem to="/operations" label="Operations Center" muted />
        </nav>
      </aside>

      <main className="container dashboard-shell">{children}</main>
    </div>
  );
}

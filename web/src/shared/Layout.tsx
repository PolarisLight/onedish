import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { DemoBadge } from "../demo/DemoBadge";

export function Layout() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/"><span className="brand-mark" />OneDish</Link>
        <nav className="nav" aria-label="Main navigation">
          <Link to="/history">Taste Orbit</Link>
          <Link to="/privacy">Privacy</Link>
          <DemoBadge />
        </nav>
      </header>
      <Outlet />
      <nav className="mobile-dock" aria-label="Mobile navigation">
        <Link to="/">Today</Link>
        <Link to="/history">Taste Orbit</Link>
        <Link to="/privacy">Privacy</Link>
      </nav>
    </div>
  );
}

import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { DemoBadge } from "../demo/DemoBadge";
import { LocaleSwitch } from "../i18n/LocaleSwitch";
import { useLocale } from "../i18n/locale";

export function Layout() {
  const location = useLocation();
  const { t } = useLocale();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/"><span className="brand-mark" />OneDish</Link>
        <nav className="nav" aria-label={t("nav.main")}>
          <Link to="/history">{t("nav.orbit")}</Link>
          <Link to="/privacy">{t("nav.privacy")}</Link>
          <LocaleSwitch />
          {location.pathname === "/demo" || /^\/(choose|winner|nearby)\//.test(location.pathname) ? <DemoBadge /> : null}
        </nav>
      </header>
      <Outlet />
      <nav className="mobile-dock" aria-label={t("nav.mobile")}>
        <Link to="/">{t("nav.today")}</Link>
        <Link to="/history">{t("nav.orbit")}</Link>
        <Link to="/privacy">{t("nav.privacy")}</Link>
      </nav>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router";
import { useLocale } from "../i18n/locale";
import { startRecommendation } from "../recommendation/session";

export function OfflineDemoHomePage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function choose() {
    setBusy(true);
    setError("");
    try {
      const record = await startRecommendation({ quickState: null });
      navigate(`/choose/${record.decision.decision_id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("home.pickError"));
    } finally { setBusy(false); }
  }
  return <main className="home one-tap-home"><section className="hero one-tap-hero">
    <div className="hero-copy"><p className="hero-kicker">{t("offline.kicker")}</p>
      <h1>{t("home.title.before")}<span>{t("home.title.accent")}</span></h1>
      <p className="hero-lede">{t("offline.body")}</p>
      <div className="hero-actions"><button className="primary-button" onClick={() => void choose()} disabled={busy}>{busy ? t("home.picking") : t("home.pick")}</button></div>
      <p className="home-error">{error}</p>
    </div>
    <div className="hero-visual"><img className="hero-photo" src={`${import.meta.env.BASE_URL}food/ember-bowl-charred-chicken-rice.webp`} alt={t("home.previewAlt")} /></div>
  </section></main>;
}

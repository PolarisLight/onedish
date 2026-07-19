import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AnimatedCount } from "../elimination/AnimatedCount";
import { useLocale } from "../i18n/locale";
import { getRestaurantSession } from "./session-store";

export function RestaurantEliminationPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useLocale();
  const session = getRestaurantSession(sessionId);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [index, setIndex] = useState(reduced && session ? session.response.trace.length - 1 : 0);
  useEffect(() => {
    if (!session || reduced || index >= session.response.trace.length - 1) return;
    const timer = window.setTimeout(() => setIndex((value) => value + 1), 600);
    return () => window.clearTimeout(timer);
  }, [index, reduced, session]);
  if (!session) return <main className="error-state"><h1>{t("restaurant.sessionGone")}</h1><button className="primary-button" onClick={() => navigate("/")}>{t("decision.startAgain")}</button></main>;
  const trace = session.response.trace;
  const stage = trace[Math.min(index, trace.length - 1)];
  if (!stage) return <main className="error-state"><h1>{t("restaurant.sessionGone")}</h1></main>;
  const complete = index >= trace.length - 1;
  return <main className="page elimination-screen restaurant-elimination">
    <section className="elimination-copy"><p className="hero-kicker">{complete ? t("restaurant.ready") : t("restaurant.choosing")}</p><h1 className="page-title">{t("restaurant.eliminationTitle")}</h1><div className="big-count"><AnimatedCount value={stage.survivor_count} reducedMotion={reduced} /></div><p className="page-lede">{t(`restaurant.stage.${stage.id}`)}</p></section>
    <div className="restaurant-filter-visual" aria-hidden="true"><span /><span /><span /><strong>{stage.survivor_count}</strong></div>
    <div className="trace-progress"><span style={{ width: `${((index + 1) / trace.length) * 100}%` }} /></div>
    <div className="safe-area-actions"><button className="text-button" onClick={() => navigate("/")}>{t("decision.restart")}</button>{complete ? <button className="primary-button" onClick={() => navigate(`/restaurants/winner/${sessionId}`)}>{t("restaurant.meet")}</button> : <button className="secondary-button" onClick={() => setIndex(trace.length - 1)}>{t("decision.skip")}</button>}</div>
  </main>;
}

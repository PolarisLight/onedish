import { useEffect, useMemo, useState } from "react";
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
  const steps = useMemo(() => {
    if (!session) return [];
    const search = session.response.search_rounds.map((round) => ({
      id: `search-${round.radius_m}`,
      count: round.discovered_count,
      label: t("restaurant.stage.search", {
        radius: round.radius_m / 1000,
        count: round.discovered_count,
      }),
    }));
    const active = session.response.search_rounds.at(-1)!;
    return [
      ...search,
      {
        id: "eligible",
        count: active.eligible_count,
        label: t("restaurant.stage.eligible", { count: active.eligible_count }),
      },
      {
        id: "pool",
        count: session.response.quality_pool_count,
        label: t("restaurant.stage.pool", { count: session.response.quality_pool_count }),
      },
    ];
  }, [session, t]);
  const [index, setIndex] = useState(reduced && steps.length ? steps.length - 1 : 0);

  useEffect(() => {
    if (!session || reduced || index >= steps.length - 1) return;
    const timer = window.setTimeout(() => setIndex((value) => value + 1), 700);
    return () => window.clearTimeout(timer);
  }, [index, reduced, session, steps.length]);

  if (!session) {
    return (
      <main className="error-state">
        <h1>{t("restaurant.sessionGone")}</h1>
        <button className="primary-button" onClick={() => navigate("/")}>
          {t("decision.startAgain")}
        </button>
      </main>
    );
  }
  const step = steps[Math.min(index, steps.length - 1)];
  if (!step) return <main className="error-state"><h1>{t("restaurant.sessionGone")}</h1></main>;
  const complete = index >= steps.length - 1;
  return (
    <main className="page elimination-screen restaurant-elimination">
      <section className="elimination-copy">
        <p className="hero-kicker">
          {complete ? t("restaurant.ready") : t("restaurant.choosing")}
        </p>
        <h1 className="page-title">{t("restaurant.eliminationTitle")}</h1>
        <div className="big-count">
          <AnimatedCount value={step.count} reducedMotion={reduced} />
        </div>
        <p className="page-lede">{step.label}</p>
      </section>
      <div className="restaurant-filter-visual" aria-hidden="true">
        <span /><span /><span /><strong>{step.count}</strong>
      </div>
      <div className="trace-progress">
        <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>
      <div className="safe-area-actions">
        <button className="text-button" onClick={() => navigate("/")}>
          {t("decision.restart")}
        </button>
        {complete ? (
          <button
            className="primary-button"
            onClick={() => navigate(`/restaurants/winner/${sessionId}`)}
          >
            {t("restaurant.meet")}
          </button>
        ) : (
          <button className="secondary-button" onClick={() => setIndex(steps.length - 1)}>
            {t("decision.skip")}
          </button>
        )}
      </div>
    </main>
  );
}

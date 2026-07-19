import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { formatDistance, formatMoney } from "../i18n/locale-utils";
import { useLocale } from "../i18n/locale";
import { RestaurantEvidence } from "./RestaurantEvidence";
import { getCurrentRestaurant, getRestaurantSession, pickAnotherRestaurant } from "./session-store";

export function RestaurantWinnerPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { locale, t } = useLocale();
  const session = getRestaurantSession(sessionId);
  const [current, setCurrent] = useState(() => getCurrentRestaurant(sessionId));
  const [exhausted, setExhausted] = useState(false);
  if (!current || !session) return <main className="error-state"><h1>{t("restaurant.sessionGone")}</h1><button className="primary-button" onClick={() => navigate("/")}>{t("decision.startAgain")}</button></main>;
  const { candidate } = current;
  const safeNavigation = candidate.navigation_url?.startsWith("https://") ? candidate.navigation_url : null;
  function another() {
    const next = pickAnotherRestaurant(sessionId);
    if (next) setCurrent(next); else setExhausted(true);
  }
  return <main className="winner restaurant-winner"><div className="restaurant-result-card">
    <p className="sr-only" aria-live="polite" aria-atomic="true">{candidate.name}</p>
    <p className="hero-kicker">{t("restaurant.yourPlace")}</p><p className="restaurant-source">{candidate.attribution}</p><h1>{candidate.name}</h1>
    <p className="restaurant-category">{candidate.category ?? candidate.cuisine_tags.join(" · ")}</p>
    <div className="restaurant-fact-grid"><div><strong>{formatDistance(candidate.distance_m, locale)}</strong><span>{t("restaurant.distance")}</span></div>{candidate.evidence.average_cost && candidate.average_cost_minor !== null && candidate.currency !== null ? <div><strong>{formatMoney(candidate.average_cost_minor, locale, candidate.currency)}</strong><span>{t("restaurant.perPerson")}</span></div> : null}{candidate.evidence.rating && candidate.rating !== null ? <div><strong>{candidate.rating.toFixed(1)}</strong><span>{t("restaurant.rating")}</span></div> : null}</div>
    <p className="restaurant-mode">{t(`restaurant.mode.${session.response.recommendation_mode}`)}</p>
    <RestaurantEvidence reasons={current.reason_codes} />
    {candidate.source_kind === "amap_place" ? <p className="active-only-note">{t("restaurant.activeOnly")}</p> : null}
    <div className="winner-actions">{safeNavigation ? <a className="primary-button action-link-button" href={safeNavigation} target="_blank" rel="noopener noreferrer">{t("restaurant.goHere")}</a> : null}<button className="secondary-button" onClick={another} disabled={exhausted}>{exhausted ? t("restaurant.noMore") : t("winner.another")}</button></div>
  </div></main>;
}

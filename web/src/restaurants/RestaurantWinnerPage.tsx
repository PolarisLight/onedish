import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { saveRestaurantIntent } from "../db/db";
import { useLocale } from "../i18n/locale";
import { formatDistance, formatMoney } from "../i18n/locale-utils";
import { restaurantIntentLabel } from "./intent-tags";
import { RestaurantEvidence } from "./RestaurantEvidence";
import {
  getCurrentRestaurant,
  getRestaurantSession,
  pickAnotherRestaurant,
} from "./session-store";
import type { RankedRestaurant } from "./types";


function budgetBand(budgetMinor: number, currency: "CNY" | "USD"): number {
  const step = currency === "CNY" ? 2500 : 500;
  return Math.max(step, Math.floor(budgetMinor / step) * step);
}

export function RestaurantWinnerPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { locale, t } = useLocale();
  const session = getRestaurantSession(sessionId);
  const [current, setCurrent] = useState<RankedRestaurant | null>(() => (
    getCurrentRestaurant(sessionId)
  ));
  const [exhausted, setExhausted] = useState(false);
  const [navigationError, setNavigationError] = useState("");

  if (!current || !session) {
    return (
      <main className="error-state">
        <h1>{t("restaurant.sessionGone")}</h1>
        <button className="primary-button" onClick={() => navigate("/")}>
          {t("decision.startAgain")}
        </button>
      </main>
    );
  }
  const winner = current;
  const restaurantSession = session;
  const { candidate } = winner;
  const safeNavigation = candidate.navigation_url?.startsWith("https://")
    ? candidate.navigation_url
    : null;
  const matched = winner.matched_tags.map((tag) => restaurantIntentLabel(tag, locale));
  const fallbackCategory = candidate.intent_tags
    .map((tag) => restaurantIntentLabel(tag, locale))
    .join(" · ");

  function another() {
    const next = pickAnotherRestaurant(sessionId);
    if (next) {
      setCurrent(next);
      setNavigationError("");
    } else {
      setExhausted(true);
    }
  }

  function budgetMessage(): string {
    if (winner.budget_state === "within") return t("restaurant.budget.within");
    if (winner.budget_state === "unknown") return t("restaurant.budget.unknown");
    if (winner.budget_state === "not_requested") return t("restaurant.budget.notRequested");
    return t("restaurant.budget.stretch", {
      amount: formatMoney(
        winner.budget_overage_minor ?? 0,
        locale,
        restaurantSession.request.profile.currency,
      ),
    });
  }

  async function goHere() {
    if (!safeNavigation) return;
    const selectedTags = restaurantSession.request.profile.selected_tags;
    try {
      if (selectedTags.length > 0) {
        await saveRestaurantIntent({
          id: crypto.randomUUID(),
          occurred_at: new Date().toISOString(),
          action: "accepted",
          selected_tags: [...selectedTags],
          budget_band_minor: restaurantSession.request.profile.budget_is_explicit
            ? budgetBand(
              restaurantSession.request.profile.budget_minor,
              restaurantSession.request.profile.currency,
            )
            : null,
        });
      }
      window.open(safeNavigation, "_blank", "noopener,noreferrer");
    } catch {
      setNavigationError(t("restaurant.intentSaveError"));
    }
  }

  return (
    <main className="winner restaurant-winner">
      <div className="restaurant-result-card">
        <p className="sr-only" aria-live="polite" aria-atomic="true">{candidate.name}</p>
        <p className="hero-kicker">{t("restaurant.yourPlace")}</p>
        <p className="restaurant-source">{candidate.attribution}</p>
        <h1>{candidate.name}</h1>
        <p className="restaurant-category">{candidate.category ?? fallbackCategory}</p>
        <div className="restaurant-fact-grid">
          <div>
            <strong>{formatDistance(candidate.distance_m, locale)}</strong>
            <span>{t("restaurant.distance")}</span>
          </div>
          {candidate.evidence.average_cost
            && candidate.average_cost_minor !== null
            && candidate.currency !== null ? (
              <div>
                <strong>{formatMoney(candidate.average_cost_minor, locale, candidate.currency)}</strong>
                <span>{t("restaurant.perPerson")}</span>
              </div>
            ) : null}
          {candidate.evidence.rating && candidate.rating !== null ? (
            <div>
              <strong>{candidate.rating.toFixed(1)}</strong>
              <span>{t("restaurant.rating")}</span>
            </div>
          ) : null}
        </div>
        <div className="restaurant-result-evidence">
          <p>{t("restaurant.searchRadius", { radius: restaurantSession.response.active_radius_m / 1000 })}</p>
          {matched.length > 0 ? (
            <p>{t("restaurant.matches", { tags: matched.join(" · ") })}</p>
          ) : null}
          <p className={`restaurant-budget-state budget-${winner.budget_state}`}>
            {budgetMessage()}
          </p>
        </div>
        <RestaurantEvidence reasons={winner.reason_codes} />
        {candidate.persistence === "active_only" ? (
          <p className="active-only-note">{t("restaurant.activeOnly")}</p>
        ) : null}
        <p className="home-error" role="status">{navigationError}</p>
        <div className="winner-actions">
          {safeNavigation ? (
            <button className="primary-button" onClick={() => void goHere()}>
              {t("restaurant.goHere")}
            </button>
          ) : null}
          <button className="secondary-button" onClick={another} disabled={exhausted}>
            {exhausted ? t("restaurant.noMore") : t("winner.another")}
          </button>
        </div>
      </div>
    </main>
  );
}

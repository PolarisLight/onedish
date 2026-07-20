import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { RestaurantRequestError } from "../api/client";
import {
  getRecentRestaurantIntents,
  getRestaurantPreferences,
  saveRestaurantPreferences,
} from "../db/db";
import { useLocale } from "../i18n/locale";
import { formatMoney } from "../i18n/locale-utils";
import { requestCurrentLocation } from "../location/geolocation";
import { LandmarkPicker } from "../location/LandmarkPicker";
import { isSelectedPoi, type SelectedPoi } from "../location/landmark-selection";
import { LocationConsentDialog } from "../privacy/LocationConsentDialog";
import { recordPrivacyAccess } from "../privacy/privacy-store";
import { ProfileSheet } from "../profile/ProfileSheet";
import { restaurantIntentLabel } from "../restaurants/intent-tags";
import {
  restaurantPreferenceDefaults,
  type RestaurantPreferences,
} from "../restaurants/preferences";
import { startRestaurantRecommendation } from "../restaurants/start";
import type { RestaurantRecoveryAction } from "../restaurants/types";


const XIAMEN_CENTER = { latitude: 24.4798, longitude: 118.0894 };
type Point = { readonly latitude: number; readonly longitude: number };
type JourneyState =
  | "idle"
  | "consent"
  | "landmark"
  | "locating"
  | "recommending"
  | "location_error"
  | "no_match"
  | "provider_error";

export function HomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { locale, t } = useLocale();
  const [preferences, setPreferences] = useState<RestaurantPreferences>(() => (
    restaurantPreferenceDefaults(locale)
  ));
  const [adjusting, setAdjusting] = useState(searchParams.get("adjust") === "1");
  const [state, setState] = useState<JourneyState>("idle");
  const [error, setError] = useState("");
  const [lastPoint, setLastPoint] = useState<Point | null>(null);
  const [recoveryActions, setRecoveryActions] = useState<readonly RestaurantRecoveryAction[]>([]);
  const adjustButton = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const journeyOperation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      journeyOperation.current += 1;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const defaults = restaurantPreferenceDefaults(locale);
    void getRestaurantPreferences(defaults).then((stored) => {
      if (active) setPreferences(stored);
    });
    return () => { active = false; };
  }, [locale]);

  const closeAdjust = useCallback(() => {
    setAdjusting(false);
    if (searchParams.has("adjust")) setSearchParams({}, { replace: true });
    window.setTimeout(() => adjustButton.current?.focus(), 0);
  }, [searchParams, setSearchParams]);

  async function saveAdjustments(next: RestaurantPreferences) {
    await saveRestaurantPreferences(next);
    setPreferences(next);
    closeAdjust();
  }

  function beginJourney(): number {
    journeyOperation.current += 1;
    return journeyOperation.current;
  }

  function isCurrentJourney(operation: number): boolean {
    return mounted.current && journeyOperation.current === operation;
  }

  function openJourneyState(next: "consent" | "landmark") {
    beginJourney();
    setError("");
    setRecoveryActions([]);
    setState(next);
  }

  function closeJourney() {
    beginJourney();
    setState("idle");
  }

  async function startAt(
    point: Point,
    operation = beginJourney(),
    scopedPreferences: RestaurantPreferences = preferences,
  ) {
    if (!isCurrentJourney(operation)) return;
    setLastPoint(point);
    setState("recommending");
    setError("");
    setRecoveryActions([]);
    try {
      const recentIntents = await getRecentRestaurantIntents(14, new Date());
      if (!isCurrentJourney(operation)) return;
      const id = await startRestaurantRecommendation(
        { point, locale, preferences: scopedPreferences, recentIntents },
        { canCommit: () => isCurrentJourney(operation) },
      );
      if (!id || !isCurrentJourney(operation)) return;
      navigate(`/restaurants/choose/${id}`);
    } catch (caught) {
      if (!isCurrentJourney(operation)) return;
      if (caught instanceof RestaurantRequestError) {
        setRecoveryActions(caught.recoveryActions);
        setState(caught.code === "no_match" ? "no_match" : "provider_error");
        return;
      }
      setState("idle");
      setError(caught instanceof Error ? caught.message : t("restaurant.error"));
    }
  }

  async function recover(action: RestaurantRecoveryAction | "retry") {
    if (!lastPoint) return;
    const scoped = action === "clear_tags"
      ? { ...preferences, selected_tags: [] }
      : action === "ignore_budget"
        ? { ...preferences, budget_is_explicit: false }
        : preferences;
    const operation = beginJourney();
    await startAt(lastPoint, operation, scoped);
  }

  async function allowLocation() {
    const operation = beginJourney();
    setState("locating");
    try {
      const point = await requestCurrentLocation({ timeoutMs: 8000 });
      if (!isCurrentJourney(operation)) return;
      try {
        await recordPrivacyAccess({
          category: "precise_location",
          purpose: "nearby_map",
          recipient: "AMap",
        });
      } catch {
        // The coordinate-free local audit is best-effort and must not block a consented search.
      }
      if (!isCurrentJourney(operation)) return;
      await startAt(point, operation);
    } catch {
      if (isCurrentJourney(operation)) setState("location_error");
    }
  }

  function startFromLandmark(poi: SelectedPoi) {
    if (!isSelectedPoi(poi)) return;
    const operation = beginJourney();
    void startAt({ latitude: poi.latitude, longitude: poi.longitude }, operation);
  }

  const journeyBusy = state === "locating" || state === "recommending";
  const tagSummary = preferences.selected_tags.length > 0
    ? preferences.selected_tags.map((tag) => restaurantIntentLabel(tag, locale)).join(" · ")
    : t("restaurant.summaryAny");
  const budgetSummary = preferences.budget_is_explicit
    ? formatMoney(preferences.budget_minor, locale)
    : t("restaurant.summaryNoBudget");

  return (
    <main className="home one-tap-home">
      <section className="hero one-tap-hero">
        <div className="hero-copy">
          <p className="hero-kicker">{t("restaurantHome.kicker")}</p>
          <h1>{t("home.title.before")}<span>{t("home.title.accent")}</span></h1>
          <p className="context-summary">{tagSummary} · {budgetSummary}</p>
          <p className="hero-lede">{t("restaurantHome.lede")}</p>
          <div className="hero-actions one-tap-actions">
            <button
              className="primary-button pick-meal-button"
              onClick={() => openJourneyState("consent")}
              disabled={journeyBusy}
            >
              {state === "locating"
                ? t("restaurant.locating")
                : state === "recommending"
                  ? t("restaurant.searching")
                  : t("restaurant.pick")}
            </button>
            <button
              ref={adjustButton}
              className="secondary-button"
              onClick={() => setAdjusting(true)}
              disabled={journeyBusy}
            >
              {t("home.adjust")}
            </button>
          </div>
          <button
            className="text-button choose-place-button"
            type="button"
            onClick={() => openJourneyState("landmark")}
            disabled={journeyBusy}
          >
            {t("restaurant.choosePlace")}
          </button>
          {state === "location_error" ? (
            <div className="location-recovery">
              <p>{t("restaurant.locationError")}</p>
              <button className="primary-button" onClick={() => void startAt(XIAMEN_CENTER)}>
                {t("restaurant.centralXiamen")}
              </button>
              <button className="secondary-button" onClick={() => setState("consent")}>
                {t("restaurant.retryLocation")}
              </button>
            </div>
          ) : null}
          {state === "no_match" ? (
            <div className="location-recovery" role="status">
              <p>{t("restaurant.noMatch")}</p>
              {recoveryActions.includes("clear_tags") ? (
                <button className="primary-button" onClick={() => void recover("clear_tags")}>
                  {t("restaurant.clearTags")}
                </button>
              ) : null}
              {recoveryActions.includes("ignore_budget") ? (
                <button className="secondary-button" onClick={() => void recover("ignore_budget")}>
                  {t("restaurant.ignoreBudget")}
                </button>
              ) : null}
            </div>
          ) : null}
          {state === "provider_error" ? (
            <div className="location-recovery" role="status">
              <p>{t("restaurant.providerUnavailable")}</p>
              <button className="primary-button" onClick={() => void recover("retry")}>
                {t("restaurant.retrySearch")}
              </button>
            </div>
          ) : null}
          <Link
            className="text-button offline-demo-link"
            to="/demo"
            aria-disabled={journeyBusy}
            tabIndex={journeyBusy ? -1 : undefined}
            onClick={(event) => { if (journeyBusy) event.preventDefault(); }}
          >
            {t("offline.open")}
          </Link>
          <p className="home-error" aria-live="polite">{error}</p>
        </div>
        <div className="hero-visual one-tap-visual" aria-label={t("restaurantHome.preview")}>
          <img
            className="hero-photo"
            src={`${import.meta.env.BASE_URL}food/night-market.svg`}
            alt={t("restaurantHome.previewAlt")}
          />
          <div className="decision-stamp"><div><strong>1</strong><small>{t("restaurantHome.tapNote")}</small></div></div>
        </div>
      </section>
      {state === "consent" ? (
        <LocationConsentDialog restaurant onAllow={() => void allowLocation()} onCancel={closeJourney} />
      ) : null}
      {state === "landmark" ? (
        <LandmarkPicker onClose={closeJourney} onConfirm={startFromLandmark} />
      ) : null}
      {adjusting ? (
        <ProfileSheet
          preferences={preferences}
          onSave={saveAdjustments}
          onClose={closeAdjust}
        />
      ) : null}
    </main>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { getProfile, getRecentHistory, saveProfile } from "../db/db";
import { formatMoney } from "../i18n/locale-utils";
import { useLocale } from "../i18n/locale";
import { requestCurrentLocation } from "../location/geolocation";
import { LandmarkPicker } from "../location/LandmarkPicker";
import { isSelectedPoi, type SelectedPoi } from "../location/landmark-selection";
import { LocationConsentDialog } from "../privacy/LocationConsentDialog";
import { recordPrivacyAccess } from "../privacy/privacy-store";
import { ProfileSheet } from "../profile/ProfileSheet";
import { inferMealPeriod } from "../recommendation/context";
import type { SupportedLocale, UserProfile } from "../recommendation/types";
import { startRestaurantRecommendation } from "../restaurants/start";

const XIAMEN_CENTER = { latitude: 24.4798, longitude: 118.0894 };
type JourneyState = "idle" | "consent" | "landmark" | "locating" | "recommending" | "location_error";

function newProfile(locale: SupportedLocale): UserProfile {
  return { locale, excluded_allergens: [], excluded_ingredients: [], desired_taste_tags: [], preferred_cuisines: [], budget_minor: locale === "en" ? 2500 : 6000, budget_is_explicit: false, duration_minutes: 20 };
}

export function HomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { locale, setLocale, t } = useLocale();
  const [profile, setProfile] = useState<UserProfile>(() => newProfile(locale));
  const [adjusting, setAdjusting] = useState(searchParams.get("adjust") === "1");
  const [state, setState] = useState<JourneyState>("idle");
  const [error, setError] = useState("");
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
    void getProfile().then((stored) => {
      if (active) setProfile(stored ?? newProfile(locale));
    });
    return () => { active = false; };
  }, [locale]);
  const closeAdjust = useCallback(() => {
    setAdjusting(false);
    if (searchParams.has("adjust")) setSearchParams({}, { replace: true });
    window.setTimeout(() => adjustButton.current?.focus(), 0);
  }, [searchParams, setSearchParams]);
  async function saveAdjustments(next: UserProfile) {
    await saveProfile(next); await setLocale(next.locale); setProfile(next); closeAdjust();
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
    setState(next);
  }
  function closeJourney() {
    beginJourney();
    setState("idle");
  }
  async function startAt(point: { latitude: number; longitude: number }, operation = beginJourney()) {
    if (!isCurrentJourney(operation)) return;
    setState("recommending"); setError("");
    try {
      const now = new Date();
      const history = await getRecentHistory(14, now);
      if (!isCurrentJourney(operation)) return;
      const id = await startRestaurantRecommendation(
        { point, locale, profile, history, now },
        { canCommit: () => isCurrentJourney(operation) },
      );
      if (!id || !isCurrentJourney(operation)) return;
      navigate(`/restaurants/choose/${id}`);
    } catch (caught) {
      if (!isCurrentJourney(operation)) return;
      setState("idle");
      setError(caught instanceof Error ? caught.message : t("restaurant.error"));
    }
  }
  async function allowLocation() {
    const operation = beginJourney();
    setState("locating");
    try {
      const point = await requestCurrentLocation({ timeoutMs: 8000 });
      if (!isCurrentJourney(operation)) return;
      await recordPrivacyAccess({ category: "precise_location", purpose: "nearby_map", recipient: "AMap" });
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
  const period = t(`meal.${inferMealPeriod(new Date())}`);
  return <main className="home one-tap-home"><section className="hero one-tap-hero">
    <div className="hero-copy"><p className="hero-kicker">{t("restaurantHome.kicker")}</p>
      <h1>{t("home.title.before")}<span>{t("home.title.accent")}</span></h1>
      <p className="context-summary">{period} · {formatMoney(profile.budget_minor, locale)}</p>
      <p className="hero-lede">{t("restaurantHome.lede")}</p>
      <div className="hero-actions one-tap-actions">
        <button className="primary-button pick-meal-button" onClick={() => openJourneyState("consent")} disabled={journeyBusy}>{state === "locating" ? t("restaurant.locating") : state === "recommending" ? t("restaurant.searching") : t("restaurant.pick")}</button>
        <button ref={adjustButton} className="secondary-button" onClick={() => setAdjusting(true)} disabled={journeyBusy}>{t("home.adjust")}</button>
      </div>
      <button className="text-button choose-place-button" type="button" onClick={() => openJourneyState("landmark")} disabled={journeyBusy}>{t("restaurant.choosePlace")}</button>
      {state === "location_error" ? <div className="location-recovery"><p>{t("restaurant.locationError")}</p><button className="primary-button" onClick={() => void startAt(XIAMEN_CENTER)}>{t("restaurant.centralXiamen")}</button><button className="secondary-button" onClick={() => setState("consent")}>{t("restaurant.retryLocation")}</button></div> : null}
      <Link className="text-button offline-demo-link" to="/demo" aria-disabled={journeyBusy} tabIndex={journeyBusy ? -1 : undefined} onClick={(event) => { if (journeyBusy) event.preventDefault(); }}>{t("offline.open")}</Link>
      <p className="home-error" aria-live="polite">{error}</p>
    </div>
    <div className="hero-visual one-tap-visual" aria-label={t("restaurantHome.preview")}><img className="hero-photo" src={`${import.meta.env.BASE_URL}food/night-market.svg`} alt={t("restaurantHome.previewAlt")} /><div className="decision-stamp"><div><strong>1</strong><small>{t("restaurantHome.tapNote")}</small></div></div></div>
  </section>
  {state === "consent" ? <LocationConsentDialog restaurant onAllow={() => void allowLocation()} onCancel={closeJourney} /> : null}
  {state === "landmark" ? <LandmarkPicker onClose={closeJourney} onConfirm={startFromLandmark} /> : null}
  {adjusting ? <ProfileSheet profile={profile} onSave={saveAdjustments} onClose={closeAdjust} /> : null}
  </main>;
}

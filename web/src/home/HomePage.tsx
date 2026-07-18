import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { getProfile, saveProfile } from "../db/db";
import { formatMoney } from "../i18n/locale-utils";
import { useLocale } from "../i18n/locale";
import { inferMealPeriod } from "../recommendation/context";
import { startRecommendation } from "../recommendation/session";
import type { QuickState, SupportedLocale, UserProfile } from "../recommendation/types";
import { ProfileSheet } from "../profile/ProfileSheet";

function newProfile(locale: SupportedLocale): UserProfile {
  return {
    locale,
    excluded_allergens: [],
    excluded_ingredients: [],
    desired_taste_tags: [],
    budget_minor: locale === "en" ? 2500 : 6000,
    duration_minutes: 20,
  };
}

export function HomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { locale, setLocale, t } = useLocale();
  const [profile, setProfile] = useState<UserProfile>(() => newProfile(locale));
  const [quickState, setQuickState] = useState<QuickState>(null);
  const [adjusting, setAdjusting] = useState(searchParams.get("adjust") === "1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const adjustButton = useRef<HTMLButtonElement>(null);
  const assetBase = import.meta.env.BASE_URL;

  useEffect(() => {
    void getProfile().then((stored) => {
      if (stored) setProfile(stored);
      else setProfile(newProfile(locale));
    });
  }, [locale]);

  const closeAdjust = useCallback(() => {
    setAdjusting(false);
    if (searchParams.has("adjust")) setSearchParams({}, { replace: true });
    window.setTimeout(() => adjustButton.current?.focus(), 0);
  }, [searchParams, setSearchParams]);

  async function saveAdjustments(next: UserProfile) {
    await saveProfile(next);
    await setLocale(next.locale);
    setProfile(next);
    closeAdjust();
  }

  async function choose() {
    setBusy(true);
    setError("");
    try {
      const record = await startRecommendation({ quickState });
      navigate(`/choose/${record.decision.decision_id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("home.pickError"));
    } finally {
      setBusy(false);
    }
  }

  const mealPeriod = inferMealPeriod(new Date());
  const periodLabel = t(`meal.${mealPeriod}`);
  const summary = `${periodLabel} · ${formatMoney(profile.budget_minor, locale)} · ${t("profile.minutes", { count: profile.duration_minutes })}`;

  return (
    <main className="home one-tap-home">
      <section className="hero one-tap-hero">
        <div className="hero-copy">
          <p className="hero-kicker">{t("home.kicker")}</p>
          <h1>{t("home.title.before")}<span>{t("home.title.accent")}</span></h1>
          <p className="context-summary">{summary}</p>
          <p className="hero-lede">{t("home.lede")}</p>
          <div className="quick-states" aria-label={t("home.feeling")}>
            {([
              ["light", t("home.light")],
              ["hungry", t("home.hungry")],
              ["surprise", t("home.surprise")],
            ] as const).map(([value, label]) => (
              <button key={value} className={quickState === value ? "quick-state selected" : "quick-state"} aria-pressed={quickState === value} onClick={() => setQuickState(quickState === value ? null : value)}>{label}</button>
            ))}
          </div>
          <div className="hero-actions one-tap-actions">
            <button className="primary-button pick-meal-button" onClick={choose} disabled={busy}>{busy ? t("home.picking") : t("home.pick")}</button>
            <button ref={adjustButton} className="secondary-button" onClick={() => setAdjusting(true)}>{t("home.adjust")}</button>
          </div>
          <p className="home-error" aria-live="polite">{error}</p>
        </div>
        <div className="hero-visual one-tap-visual" aria-label={t("home.preview")}>
          <img className="hero-photo" src={`${assetBase}food/ember-bowl-charred-chicken-rice.webp`} alt={t("home.previewAlt")} fetchPriority="high" />
          <div className="decision-stamp"><div><strong>{t("home.tap")}</strong><small>{t("home.tapNote")}</small></div></div>
        </div>
      </section>
      {adjusting ? <ProfileSheet profile={profile} onSave={saveAdjustments} onClose={closeAdjust} /> : null}
    </main>
  );
}

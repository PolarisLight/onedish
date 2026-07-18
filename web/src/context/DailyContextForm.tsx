import { useState } from "react";
import type { SupportedLocale, UserProfile } from "../recommendation/types";
import { useLocale } from "../i18n/locale";

const allergens = ["peanuts", "milk", "soy", "gluten", "sesame"] as const;

function commaValues(value: string): string[] {
  return value.split(",").map((item) => item.trim().toLocaleLowerCase()).filter(Boolean);
}

export function DailyContextForm({
  initialProfile,
  onSubmit,
  onCancel,
}: {
  readonly initialProfile: UserProfile;
  readonly onSubmit: (profile: UserProfile) => Promise<void>;
  readonly onCancel: () => void;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [ingredients, setIngredients] = useState(initialProfile.excluded_ingredients.join(", "));
  const [tastes, setTastes] = useState(initialProfile.desired_taste_tags.join(", "));
  const [busy, setBusy] = useState(false);
  const { t } = useLocale();

  function toggleAllergen(allergen: string) {
    setProfile((current) => ({
      ...current,
      excluded_allergens: current.excluded_allergens.includes(allergen)
        ? current.excluded_allergens.filter((item) => item !== allergen)
        : [...current.excluded_allergens, allergen],
    }));
  }

  function changeLocale(locale: SupportedLocale) {
    setProfile((current) => ({
      ...current,
      locale,
      budget_minor: locale === "en" ? 2500 : 6000,
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        ...profile,
        excluded_ingredients: commaValues(ingredients),
        desired_taste_tags: commaValues(tastes),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label={t("profile.form")}>
      <div className="field">
        <label htmlFor="profile-locale">{t("profile.language")}</label>
        <select id="profile-locale" value={profile.locale} onChange={(event) => changeLocale(event.target.value as SupportedLocale)}>
          <option value="en">English · USD</option>
          <option value="zh-CN">中文 · 人民币</option>
        </select>
      </div>
      <fieldset className="allergen-fieldset">
        <legend>{t("profile.never")}</legend>
        <div className="check-grid">
          {allergens.map((value) => (
            <label key={value}>
              <input type="checkbox" checked={profile.excluded_allergens.includes(value)} onChange={() => toggleAllergen(value)} />
              <span>{t(`allergen.${value}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-grid compact-form-grid">
        <div className="field">
          <label htmlFor="profile-budget">{t("profile.maximum", { symbol: profile.locale === "en" ? "$" : "¥" })}</label>
          <input id="profile-budget" type="number" min="1" max="1000" step="1" value={profile.budget_minor / 100} onChange={(event) => setProfile({ ...profile, budget_minor: Math.round(Number(event.target.value) * 100) })} />
        </div>
        <div className="field">
          <label htmlFor="profile-duration">{t("profile.duration")}</label>
          <select id="profile-duration" value={profile.duration_minutes} onChange={(event) => setProfile({ ...profile, duration_minutes: Number(event.target.value) })}>
            <option value="15">15 min</option>
            <option value="20">20 min</option>
            <option value="30">30 min</option>
            <option value="45">45 min</option>
          </select>
        </div>
        <div className="field span-two">
          <label htmlFor="profile-ingredients">{t("profile.ingredients")}</label>
          <input id="profile-ingredients" value={ingredients} onChange={(event) => setIngredients(event.target.value)} placeholder={t("profile.ingredientsHint")} />
        </div>
        <div className="field span-two">
          <label htmlFor="profile-tastes">{t("profile.tastes")}</label>
          <input id="profile-tastes" value={tastes} onChange={(event) => setTastes(event.target.value)} placeholder={t("profile.tastesHint")} />
        </div>
      </div>
      <div className="form-actions sheet-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>{t("common.cancel")}</button>
        <button className="primary-button" disabled={busy}>{busy ? t("common.saving") : t("common.save")}</button>
      </div>
    </form>
  );
}

import { useEffect } from "react";
import { useLocale } from "../i18n/locale";
import { RestaurantPreferenceForm } from "../restaurants/RestaurantPreferenceForm";
import type { RestaurantPreferences } from "../restaurants/preferences";

export function ProfileSheet({
  preferences,
  onSave,
  onClose,
}: {
  readonly preferences: RestaurantPreferences;
  readonly onSave: (preferences: RestaurantPreferences) => Promise<void>;
  readonly onClose: () => void;
}) {
  const { t } = useLocale();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-sheet-title">
        <header className="sheet-header">
          <div>
            <p className="hero-kicker">{t("restaurantPreferences.kicker")}</p>
            <h2 id="profile-sheet-title">{t("restaurantPreferences.title")}</h2>
          </div>
          <button className="sheet-close" aria-label={t("restaurantPreferences.close")} onClick={onClose}>×</button>
        </header>
        <p className="sheet-lede">{t("restaurantPreferences.lede")}</p>
        <RestaurantPreferenceForm
          initialPreferences={preferences}
          onSubmit={onSave}
          onCancel={onClose}
        />
      </section>
    </div>
  );
}

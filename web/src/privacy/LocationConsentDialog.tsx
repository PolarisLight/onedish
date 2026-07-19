import { useEffect } from "react";
import { useLocale } from "../i18n/locale";

interface LocationConsentDialogProps {
  readonly onAllow: () => void;
  readonly onCancel: () => void;
  readonly restaurant?: boolean;
}

export function LocationConsentDialog({ onAllow, onCancel, restaurant = false }: LocationConsentDialogProps) {
  const { t } = useLocale();
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return <div className="privacy-dialog-backdrop location-consent-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="privacy-dialog location-consent" role="dialog" aria-modal="true" aria-labelledby="location-consent-title">
      <p className="hero-kicker">{t("consent.kicker")}</p>
      <h2 id="location-consent-title">{t(restaurant ? "restaurantConsent.title" : "consent.title")}</h2>
      <p>{t(restaurant ? "restaurantConsent.body" : "consent.body")}</p>
      <dl>
        <div><dt>{t("consent.data")}</dt><dd>{t("consent.dataValue")}</dd></div>
        <div><dt>{t("consent.recipient")}</dt><dd>{restaurant ? "AMap" : "AMap Places + OpenStreetMap"}</dd></div>
        <div><dt>{t("consent.retention")}</dt><dd>{t("consent.retentionValue")}</dd></div>
      </dl>
      <div className="location-consent-actions"><button className="secondary-button" onClick={onCancel}>{t("common.cancel")}</button><button className="primary-button" autoFocus onClick={onAllow}>{t("consent.allowOnce")}</button></div>
    </section>
  </div>;
}

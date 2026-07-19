import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { findNearbyPlaces } from "../api/client";
import { db } from "../db/db";
import { parseStoredDecision, type Place, type StoredDecision } from "../domain/contracts";
import { GeocoderError, geocodeArea } from "../location/geocoder";
import { LocationRequestError, requestCurrentLocation } from "../location/geolocation";
import { useLocale } from "../i18n/locale";
import { localizeDish } from "../i18n/dish-localization";
import type { MessageKey } from "../i18n/messages";
import { LocationConsentDialog } from "../privacy/LocationConsentDialog";
import { getLocationPermission, recordPrivacyAccess } from "../privacy/privacy-store";

interface Center { readonly latitude: number; readonly longitude: number; readonly label: string }
type DiscoveryState = "idle" | "loading" | "ready" | "error";

export function NearbyPage() {
  const { decisionId = "" } = useParams();
  const navigate = useNavigate();
  const { locale, t } = useLocale();
  const [record, setRecord] = useState<StoredDecision | null>(null);
  const [center, setCenter] = useState<Center | null>(null);
  const [places, setPlaces] = useState<readonly Place[]>([]);
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>("idle");
  const [area, setArea] = useState("");
  const [statusKey, setStatusKey] = useState<MessageKey>("nearby.initialStatus");
  const [busy, setBusy] = useState(false);
  const [askingForLocation, setAskingForLocation] = useState(false);

  useEffect(() => {
    void db.decisionSessions.get(decisionId).then((row) => {
      if (row) setRecord(parseStoredDecision(row.payload));
    });
  }, [decisionId]);

  async function discover(nextCenter: Center, successKey: MessageKey) {
    setCenter(nextCenter);
    setPlaces([]);
    setDiscoveryState("loading");
    setStatusKey("nearby.searching");
    try {
      const results = await findNearbyPlaces(nextCenter);
      setPlaces(results);
      setDiscoveryState("ready");
      setStatusKey(results.length ? successKey : "nearby.empty");
    } catch {
      setDiscoveryState("error");
      setStatusKey("nearby.serviceUnavailable");
    }
  }

  async function requestLocationConsent() {
    if (!(await getLocationPermission())) {
      setStatusKey("nearby.locationOff");
      return;
    }
    setAskingForLocation(true);
  }

  async function locate() {
    setAskingForLocation(false);
    setBusy(true);
    try {
      const point = await requestCurrentLocation({ timeoutMs: 8_000 });
      await recordPrivacyAccess({
        category: "precise_location",
        purpose: "nearby_map",
        recipient: "AMap Places + OpenStreetMap",
      });
      await discover({ ...point, label: t("nearby.currentArea") }, "nearby.once");
    } catch (error) {
      setStatusKey(
        error instanceof LocationRequestError && error.kind === "denied"
          ? "nearby.denied"
          : "nearby.unavailable",
      );
    } finally {
      setBusy(false);
    }
  }

  async function searchArea(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await geocodeArea(area, locale);
      await recordPrivacyAccess({
        category: "precise_location",
        purpose: "nearby_map",
        recipient: "AMap Places + OpenStreetMap",
      });
      await discover(result, "nearby.lookupOnce");
    } catch (error) {
      setStatusKey(
        error instanceof GeocoderError
          ? ({
              empty: "nearby.areaEmpty",
              unavailable: "nearby.areaUnavailable",
              not_found: "nearby.areaNotFound",
            } as const)[error.kind]
          : "nearby.areaUnavailable",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!record) return <main className="page"><p>{t("nearby.loading")}</p></main>;

  const delta = .012;
  const localizedWinner = localizeDish(record.winner.dish, locale);
  const mapUrl = center
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${center.longitude - delta}%2C${center.latitude - delta}%2C${center.longitude + delta}%2C${center.latitude + delta}&layer=mapnik&marker=${center.latitude}%2C${center.longitude}`
    : "";

  return <main className="page nearby-page">
    <button className="text-button" onClick={() => navigate(-1)}>{t("nearby.back")}</button>
    <p className="hero-kicker">{t("nearby.kicker")}</p>
    <h1 className="page-title">{t("nearby.title")}</h1>
    <p className="page-lede">{t("nearby.lede", { dish: localizedWinner.name })}</p>
    <div className="nearby-controls">
      <button className="primary-button" disabled={busy} onClick={() => void requestLocationConsent()}>
        {busy ? t("nearby.locating") : t("nearby.useLocation")}
      </button>
      <form onSubmit={searchArea}>
        <label htmlFor="nearby-area">{t("nearby.areaLabel")}</label>
        <div>
          <input id="nearby-area" value={area} onChange={(event) => setArea(event.target.value)} placeholder={t("nearby.areaHint")} />
          <button className="secondary-button" disabled={busy}>{t("nearby.search")}</button>
        </div>
      </form>
    </div>
    <p className="nearby-status" aria-live="polite">{t(statusKey)}</p>
    {center ? <div className="nearby-layout">
      <section>
        <h2>{center.label}</h2>
        <iframe className="nearby-map" title={t("nearby.mapTitle")} src={mapUrl} referrerPolicy="strict-origin-when-cross-origin" />
        <small>© OpenStreetMap contributors</small>
      </section>
      <section>
        <h2>{t("nearby.demoPlaces")}</h2>
        <p className="page-lede">{t("nearby.fixtureNotice")}</p>
        {discoveryState === "loading" ? <p>{t("nearby.searching")}</p> : null}
        {discoveryState === "ready" && places.length === 0 ? <p>{t("nearby.empty")}</p> : null}
        {places.length ? <ol className="restaurant-list">
          {places.map((place) => {
            const safePhoto = place.photo_url?.startsWith("https://") ? place.photo_url : null;
            const safeLink = place.order_destination?.startsWith("https://") ? place.order_destination : null;
            return <li key={place.id}>
              {safePhoto ? <img src={safePhoto} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
              <div className="restaurant-copy">
                <strong>{place.name}</strong>
                <span>{place.category ?? "Restaurant"} · {t("nearby.fixtureDistance", { distance: Math.round(place.distance_m) })}</span>
                {place.address ? <span>{place.address}</span> : null}
                <div className="restaurant-facts">
                  {place.rating !== null ? <span>{t("nearby.rating", { rating: place.rating })}</span> : null}
                  {place.average_cost_minor != null && place.currency === "CNY" ? <span>{t("nearby.averageCost", { cost: Math.round(place.average_cost_minor / 100) })}</span> : null}
                </div>
                <small>{t("nearby.attribution", { source: place.attribution })}</small>
                {safeLink ? <a href={safeLink} target="_blank" rel="noreferrer">{t("nearby.searchPlace")}</a> : null}
              </div>
            </li>;
          })}
        </ol> : null}
      </section>
    </div> : null}
    {askingForLocation ? <LocationConsentDialog onCancel={() => setAskingForLocation(false)} onAllow={() => void locate()} /> : null}
  </main>;
}

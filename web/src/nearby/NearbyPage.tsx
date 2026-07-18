import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { db } from "../db/db";
import { parseStoredDecision, type StoredDecision } from "../domain/contracts";
import { GeocoderError, geocodeArea } from "../location/geocoder";
import { LocationRequestError, requestCurrentLocation } from "../location/geolocation";
import { useLocale } from "../i18n/locale";
import type { MessageKey } from "../i18n/messages";
import { LocationConsentDialog } from "../privacy/LocationConsentDialog";
import { getLocationPermission, recordPrivacyAccess } from "../privacy/privacy-store";

interface Center { readonly latitude: number; readonly longitude: number; readonly label: string }

export function NearbyPage() {
  const { decisionId = "" } = useParams();
  const navigate = useNavigate();
  const { locale, t } = useLocale();
  const [record, setRecord] = useState<StoredDecision | null>(null);
  const [center, setCenter] = useState<Center | null>(null);
  const [area, setArea] = useState("");
  const [statusKey, setStatusKey] = useState<MessageKey>("nearby.initialStatus");
  const [busy, setBusy] = useState(false);
  const [askingForLocation, setAskingForLocation] = useState(false);
  useEffect(() => { void db.decisionSessions.get(decisionId).then((row) => { if (row) setRecord(parseStoredDecision(row.payload)); }); }, [decisionId]);
  const candidates = useMemo(() => {
    if (!record) return [];
    const all = record.schema_version === "recommendation.v2" ? record.ranked_candidates : [record.winner, ...(record.reserve ? [record.reserve] : [])];
    return [...new Map(all.map((candidate) => [candidate.place.id, candidate])).values()].slice(0, 5);
  }, [record]);

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
      await recordPrivacyAccess({ category: "precise_location", purpose: "nearby_map", recipient: "OpenStreetMap" });
      setCenter({ ...point, label: t("nearby.currentArea") });
      setStatusKey("nearby.once");
    }
    catch (error) { setStatusKey(error instanceof LocationRequestError && error.kind === "denied" ? "nearby.denied" : "nearby.unavailable"); }
    finally { setBusy(false); }
  }
  async function searchArea(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try { const result = await geocodeArea(area, locale); setCenter(result); setStatusKey("nearby.lookupOnce"); }
    catch (error) { setStatusKey(error instanceof GeocoderError ? ({ empty: "nearby.areaEmpty", unavailable: "nearby.areaUnavailable", not_found: "nearby.areaNotFound" } as const)[error.kind] : "nearby.areaUnavailable"); }
    finally { setBusy(false); }
  }
  if (!record) return <main className="page"><p>{t("nearby.loading")}</p></main>;
  const delta = .012;
  const mapUrl = center ? `https://www.openstreetmap.org/export/embed.html?bbox=${center.longitude - delta}%2C${center.latitude - delta}%2C${center.longitude + delta}%2C${center.latitude + delta}&layer=mapnik&marker=${center.latitude}%2C${center.longitude}` : "";
  return <main className="page nearby-page">
    <button className="text-button" onClick={() => navigate(-1)}>{t("nearby.back")}</button>
    <p className="hero-kicker">{t("nearby.kicker")}</p><h1 className="page-title">{t("nearby.title")}</h1>
    <p className="page-lede">{t("nearby.lede", { dish: record.winner.dish.name })}</p>
    <div className="nearby-controls"><button className="primary-button" disabled={busy} onClick={() => void requestLocationConsent()}>{busy ? t("nearby.locating") : t("nearby.useLocation")}</button><form onSubmit={searchArea}><label htmlFor="nearby-area">{t("nearby.areaLabel")}</label><div><input id="nearby-area" value={area} onChange={(event) => setArea(event.target.value)} placeholder={t("nearby.areaHint")} /><button className="secondary-button">{t("nearby.search")}</button></div></form></div>
    <p className="nearby-status" aria-live="polite">{t(statusKey)}</p>
    {center ? <div className="nearby-layout"><section><h2>{center.label}</h2><iframe className="nearby-map" title={t("nearby.mapTitle")} src={mapUrl} referrerPolicy="strict-origin-when-cross-origin" /><small>© OpenStreetMap contributors</small></section><section><h2>{t("nearby.demoPlaces")}</h2><p className="page-lede">{t("nearby.fixtureNotice")}</p><ol className="restaurant-list">{candidates.map(({ dish, place }) => <li key={place.id}><strong>{place.name}</strong><span>{dish.cuisine_tags.join(" · ")} · {t("nearby.fixtureDistance", { distance: Math.round(place.distance_m) })}</span>{place.order_destination ? <a href={place.order_destination} target="_blank" rel="noreferrer">{t("nearby.searchPlace")}</a> : null}</li>)}</ol></section></div> : null}
    {askingForLocation ? <LocationConsentDialog onCancel={() => setAskingForLocation(false)} onAllow={() => void locate()} /> : null}
  </main>;
}

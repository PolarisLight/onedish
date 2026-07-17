import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { db } from "../db/db";
import { parseStoredDecision, type StoredDecision } from "../domain/contracts";
import { geocodeArea } from "../location/geocoder";
import { LocationRequestError, requestCurrentLocation } from "../location/geolocation";

interface Center { readonly latitude: number; readonly longitude: number; readonly label: string }

export function NearbyPage() {
  const { decisionId = "" } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<StoredDecision | null>(null);
  const [center, setCenter] = useState<Center | null>(null);
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("Choose how to locate nearby restaurants.");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void db.decisionSessions.get(decisionId).then((row) => { if (row) setRecord(parseStoredDecision(row.payload)); }); }, [decisionId]);
  const candidates = useMemo(() => {
    if (!record) return [];
    const all = record.schema_version === "recommendation.v2" ? record.ranked_candidates : [record.winner, ...(record.reserve ? [record.reserve] : [])];
    return [...new Map(all.map((candidate) => [candidate.place.id, candidate])).values()].slice(0, 5);
  }, [record]);

  async function locate() {
    setBusy(true);
    try { const point = await requestCurrentLocation({ timeoutMs: 8_000 }); setCenter({ ...point, label: "Your current area" }); setStatus("Location is used for this view only and is not saved."); }
    catch (error) { setStatus(error instanceof LocationRequestError && error.kind === "denied" ? "Location was denied. Enter an area instead." : "Location is unavailable. Enter an area instead."); }
    finally { setBusy(false); }
  }
  async function searchArea(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try { const result = await geocodeArea(area, record?.schema_version === "recommendation.v2" ? record.locale : "en"); setCenter(result); setStatus("Area lookup is sent only when you press Search area."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Area search failed"); }
    finally { setBusy(false); }
  }
  if (!record) return <main className="page"><p>Loading your recommendation...</p></main>;
  const delta = .012;
  const mapUrl = center ? `https://www.openstreetmap.org/export/embed.html?bbox=${center.longitude - delta}%2C${center.latitude - delta}%2C${center.longitude + delta}%2C${center.latitude + delta}&layer=mapnik&marker=${center.latitude}%2C${center.longitude}` : "";
  return <main className="page nearby-page">
    <button className="text-button" onClick={() => navigate(-1)}>← Back to your dish</button>
    <p className="hero-kicker">Nearby search</p><h1 className="page-title">Find it close by.</h1>
    <p className="page-lede">Looking for places that may match <strong>{record.winner.dish.name}</strong>. Menu availability is not guaranteed.</p>
    <div className="nearby-controls"><button className="primary-button" disabled={busy} onClick={locate}>{busy ? "Locating..." : "Use current location"}</button><form onSubmit={searchArea}><label htmlFor="nearby-area">Or enter a city or neighborhood</label><div><input id="nearby-area" value={area} onChange={(event) => setArea(event.target.value)} placeholder="Shanghai, Jing'an" /><button className="secondary-button">Search area</button></div></form></div>
    <p className="nearby-status" aria-live="polite">{status}</p>
    {center ? <div className="nearby-layout"><section><h2>{center.label}</h2><iframe className="nearby-map" title="OpenStreetMap nearby area" src={mapUrl} referrerPolicy="strict-origin-when-cross-origin" /><small>© OpenStreetMap contributors</small></section><section><h2>Matching demo places</h2><p className="page-lede">These are clearly labeled fixtures for the hackathon demo. Configure Foursquare for live restaurant results.</p><ol className="restaurant-list">{candidates.map(({ dish, place }) => <li key={place.id}><strong>{place.name}</strong><span>{dish.cuisine_tags.join(" · ")} · {Math.round(place.distance_m)} m fixture distance</span>{place.order_destination ? <a href={place.order_destination} target="_blank" rel="noreferrer">Search this place</a> : null}</li>)}</ol></section></div> : null}
  </main>;
}

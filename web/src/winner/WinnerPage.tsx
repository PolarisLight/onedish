import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { db, saveHistoryEvent } from "../db/db";
import {
  parseStoredDecision,
  type Candidate,
  type RejectionReason,
  type StoredDecision,
} from "../domain/contracts";
import { RecommendationExhausted, retryRecommendation } from "../recommendation/session";
import { ProvenanceChip } from "../shared/ProvenanceChip";
import { RejectionSheet } from "./RejectionSheet";

export function WinnerPage() {
  const { decisionId = "" } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<StoredDecision | null>(null);
  const [rejectionOpen, setRejectionOpen] = useState(false);
  const [showReserve, setShowReserve] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void db.decisionSessions.get(decisionId).then((row) => {
      if (!row) return;
      try { setRecord(parseStoredDecision(row.payload)); } catch { setError("This decision record is invalid."); }
    });
  }, [decisionId]);
  if (!record) return <main className="page"><p>Loading the winner...</p></main>;
  const currentRecord = record;
  const candidate = showReserve && currentRecord.reserve ? currentRecord.reserve : currentRecord.winner;
  const live = currentRecord.schema_version === "recommendation.v2";

  async function pickAnother() {
    if (!live || currentRecord.schema_version !== "recommendation.v2") return;
    setRetrying(true);
    setError("");
    try {
      await saveHistoryEvent({
        id: `dismiss-${decisionId}-${Date.now()}`,
        occurred_at: new Date().toISOString(),
        kind: "dismissed",
        dish_id: candidate.dish.id,
        cuisine_tags: candidate.dish.cuisine_tags,
        taste_tags: candidate.dish.taste_tags,
        base_ingredient: candidate.dish.base_ingredient,
        price_minor: candidate.dish.price_minor,
        protein_g: candidate.dish.protein_g.min,
      });
      const next = await retryRecommendation(currentRecord);
      setRecord(next);
      await navigate(`/winner/${next.decision.decision_id}`, { replace: true });
    } catch (caught) {
      setError(caught instanceof RecommendationExhausted
        ? "No more safe choices remain. Edit your preferences to continue."
        : caught instanceof Error
          ? `We could not pick another dish: ${caught.message}`
          : "We could not pick another dish. Try again.");
    } finally {
      setRetrying(false);
    }
  }

  async function reject(reason: RejectionReason) {
    await saveHistoryEvent({
      id: `reject-${decisionId}-${Date.now()}`,
      occurred_at: new Date().toISOString(),
      kind: "rejected",
      dish_id: candidate.dish.id,
      rejection_reason: reason,
      cuisine_tags: candidate.dish.cuisine_tags,
      taste_tags: candidate.dish.taste_tags,
      base_ingredient: candidate.dish.base_ingredient,
      price_minor: candidate.dish.price_minor,
      protein_g: candidate.dish.protein_g.min,
    });
    setRejectionOpen(false);
    if (live && currentRecord.schema_version === "recommendation.v2") await pickAnother();
    else setShowReserve(true);
  }
  return <WinnerView
    candidate={candidate}
    reserve={showReserve}
    canReject={!showReserve}
    live={live}
    retrying={retrying}
    error={error}
    rejectionOpen={rejectionOpen}
    setRejectionOpen={setRejectionOpen}
    onReject={reject}
    onRetry={pickAnother}
    onEdit={() => navigate("/?adjust=1")}
  />;
}

function WinnerView({ candidate, reserve, canReject, live, retrying, error, rejectionOpen, setRejectionOpen, onReject, onRetry, onEdit }: { candidate: Candidate; reserve: boolean; canReject: boolean; live: boolean; retrying: boolean; error: string; rejectionOpen: boolean; setRejectionOpen: (value: boolean) => void; onReject: (reason: RejectionReason) => void; onRetry: () => void; onEdit: () => void }) {
  const { dish, place } = candidate;
  const safeLink = place.order_destination?.startsWith("https://") ? place.order_destination : null;
  return (
    <main className="winner">
      <div className="winner-grid">
        <div className="winner-media"><img src={`${import.meta.env.BASE_URL}${dish.image.replace(/^\//, "")}`} alt={dish.name} /></div>
        <section className="winner-copy">
          <p className="hero-kicker">{reserve ? "Your one reserve" : "Tonight's one dish"}</p>
          <p className="restaurant-name">{place.name} · {Math.round(place.distance_m / 10) * 10} m away</p>
          <h1>{dish.name}</h1>
          <p className="dish-description">{dish.description}</p>
          <div className="nutrition">
            <div className="metric"><strong>${(dish.price_minor / 100).toFixed(2)}</strong><span>demo menu price</span></div>
            <div className="metric"><strong>{dish.energy_kcal.min}-{dish.energy_kcal.max}</strong><span>estimated kcal</span></div>
            <div className="metric"><strong>{dish.protein_g.min}-{dish.protein_g.max}g</strong><span>estimated protein</span></div>
          </div>
          <div className="chips">
            <ProvenanceChip>{place.source_kind === "fixture_place" ? "Fixture place" : "Foursquare place"}</ProvenanceChip>
            <ProvenanceChip>Fictional demo menu</ProvenanceChip>
            <ProvenanceChip>Nutrition estimate</ProvenanceChip>
            <ProvenanceChip>Search link only</ProvenanceChip>
          </div>
          <div className="winner-actions">
            {safeLink ? <a className="primary-button" href={safeLink} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Search on web</a> : null}
            {live ? <>
              <button className="secondary-button" disabled={retrying} onClick={onRetry}>{retrying ? "Picking..." : "Pick another"}</button>
              <button className="text-button" onClick={onEdit}>Edit preferences</button>
            </> : canReject ? <button className="secondary-button" onClick={() => setRejectionOpen(!rejectionOpen)}>Not today</button> : <span className="page-lede">That is the reserve. The session ends here.</span>}
          </div>
          {error ? <p role="alert" className="page-lede">{error}</p> : null}
          {rejectionOpen ? <RejectionSheet onChoose={onReject} /> : null}
        </section>
      </div>
    </main>
  );
}

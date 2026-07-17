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
import { formatMoney } from "../i18n/locale-utils";
import { ProvenanceChip } from "../shared/ProvenanceChip";
import { RejectionSheet } from "./RejectionSheet";
import { WinnerActions } from "./WinnerActions";
import { WinnerEvidence } from "./WinnerEvidence";

export function WinnerPage() {
  const { decisionId = "" } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<StoredDecision | null>(null);
  const [rejectionOpen, setRejectionOpen] = useState(false);
  const [showReserve, setShowReserve] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    void db.decisionSessions.get(decisionId).then((row) => {
      if (!row) return;
      try {
        const parsed = parseStoredDecision(row.payload);
        setRecord(parsed);
        if (parsed.schema_version === "recommendation.v2") {
          void saveHistoryEvent({
            id: `accepted-${decisionId}`,
            occurred_at: parsed.decision.created_at,
            kind: "accepted",
            dish_id: parsed.winner.dish.id,
            cuisine_tags: parsed.winner.dish.cuisine_tags,
            taste_tags: parsed.winner.dish.taste_tags,
            base_ingredient: parsed.winner.dish.base_ingredient,
            price_minor: parsed.winner.dish.price_minor,
            protein_g: parsed.winner.dish.protein_g.min,
          });
        }
      } catch { setError("This decision record is invalid."); }
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
      await db.historyEvents.delete(`accepted-${decisionId}`);
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
      if (caught instanceof RecommendationExhausted) setExhausted(true);
      setError(caught instanceof RecommendationExhausted
        ? ""
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
    exhausted={exhausted}
    locale={live && currentRecord.schema_version === "recommendation.v2" ? currentRecord.locale : "en"}
    reasonCodes={live && currentRecord.schema_version === "recommendation.v2" ? currentRecord.winner_reason_codes : []}
    rejectionOpen={rejectionOpen}
    setRejectionOpen={setRejectionOpen}
    onReject={reject}
    onRetry={pickAnother}
    onEdit={() => navigate("/?adjust=1")}
    onNearby={() => navigate(`/nearby/${decisionId}`)}
  />;
}

function WinnerView({ candidate, reserve, canReject, live, retrying, exhausted, error, locale, reasonCodes, rejectionOpen, setRejectionOpen, onReject, onRetry, onEdit, onNearby }: { candidate: Candidate; reserve: boolean; canReject: boolean; live: boolean; retrying: boolean; exhausted: boolean; error: string; locale: "en" | "zh-CN"; reasonCodes: readonly string[]; rejectionOpen: boolean; setRejectionOpen: (value: boolean) => void; onReject: (reason: RejectionReason) => void; onRetry: () => void; onEdit: () => void; onNearby: () => void }) {
  const { dish, place } = candidate;
  const safeLink = place.order_destination?.startsWith("https://") ? place.order_destination : null;
  const displayPrice = locale === "en" ? dish.price_minor : Math.round(dish.price_minor * 7.2);
  return (
    <main className="winner">
      <div className="winner-grid">
        <div className="winner-media"><img src={`${import.meta.env.BASE_URL}${dish.image.replace(/^\//, "")}`} alt={dish.name} /></div>
        <section className="winner-copy">
          <p className="hero-kicker">{reserve ? "Your one reserve" : "Your one dish"}</p>
          <p className="restaurant-name">{place.name}</p>
          <h1>{dish.name}</h1>
          <p className="dish-description">{dish.description}</p>
          <div className="nutrition">
            <div className="metric"><strong>{formatMoney(displayPrice, locale)}</strong><span>menu estimate</span></div>
            <div className="metric"><strong>{dish.energy_kcal.min}-{dish.energy_kcal.max}</strong><span>estimated kcal</span></div>
            <div className="metric"><strong>{dish.protein_g.min}-{dish.protein_g.max}g</strong><span>estimated protein</span></div>
          </div>
          {!live ? <div className="chips">
            <ProvenanceChip>{place.source_kind === "fixture_place" ? "Fixture place" : "Foursquare place"}</ProvenanceChip>
            <ProvenanceChip>Fictional demo menu</ProvenanceChip>
            <ProvenanceChip>Nutrition estimate</ProvenanceChip>
            <ProvenanceChip>Search link only</ProvenanceChip>
          </div> : null}
          {live ? <><WinnerEvidence candidate={candidate} reasonCodes={reasonCodes} locale={locale} /><WinnerActions onRetry={onRetry} onEdit={onEdit} onNearby={onNearby} retrying={retrying} exhausted={exhausted} error={error} /><details className="winner-details"><summary>How this was chosen</summary><p>Deterministic rules compared safety, time, budget, taste, distance, and recent history. Nutrition values are estimates.</p>{safeLink ? <a href={safeLink} target="_blank" rel="noopener noreferrer">Source search link</a> : null}</details></> : <div className="winner-actions">{safeLink ? <a className="primary-button" href={safeLink} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Search on web</a> : null}{canReject ? <button className="secondary-button" onClick={() => setRejectionOpen(!rejectionOpen)}>Not today</button> : <span className="page-lede">That is the reserve. The session ends here.</span>}</div>}
          {rejectionOpen ? <RejectionSheet onChoose={onReject} /> : null}
        </section>
      </div>
    </main>
  );
}

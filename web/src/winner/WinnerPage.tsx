import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { db, saveHistoryEvent } from "../db/db";
import { parseDemoRecord, type Candidate, type DemoRecord, type RejectionReason } from "../domain/contracts";
import { ProvenanceChip } from "../shared/ProvenanceChip";
import { RejectionSheet } from "./RejectionSheet";

export function WinnerPage() {
  const { decisionId = "" } = useParams();
  const [record, setRecord] = useState<DemoRecord | null>(null);
  const [rejectionOpen, setRejectionOpen] = useState(false);
  const [showReserve, setShowReserve] = useState(false);

  useEffect(() => { void db.decisionSessions.get(decisionId).then((row) => { if (row) setRecord(parseDemoRecord(row.payload)); }); }, [decisionId]);
  if (!record) return <main className="page"><p>Loading the winner...</p></main>;
  const candidate = showReserve && record.reserve ? record.reserve : record.winner;

  async function reject(reason: RejectionReason) {
    await saveHistoryEvent({
      id: `reject-${decisionId}-${Date.now()}`,
      occurred_at: new Date().toISOString(),
      kind: "rejected",
      dish_id: candidate.dish.id,
      rejection_reason: reason,
      cuisine_tags: candidate.dish.cuisine_tags,
      taste_tags: candidate.dish.taste_tags,
      price_minor: candidate.dish.price_minor,
      protein_g: candidate.dish.protein_g.min,
    });
    setRejectionOpen(false);
    setShowReserve(true);
  }
  return <WinnerView candidate={candidate} reserve={showReserve} canReject={!showReserve} rejectionOpen={rejectionOpen} setRejectionOpen={setRejectionOpen} onReject={reject} />;
}

function WinnerView({ candidate, reserve, canReject, rejectionOpen, setRejectionOpen, onReject }: { candidate: Candidate; reserve: boolean; canReject: boolean; rejectionOpen: boolean; setRejectionOpen: (value: boolean) => void; onReject: (reason: RejectionReason) => void }) {
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
            {canReject ? <button className="secondary-button" onClick={() => setRejectionOpen(!rejectionOpen)}>Not today</button> : <span className="page-lede">That is the reserve. The session ends here.</span>}
          </div>
          {rejectionOpen ? <RejectionSheet onChoose={onReject} /> : null}
        </section>
      </div>
    </main>
  );
}

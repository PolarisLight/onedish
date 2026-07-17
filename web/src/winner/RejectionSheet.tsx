import { rejectionReasons, type RejectionReason } from "../domain/contracts";

const labels: Record<RejectionReason, string> = {
  too_heavy: "Too heavy",
  not_craving: "Not craving it",
  too_expensive: "Too expensive",
  had_recently: "Had it recently",
};

export function RejectionSheet({ onChoose }: { onChoose: (reason: RejectionReason) => void }) {
  return (
    <section className="rejection-sheet" aria-labelledby="rejection-title">
      <h2 id="rejection-title">What missed?</h2>
      <p className="page-lede">One answer improves future choices. You will see only the reserve.</p>
      <div className="reason-grid">
        {rejectionReasons.map((reason) => <button key={reason} onClick={() => onChoose(reason)}>{labels[reason]}</button>)}
      </div>
    </section>
  );
}

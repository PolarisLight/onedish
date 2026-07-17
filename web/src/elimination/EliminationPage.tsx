import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { db } from "../db/db";
import { parseDemoRecord, type DemoRecord } from "../domain/contracts";
import { StageDetails } from "./StageDetails";

export function EliminationPage() {
  const { decisionId = "" } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<DemoRecord | null>(null);
  const [error, setError] = useState("");
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    void db.decisionSessions.get(decisionId).then((row) => {
      if (!row) { setError("This decision is no longer stored on this device."); return; }
      try { setRecord(parseDemoRecord(row.payload)); } catch { setError("This decision record is invalid."); }
    });
  }, [decisionId]);

  useEffect(() => {
    if (!record || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (record) setStageIndex(record.decision.stages.length - 1);
      return;
    }
    if (stageIndex >= record.decision.stages.length - 1) return;
    const timer = window.setTimeout(() => setStageIndex((value) => value + 1), 560);
    return () => window.clearTimeout(timer);
  }, [record, stageIndex]);

  if (error) return <main className="error-state"><h1>Decision unavailable</h1><p>{error}</p><button className="secondary-button" onClick={() => navigate("/")}>Start again</button></main>;
  if (!record) return <main className="page"><p>Loading your stored decision...</p></main>;
  const current = record.decision.stages[stageIndex];
  if (!current) return null;
  return (
    <main className="page">
      <div className="elimination-layout">
        <section aria-live="polite">
          <p className="hero-kicker">Explaining the decision</p>
          <div className="big-count">{current.survivor_count}</div>
          <div className="count-label">dishes still standing</div>
          <p className="page-lede">The decision is already stored. This sequence shows exactly what was removed.</p>
          <button className="text-button" onClick={() => navigate(`/winner/${decisionId}`)}>Show result</button>
        </section>
        <section>
          <h1 className="page-title">From ninety to one.</h1>
          <ol className="stage-list">
            {record.decision.stages.map((stage, index) => (
              <StageDetails key={stage.id} stage={stage} index={index} visible={index <= stageIndex} current={index === stageIndex} />
            ))}
          </ol>
          {stageIndex === record.decision.stages.length - 1 ? (
            <button className="primary-button" onClick={() => navigate(`/winner/${decisionId}`)}>Meet your dish</button>
          ) : null}
        </section>
      </div>
    </main>
  );
}

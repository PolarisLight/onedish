import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { db } from "../db/db";
import { parseStoredDecision, type StoredDecision } from "../domain/contracts";
import { SafeAreaActions } from "../shared/SafeAreaActions";
import { AnimatedCount } from "./AnimatedCount";
import { EliminationStack } from "./EliminationStack";
import { projectTraceStage } from "./trace-view-model";

export function EliminationPage() {
  const { decisionId = "" } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<StoredDecision | null>(null);
  const [error, setError] = useState("");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    void db.decisionSessions.get(decisionId).then((row) => {
      if (!row) { setError("This decision is no longer stored on this device."); return; }
      try {
        const next = parseStoredDecision(row.payload);
        setRecord(next);
        if (reducedMotion) setStageIndex(next.decision.stages.length - 1);
      } catch { setError("This decision record is invalid."); }
    });
  }, [decisionId, reducedMotion]);

  useEffect(() => {
    if (!record || reducedMotion || stageIndex >= record.decision.stages.length - 1) return;
    const timer = window.setTimeout(() => setStageIndex((value) => value + 1), 360);
    return () => window.clearTimeout(timer);
  }, [record, reducedMotion, stageIndex]);

  const candidateNames = useMemo(() => {
    if (!record || record.schema_version === "demo.v1") return {};
    return Object.fromEntries(record.ranked_candidates.map((candidate) => [candidate.dish.id, candidate.dish.name]));
  }, [record]);

  if (error) return <main className="error-state"><h1>Decision unavailable</h1><p>{error}</p><button className="secondary-button" onClick={() => navigate("/")}>Start again</button></main>;
  if (!record) return <main className="page"><p>Loading your stored decision...</p></main>;
  const finalIndex = record.decision.stages.length - 1;
  const complete = stageIndex >= finalIndex;
  const rawStage = record.decision.stages[Math.min(stageIndex, finalIndex)];
  if (!rawStage) return null;
  const locale = record.schema_version === "recommendation.v2" ? record.locale : "en";
  const stage = projectTraceStage(rawStage, locale);

  return (
    <main className="page elimination-screen">
      <section className="elimination-copy">
        <p className="hero-kicker">{complete ? "Decision complete" : "Choosing from nearby options"}</p>
        <h1 className="page-title">From ninety to one.</h1>
        <div className="big-count"><AnimatedCount value={stage.count} reducedMotion={reducedMotion} /></div>
        <p className="sr-only" aria-live="polite">{complete ? "One dish selected" : `${stage.count} dishes remain. ${stage.reasonText}`}</p>
      </section>
      <EliminationStack stage={stage} reducedMotion={reducedMotion} candidateNames={candidateNames} />
      <div className="trace-progress" aria-hidden="true"><span style={{ width: `${((stageIndex + 1) / record.decision.stages.length) * 100}%` }} /></div>
      <SafeAreaActions
        label="Decision actions"
        secondary={<><button className="text-button" onClick={() => navigate("/?adjust=1")}>Edit preferences</button><button className="text-button" onClick={() => navigate("/")}>Start over</button></>}
      >
        {complete
          ? <button className="primary-button" onClick={() => navigate(`/winner/${decisionId}`)}>Meet your dish</button>
          : <button className="secondary-button" onClick={() => setStageIndex(finalIndex)}>Skip</button>}
      </SafeAreaActions>
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { db } from "../db/db";
import { parseStoredDecision, type StoredDecision } from "../domain/contracts";
import { SafeAreaActions } from "../shared/SafeAreaActions";
import { AnimatedCount } from "./AnimatedCount";
import { EliminationStack } from "./EliminationStack";
import { projectTraceStage } from "./trace-view-model";
import { useLocale } from "../i18n/locale";
import { localizeDish } from "../i18n/dish-localization";

export function EliminationPage() {
  const { decisionId = "" } = useParams();
  const navigate = useNavigate();
  const { locale, t } = useLocale();
  const [record, setRecord] = useState<StoredDecision | null>(null);
  const [error, setError] = useState("");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    void db.decisionSessions.get(decisionId).then((row) => {
      if (!row) { setError(t("decision.missing")); return; }
      try {
        const next = parseStoredDecision(row.payload);
        setRecord(next);
        if (reducedMotion) setStageIndex(next.decision.stages.length - 1);
      } catch { setError(t("decision.invalid")); }
    });
  }, [decisionId, reducedMotion, t]);

  useEffect(() => {
    if (!record || reducedMotion || stageIndex >= record.decision.stages.length - 1) return;
    const timer = window.setTimeout(() => setStageIndex((value) => value + 1), 360);
    return () => window.clearTimeout(timer);
  }, [record, reducedMotion, stageIndex]);

  const candidateNames = useMemo(() => {
    if (!record || record.schema_version === "demo.v1") return {};
    return Object.fromEntries(record.ranked_candidates.map((candidate) => [
      candidate.dish.id,
      localizeDish(candidate.dish, locale).name,
    ]));
  }, [locale, record]);

  if (error) return <main className="error-state"><h1>{t("decision.unavailable")}</h1><p>{error}</p><button className="secondary-button" onClick={() => navigate("/")}>{t("decision.startAgain")}</button></main>;
  if (!record) return <main className="page"><p>{t("decision.loading")}</p></main>;
  const finalIndex = record.decision.stages.length - 1;
  const complete = stageIndex >= finalIndex;
  const rawStage = record.decision.stages[Math.min(stageIndex, finalIndex)];
  if (!rawStage) return null;
  const stage = projectTraceStage(rawStage, locale);

  return (
    <main className="page elimination-screen">
      <section className="elimination-copy">
        <p className="hero-kicker">{complete ? t("decision.complete") : t("decision.choosing")}</p>
        <h1 className="page-title">{t("decision.title")}</h1>
        <div className="big-count"><AnimatedCount value={stage.count} reducedMotion={reducedMotion} /></div>
        <p className="sr-only" aria-live="polite">{complete ? t("decision.selected") : t("decision.remaining", { count: stage.count, reason: stage.reasonText })}</p>
      </section>
      <EliminationStack stage={stage} reducedMotion={reducedMotion} candidateNames={candidateNames} />
      <div className="trace-progress" aria-hidden="true"><span style={{ width: `${((stageIndex + 1) / record.decision.stages.length) * 100}%` }} /></div>
      <SafeAreaActions
        label={t("decision.actions")}
        secondary={<><button className="text-button" onClick={() => navigate("/?adjust=1")}>{t("decision.edit")}</button><button className="text-button" onClick={() => navigate("/")}>{t("decision.restart")}</button></>}
      >
        {complete
          ? <button className="primary-button" onClick={() => navigate(`/winner/${decisionId}`)}>{t("decision.meet")}</button>
          : <button className="secondary-button" onClick={() => setStageIndex(finalIndex)}>{t("decision.skip")}</button>}
      </SafeAreaActions>
    </main>
  );
}

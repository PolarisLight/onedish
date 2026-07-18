import { motion } from "motion/react";
import type { TraceStageView } from "./trace-view-model";
import { useLocale } from "../i18n/locale";

export function EliminationStack({ stage, reducedMotion, candidateNames = {} }: { readonly stage: TraceStageView; readonly reducedMotion: boolean; readonly candidateNames?: Readonly<Record<string, string>> }) {
  const { t } = useLocale();
  const removed = stage.removedIds.slice(0, 3);
  return <div className="elimination-stack-wrap">
    <p className="stack-reason" data-reason-code={stage.reasonCode ?? "stage"}>{stage.reasonText}</p>
    <ol className="elimination-stack" aria-label={t("decision.filtering")}>
      {removed.map((id, index) => <motion.li key={id} initial={reducedMotion ? false : { x: 0, rotate: 0, opacity: 1 }} animate={reducedMotion ? false : { x: index % 2 ? 34 : -34, rotate: index % 2 ? 4 : -4, opacity: .42 }} transition={{ duration: .3 }}>{candidateNames[id] ?? t("decision.other")}</motion.li>)}
      <li className="survivor-card"><strong>{stage.count}</strong><span>{t("decision.stillIn")}</span></li>
    </ol>
  </div>;
}

import type { EliminationStage, StageId } from "../domain/contracts";
import type { SupportedLocale } from "../recommendation/types";
import { translate, type MessageKey } from "../i18n/messages";

const reasonKeys: Readonly<Record<string, MessageKey>> = {
  allergen_excluded: "reason.allergen_excluded", ingredient_excluded: "reason.ingredient_excluded",
  over_budget: "reason.over_budget", energy_outside_range: "reason.energy_outside_range",
  protein_below_floor: "reason.protein_below_floor", recent_repetition: "reason.recent_repetition",
  session_excluded: "reason.session_excluded", taste_mismatch: "reason.taste_mismatch",
  too_slow: "reason.too_slow", taste_match: "reason.taste_match", protein_match: "reason.protein_match",
  recent_variety: "reason.recent_variety", duration_match: "reason.duration_match",
  confidence_match: "reason.confidence_match", meal_period_match: "reason.meal_period_match",
};

const stageKeys: Readonly<Record<StageId, MessageKey>> = {
  found: "stage.found", available: "stage.available", safety_budget: "stage.safety_budget",
  safety: "stage.safety", nutrition: "stage.nutrition", repetition: "stage.repetition",
  taste_confidence: "stage.taste_confidence", taste: "stage.taste", duration: "stage.duration",
  budget: "stage.budget", winner: "stage.winner",
};

export interface TraceStageView {
  readonly id: StageId;
  readonly count: number;
  readonly removedCount: number;
  readonly reasonCode: string | null;
  readonly reasonText: string;
  readonly removedIds: readonly string[];
}

export function projectTraceStage(stage: EliminationStage, locale: SupportedLocale): TraceStageView {
  const reason = Object.entries(stage.reason_counts)
    .sort(([leftCode, leftCount], [rightCode, rightCount]) => rightCount - leftCount || leftCode.localeCompare(rightCode))[0];
  const reasonCode = reason?.[0] ?? null;
  return {
    id: stage.id,
    count: stage.survivor_count,
    removedCount: Math.max(0, stage.input_count - stage.survivor_count),
    reasonCode,
    reasonText: reasonCode ? translate(locale, reasonKeys[reasonCode] ?? "reason.lower") : translate(locale, stageKeys[stage.id]),
    removedIds: stage.representative_removed_ids,
  };
}

export function strongestWinnerReasons(reasonCodes: readonly string[], locale: SupportedLocale): readonly string[] {
  return reasonCodes.slice(0, 3).map((code) => translate(locale, reasonKeys[code] ?? "reason.strong"));
}

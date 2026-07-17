import type { EliminationStage } from "../domain/contracts";

const labels: Record<EliminationStage["id"], string> = {
  found: "Nearby menu set",
  available: "Open and searchable",
  safety_budget: "Safe and in budget",
  safety: "Safety constraints",
  nutrition: "Fits today",
  repetition: "Not recently repeated",
  taste_confidence: "Taste and confidence",
  taste: "Taste fit",
  duration: "Time available",
  budget: "Budget fit",
  winner: "One dish",
};

const reasonLabels: Record<string, string> = {
  place_closed: "closed places removed",
  missing_order_destination: "missing search link",
  allergen_excluded: "allergen conflict",
  ingredient_excluded: "excluded ingredient",
  session_excluded: "skipped this session",
  over_budget: "over budget",
  energy_outside_range: "outside energy range",
  protein_below_floor: "below protein target",
  recent_repetition: "recently repeated",
  taste_mismatch: "weaker taste match",
  too_slow: "takes too long",
  lower_score: "lower context match",
  reserve_or_lower_score: "held as reserve or lower match",
};

export function StageDetails({ stage, index, visible, current }: { stage: EliminationStage; index: number; visible: boolean; current: boolean }) {
  const reasons = Object.entries(stage.reason_counts)
    .map(([key, count]) => `${count} ${reasonLabels[key] ?? key.replaceAll("_", " ")}`)
    .join(", ");
  return (
    <li className={`stage-item${visible ? " visible" : ""}${current ? " current" : ""}`} aria-current={current ? "step" : undefined}>
      <span className="stage-index">{String(index + 1).padStart(2, "0")}</span>
      <span className="stage-name">{labels[stage.id]}</span>
      <span className="stage-number">{stage.survivor_count}</span>
      {visible && reasons ? <span className="stage-reasons">{reasons}</span> : null}
    </li>
  );
}

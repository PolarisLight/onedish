import payload from "../public/data/parity.v2.json";
import type { Candidate } from "../src/domain/contracts";
import { recommendLocal } from "../src/recommendation/engine";
import type { RecommendationInput } from "../src/recommendation/types";
import { spec } from "./support/recommendation-fixtures";


test("browser engine matches v2 golden scenarios", async () => {
  const candidates = payload.candidates as unknown as readonly Candidate[];
  const byId = new Map(candidates.map((candidate) => [candidate.dish.id, candidate]));

  for (const scenario of payload.scenarios) {
    const selected = scenario.candidate_ids.map((id) => {
      const candidate = byId.get(id);
      if (!candidate) throw new Error(`Missing parity candidate ${id}`);
      return candidate;
    });
    const input: RecommendationInput = {
      locale: scenario.locale as RecommendationInput["locale"],
      context: scenario.context as RecommendationInput["context"],
      constraints: scenario.constraints as RecommendationInput["constraints"],
      repetition: scenario.repetition,
      preferences: scenario.preferences,
      session_exclusions: scenario.session_exclusions,
    };
    const result = await recommendLocal(selected, input, spec, new Date(scenario.now));
    const projected = {
      winner_id: result.decision.winner_id,
      reserve_id: result.decision.reserve_id,
      stage_counts: result.decision.stages.map((stage) => stage.survivor_count),
      reason_codes: [...new Set(result.decision.stages.flatMap((stage) => (
        Object.entries(stage.reason_counts)
          .filter(([, count]) => count > 0)
          .map(([code]) => code)
      )))].sort(),
      relaxations: [...result.decision.relaxations],
    };
    expect(projected, scenario.id).toEqual(scenario.expected);
  }
});

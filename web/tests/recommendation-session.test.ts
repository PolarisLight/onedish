import catalog from "../public/data/catalog.v1.json";
import places from "../public/data/places.v1.json";
import rules from "../public/data/decision.v2.json";
import { db, resetLocalData, saveProfile } from "../src/db/db";
import { defaultProfile } from "../src/recommendation/context";
import {
  retryRecommendation,
  startRecommendation,
} from "../src/recommendation/session";
import { parseDecisionSpec } from "../src/recommendation/spec";
import { NOW } from "./support/recommendation-fixtures";

const spec = parseDecisionSpec(rules);

beforeEach(async () => {
  await resetLocalData();
  await saveProfile(defaultProfile("en", spec));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.endsWith("decision.v2.json")
      ? rules
      : url.endsWith("catalog.v1.json")
        ? catalog
        : places;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }));
});

afterEach(() => vi.unstubAllGlobals());

test("starts and persists a live recommendation", async () => {
  const record = await startRecommendation({ quickState: null, now: NOW });

  expect(record.schema_version).toBe("recommendation.v2");
  expect(record.input.session_exclusions).toEqual([]);
  expect(record.winner.dish.id).toBe(record.decision.winner_id);
  expect(await db.decisionSessions.get(record.decision.decision_id)).toBeTruthy();
});

test("retry excludes the current winner and persists a different decision", async () => {
  const first = await startRecommendation({ quickState: null, now: NOW });
  const sameNamedAlternative = catalog.dishes.find(
    (dish) => dish.name === first.winner.dish.name && dish.id !== first.winner.dish.id,
  )!;
  const second = await retryRecommendation(first, NOW);

  expect(second.winner.dish.id).not.toBe(first.winner.dish.id);
  expect(second.session_exclusions).toContain(first.winner.dish.id);
  expect(second.session_exclusions).not.toContain(sameNamedAlternative.id);
  expect(second.input.session_exclusions).toEqual(second.session_exclusions);
  expect(await db.decisionSessions.get(second.decision.decision_id)).toBeTruthy();
});

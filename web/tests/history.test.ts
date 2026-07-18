import { db, getProfile, resetLocalData, saveDecision, saveHistoryEvent, saveProfile } from "../src/db/db";

describe("local history", () => {
  beforeEach(async () => resetLocalData());

  it("persists events and complete decisions in schema version one", async () => {
    await saveHistoryEvent({
      id: "event-1",
      occurred_at: "2026-07-18T12:00:00Z",
      kind: "rejected",
      dish_id: "dish-1",
      rejection_reason: "not_craving",
    });
    await saveDecision({ id: "decision-1", stateId: "day1", payload: { winner: "dish-1" } });
    expect(db.verno).toBe(3);
    expect(await db.historyEvents.count()).toBe(1);
    expect((await db.decisionSessions.get("decision-1"))?.payload).toEqual({ winner: "dish-1" });
  });

  it("persists the version-two user profile", async () => {
    await saveProfile({
      locale: "en",
      excluded_allergens: ["peanuts"],
      excluded_ingredients: [],
      desired_taste_tags: ["warm"],
      budget_minor: 2500,
      duration_minutes: 20,
    });

    expect(await getProfile()).toMatchObject({ locale: "en", budget_minor: 2500 });
  });

  it("reset removes local context and history", async () => {
    await db.settings.put({ key: "mode", value: "demo" });
    await saveHistoryEvent({ id: "event-2", occurred_at: "2026-07-18T12:00:00Z", kind: "accepted" });
    await resetLocalData();
    expect(await db.settings.count()).toBe(0);
    expect(await db.historyEvents.count()).toBe(0);
  });
});

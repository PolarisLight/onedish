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
      preferred_cuisines: ["fujian"],
      budget_minor: 2500,
      budget_is_explicit: true,
      duration_minutes: 20,
    });

    expect(await getProfile()).toMatchObject({ locale: "en", budget_minor: 2500 });
  });

  it("normalizes a legacy stored profile budget to non-explicit", async () => {
    const legacyProfile = {
      locale: "zh-CN",
      excluded_allergens: ["peanuts"],
      excluded_ingredients: ["cilantro"],
      desired_taste_tags: ["spicy"],
      budget_minor: 6000,
      duration_minutes: 30,
    } satisfies Omit<import("../src/recommendation/types").UserProfile, "budget_is_explicit" | "preferred_cuisines">;
    await db.settings.put({ key: "profile.v2", value: legacyProfile as unknown });

    expect(await getProfile()).toEqual({ ...legacyProfile, preferred_cuisines: [], budget_is_explicit: false });
  });

  it("normalizes persisted restaurant cuisines and drops unsupported legacy values", async () => {
    await db.settings.put({ key: "profile.v2", value: {
      locale: "en", excluded_allergens: [], excluded_ingredients: [], desired_taste_tags: ["spicy"],
      preferred_cuisines: ["sichuan", "spicy", "unknown", "sichuan"],
      budget_minor: 2500, budget_is_explicit: false, duration_minutes: 20,
    } });
    expect(await getProfile()).toMatchObject({
      desired_taste_tags: ["spicy"],
      preferred_cuisines: ["sichuan"],
    });
  });

  it.each([
    ["negative budget", { budget_minor: -100 }],
    ["fractional budget", { budget_minor: 2500.5 }],
    ["infinite budget", { budget_minor: Number.POSITIVE_INFINITY }],
    ["budget below the input minimum", { budget_minor: 99 }],
    ["budget above the input maximum", { budget_minor: 100_001 }],
    ["negative duration", { duration_minutes: -1 }],
    ["fractional duration", { duration_minutes: 20.5 }],
    ["infinite duration", { duration_minutes: Number.POSITIVE_INFINITY }],
    ["duration below the input minimum", { duration_minutes: 14 }],
    ["unsupported duration", { duration_minutes: 16 }],
    ["duration above the input maximum", { duration_minutes: 46 }],
  ])("normalizes %s to locale defaults", async (_label, patch) => {
    await db.settings.put({
      key: "profile.v2",
      value: {
        locale: "zh-CN",
        excluded_allergens: ["peanuts"],
        excluded_ingredients: ["cilantro"],
        desired_taste_tags: ["spicy"],
        budget_minor: 6000,
        budget_is_explicit: true,
        duration_minutes: 30,
        ...patch,
      } as unknown,
    });

    expect(await getProfile()).toMatchObject({
      locale: "zh-CN",
      excluded_allergens: ["peanuts"],
      budget_minor: 6000,
      budget_is_explicit: "budget_minor" in patch ? false : true,
      duration_minutes: "duration_minutes" in patch ? 20 : 30,
    });
  });

  it("reset removes local context and history", async () => {
    await db.settings.put({ key: "mode", value: "demo" });
    await saveHistoryEvent({ id: "event-2", occurred_at: "2026-07-18T12:00:00Z", kind: "accepted" });
    await resetLocalData();
    expect(await db.settings.count()).toBe(0);
    expect(await db.historyEvents.count()).toBe(0);
  });
});

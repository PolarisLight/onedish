import { loadDemo } from "../api/client";
import { db, resetLocalData, saveDecision, saveHistoryEvent } from "../db/db";

export async function startDemo() {
  const record = await loadDemo("day1");
  await saveDecision({ id: record.decision.decision_id, stateId: record.state_id, payload: record });
  await seedSyntheticHistory();
  await dbSetMode();
  return record;
}

async function dbSetMode() {
  await db.settings.put({ key: "mode", value: "demo" });
}

async function seedSyntheticHistory() {
  const events = [
    { id: "demo-history-1", occurred_at: "2026-07-18T12:00:00Z", kind: "accepted" as const, dish_id: "ember-bowl-charred-chicken-rice", cuisine_tags: ["asian"], taste_tags: ["warm", "filling"], price_minor: 1080, protein_g: 42 },
    { id: "demo-history-2", occurred_at: "2026-07-17T12:00:00Z", kind: "eaten" as const, dish_id: "night-market-fire-noodle-cup", cuisine_tags: ["asian"], taste_tags: ["warm", "spicy"], price_minor: 1450, protein_g: 28 },
    { id: "demo-history-3", occurred_at: "2026-07-16T12:00:00Z", kind: "eaten" as const, dish_id: "olive-line-herb-chicken-plate", cuisine_tags: ["mediterranean"], taste_tags: ["fresh", "filling"], price_minor: 1620, protein_g: 36 },
  ];
  await Promise.all(events.map(saveHistoryEvent));
}

export async function resetDemo() {
  await resetLocalData();
}

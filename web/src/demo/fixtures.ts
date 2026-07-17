import { loadDemo } from "../api/client";
import { db, resetLocalData, saveDecision } from "../db/db";

export async function startDemo() {
  const record = await loadDemo("day1");
  await saveDecision({ id: record.decision.decision_id, stateId: record.state_id, payload: record });
  await dbSetMode();
  return record;
}

async function dbSetMode() {
  await db.settings.put({ key: "mode", value: "demo" });
}

export async function resetDemo() {
  await resetLocalData();
}

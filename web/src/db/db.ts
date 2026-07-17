import Dexie, { type EntityTable } from "dexie";

export interface SettingRow { key: string; value: unknown }
export interface DailyContextRow { date: string; payload: unknown }
export interface HistoryEventRow {
  id: string;
  occurred_at: string;
  kind: "accepted" | "rejected" | "dismissed" | "eaten" | "corrected" | "reset";
  dish_id?: string;
  rejection_reason?: string;
  cuisine_tags?: readonly string[];
  taste_tags?: readonly string[];
  price_minor?: number;
  protein_g?: number;
}
export interface DecisionSessionRow { id: string; stateId: string; payload: unknown }

class OneDishDB extends Dexie {
  settings!: EntityTable<SettingRow, "key">;
  dailyContext!: EntityTable<DailyContextRow, "date">;
  historyEvents!: EntityTable<HistoryEventRow, "id">;
  decisionSessions!: EntityTable<DecisionSessionRow, "id">;

  constructor() {
    super("onedish");
    this.version(1).stores({
      settings: "key",
      dailyContext: "date",
      historyEvents: "id, occurred_at, kind, dish_id",
      decisionSessions: "id, stateId",
    });
  }
}

export const db = new OneDishDB();

export async function saveHistoryEvent(event: HistoryEventRow) {
  await db.historyEvents.put(event);
}

export async function saveDecision(session: DecisionSessionRow) {
  await db.decisionSessions.put(session);
}

export async function resetLocalData() {
  await db.transaction(
    "rw",
    [db.settings, db.dailyContext, db.historyEvents, db.decisionSessions],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.dailyContext.clear(),
        db.historyEvents.clear(),
        db.decisionSessions.clear(),
      ]);
    },
  );
}

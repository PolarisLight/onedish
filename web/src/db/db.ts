import Dexie, { type EntityTable } from "dexie";
import type { UserProfile } from "../recommendation/types";
import { normalizeRestaurantCuisines } from "../restaurants/cuisines";

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
  base_ingredient?: string;
}
export interface DecisionSessionRow { id: string; stateId: string; payload: unknown }
export type ProtectedDataCategory = "precise_location" | "health_signals" | "meal_history" | "taste_profile" | "identity_device";
export interface PrivacyAccessEventRow {
  id: string;
  occurred_at: string;
  category: ProtectedDataCategory;
  purpose: "nearby_map" | "profile_read" | "profile_delete";
  recipient: "device" | "OpenStreetMap" | "AMap" | "AMap Places + OpenStreetMap";
}

class OneDishDB extends Dexie {
  settings!: EntityTable<SettingRow, "key">;
  dailyContext!: EntityTable<DailyContextRow, "date">;
  historyEvents!: EntityTable<HistoryEventRow, "id">;
  decisionSessions!: EntityTable<DecisionSessionRow, "id">;
  privacyAccessEvents!: EntityTable<PrivacyAccessEventRow, "id">;

  constructor() {
    super("onedish");
    this.version(1).stores({
      settings: "key",
      dailyContext: "date",
      historyEvents: "id, occurred_at, kind, dish_id",
      decisionSessions: "id, stateId",
    });
    this.version(2).stores({
      settings: "key",
      dailyContext: "date",
      historyEvents: "id, occurred_at, kind, dish_id",
      decisionSessions: "id, stateId",
    });
    this.version(3).stores({
      settings: "key",
      dailyContext: "date",
      historyEvents: "id, occurred_at, kind, dish_id",
      decisionSessions: "id, stateId",
      privacyAccessEvents: "id, occurred_at, category, recipient",
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

export async function saveProfile(profile: UserProfile) {
  await db.settings.put({
    key: "profile.v2",
    value: { ...profile, preferred_cuisines: normalizeRestaurantCuisines(profile.preferred_cuisines) },
  });
}

type StoredUserProfile = Omit<UserProfile, "budget_is_explicit" | "preferred_cuisines"> & {
  readonly budget_is_explicit?: boolean;
  readonly preferred_cuisines?: readonly string[];
};

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStoredUserProfile(value: unknown): value is StoredUserProfile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return (profile.locale === "en" || profile.locale === "zh-CN")
    && isStringArray(profile.excluded_allergens)
    && isStringArray(profile.excluded_ingredients)
    && isStringArray(profile.desired_taste_tags)
    && (profile.preferred_cuisines === undefined || isStringArray(profile.preferred_cuisines))
    && typeof profile.budget_minor === "number"
    && (profile.budget_is_explicit === undefined || typeof profile.budget_is_explicit === "boolean")
    && typeof profile.duration_minutes === "number";
}

function validInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= minimum && value <= maximum;
}

export async function getProfile(): Promise<UserProfile | null> {
  const row = await db.settings.get("profile.v2");
  if (!isStoredUserProfile(row?.value)) return null;
  const defaults = row.value.locale === "en"
    ? { budget_minor: 2500, duration_minutes: 20 }
    : { budget_minor: 6000, duration_minutes: 20 };
  const budgetIsValid = validInteger(row.value.budget_minor, 100, 100_000);
  const durationIsValid = [15, 20, 30, 45].includes(row.value.duration_minutes);
  return {
    ...row.value,
    preferred_cuisines: normalizeRestaurantCuisines(row.value.preferred_cuisines),
    budget_minor: budgetIsValid ? row.value.budget_minor : defaults.budget_minor,
    budget_is_explicit: budgetIsValid ? (row.value.budget_is_explicit ?? false) : false,
    duration_minutes: durationIsValid ? row.value.duration_minutes : defaults.duration_minutes,
  };
}

export async function getRecentHistory(days: number, now: Date): Promise<HistoryEventRow[]> {
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  return db.historyEvents
    .where("occurred_at")
    .aboveOrEqual(cutoff)
    .sortBy("occurred_at");
}

export async function resetLocalData() {
  await db.transaction(
    "rw",
    [db.settings, db.dailyContext, db.historyEvents, db.decisionSessions, db.privacyAccessEvents],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.dailyContext.clear(),
        db.historyEvents.clear(),
        db.decisionSessions.clear(),
        db.privacyAccessEvents.clear(),
      ]);
    },
  );
}

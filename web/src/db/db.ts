import Dexie, { type EntityTable } from "dexie";
import type { UserProfile } from "../recommendation/types";
import { normalizeRestaurantCuisines } from "../restaurants/cuisines";
import {
  normalizeRestaurantIntentTags,
  type RestaurantIntentTag,
} from "../restaurants/intent-tags";
import type { RestaurantPreferences } from "../restaurants/preferences";

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
export interface RestaurantIntentEventRow {
  readonly id: string;
  readonly occurred_at: string;
  readonly action: "accepted";
  readonly selected_tags: readonly RestaurantIntentTag[];
  readonly budget_band_minor: number | null;
}

class OneDishDB extends Dexie {
  settings!: EntityTable<SettingRow, "key">;
  dailyContext!: EntityTable<DailyContextRow, "date">;
  historyEvents!: EntityTable<HistoryEventRow, "id">;
  decisionSessions!: EntityTable<DecisionSessionRow, "id">;
  privacyAccessEvents!: EntityTable<PrivacyAccessEventRow, "id">;
  restaurantIntentEvents!: EntityTable<RestaurantIntentEventRow, "id">;

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
    this.version(4).stores({
      settings: "key",
      dailyContext: "date",
      historyEvents: "id, occurred_at, kind, dish_id",
      decisionSessions: "id, stateId",
      privacyAccessEvents: "id, occurred_at, category, recipient",
      restaurantIntentEvents: "id, occurred_at, action",
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

const RESTAURANT_INTENT_KEYS = new Set([
  "id",
  "occurred_at",
  "action",
  "selected_tags",
  "budget_band_minor",
]);
const RESTAURANT_PREFERENCE_KEYS = new Set([
  "selected_tags",
  "budget_minor",
  "budget_is_explicit",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 100
    && value <= 1_000_000;
}

function hasExactKeys(value: Record<string, unknown>, keys: Set<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function hasValidTags(value: unknown, minimum: number): value is readonly RestaurantIntentTag[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > 6) return false;
  return normalizeRestaurantIntentTags(value).length === value.length;
}

function assertRestaurantIntentEvent(value: unknown): asserts value is RestaurantIntentEventRow {
  if (!isPlainObject(value) || !hasExactKeys(value, RESTAURANT_INTENT_KEYS)) {
    throw new Error("Invalid restaurant intent");
  }
  if (
    typeof value.id !== "string"
    || !isIsoTimestamp(value.occurred_at)
    || value.action !== "accepted"
    || !hasValidTags(value.selected_tags, 1)
    || (value.budget_band_minor !== null && !isSafePositiveInteger(value.budget_band_minor))
  ) {
    throw new Error("Invalid restaurant intent");
  }
}

function isRestaurantPreferences(value: unknown): value is RestaurantPreferences {
  if (!isPlainObject(value) || !hasExactKeys(value, RESTAURANT_PREFERENCE_KEYS)) return false;
  return hasValidTags(value.selected_tags, 0)
    && isSafePositiveInteger(value.budget_minor)
    && typeof value.budget_is_explicit === "boolean";
}

export async function saveRestaurantIntent(event: RestaurantIntentEventRow): Promise<void> {
  assertRestaurantIntentEvent(event);
  await db.restaurantIntentEvents.put({ ...event, selected_tags: [...event.selected_tags] });
}

export async function getRecentRestaurantIntents(
  days: number,
  now: Date,
): Promise<RestaurantIntentEventRow[]> {
  const cutoff = now.getTime() - days * 86_400_000;
  return (await db.restaurantIntentEvents.toArray())
    .filter((row) => {
      const timestamp = Date.parse(row.occurred_at);
      return timestamp >= cutoff && timestamp <= now.getTime();
    })
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
    .slice(0, 100);
}

export async function saveRestaurantPreferences(preferences: RestaurantPreferences): Promise<void> {
  if (!isRestaurantPreferences(preferences)) throw new Error("Invalid restaurant preferences");
  await db.settings.put({
    key: "restaurant.preferences.v2",
    value: { ...preferences, selected_tags: [...preferences.selected_tags] },
  });
}

export async function getRestaurantPreferences(
  defaults: RestaurantPreferences,
): Promise<RestaurantPreferences> {
  const value = (await db.settings.get("restaurant.preferences.v2"))?.value;
  if (!isRestaurantPreferences(value)) return defaults;
  return { ...value, selected_tags: [...value.selected_tags] };
}

export async function resetLocalData() {
  await db.transaction(
    "rw",
    [
      db.settings,
      db.dailyContext,
      db.historyEvents,
      db.decisionSessions,
      db.privacyAccessEvents,
      db.restaurantIntentEvents,
    ],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.dailyContext.clear(),
        db.historyEvents.clear(),
        db.decisionSessions.clear(),
        db.privacyAccessEvents.clear(),
        db.restaurantIntentEvents.clear(),
      ]);
    },
  );
}

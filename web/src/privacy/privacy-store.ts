import { db, type PrivacyAccessEventRow, type ProtectedDataCategory } from "../db/db";

export type { PrivacyAccessEventRow, ProtectedDataCategory };

export interface PrivacyAccessInput {
  readonly category: ProtectedDataCategory;
  readonly purpose: PrivacyAccessEventRow["purpose"];
  readonly recipient: PrivacyAccessEventRow["recipient"];
  readonly occurredAt?: string;
}

export async function recordPrivacyAccess(input: PrivacyAccessInput): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  await db.privacyAccessEvents.put({
    id: `privacy-${occurredAt}-${crypto.randomUUID()}`,
    occurred_at: occurredAt,
    category: input.category,
    purpose: input.purpose,
    recipient: input.recipient,
  });
}

export function listPrivacyAccessEvents(): Promise<PrivacyAccessEventRow[]> {
  return db.privacyAccessEvents.orderBy("occurred_at").reverse().toArray();
}

export async function getLocationPermission(): Promise<boolean> {
  const row = await db.settings.get("privacy.location.enabled");
  return row?.value !== false;
}

export async function setLocationPermission(enabled: boolean): Promise<void> {
  await db.settings.put({ key: "privacy.location.enabled", value: enabled });
}

export async function deleteLocalProfileData(): Promise<void> {
  await db.transaction("rw", [db.settings, db.dailyContext, db.historyEvents, db.decisionSessions], async () => {
    await Promise.all([
      db.settings.delete("profile.v2"),
      db.dailyContext.clear(),
      db.historyEvents.clear(),
      db.decisionSessions.clear(),
    ]);
  });
}

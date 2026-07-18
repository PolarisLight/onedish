import { db, resetLocalData } from "../src/db/db";
import {
  deleteLocalProfileData,
  getLocationPermission,
  listPrivacyAccessEvents,
  recordPrivacyAccess,
  setLocationPermission,
} from "../src/privacy/privacy-store";

beforeEach(() => resetLocalData());

test("access events never persist precise coordinates", async () => {
  await recordPrivacyAccess({ category: "precise_location", purpose: "nearby_map", recipient: "OpenStreetMap", occurredAt: "2026-07-18T12:00:00Z" });
  const events = await listPrivacyAccessEvents();
  expect(events[0]).toEqual(expect.objectContaining({ category: "precise_location", recipient: "OpenStreetMap" }));
  expect(JSON.stringify(events)).not.toMatch(/31\.23|121\.47|latitude|longitude/);
});

test("deleting profile data preserves locale and privacy log", async () => {
  await db.settings.bulkPut([{ key: "locale.v2", value: "zh-CN" }, { key: "profile.v2", value: { secret: true } }]);
  await db.historyEvents.put({ id: "meal", occurred_at: new Date().toISOString(), kind: "eaten" });
  await recordPrivacyAccess({ category: "precise_location", purpose: "nearby_map", recipient: "OpenStreetMap", occurredAt: "2026-07-18T12:00:00Z" });
  await deleteLocalProfileData();
  expect((await db.settings.get("locale.v2"))?.value).toBe("zh-CN");
  expect(await db.settings.get("profile.v2")).toBeUndefined();
  expect(await db.historyEvents.count()).toBe(0);
  expect(await listPrivacyAccessEvents()).toHaveLength(1);
});

test("location permission defaults on and persists an explicit opt-out", async () => {
  expect(await getLocationPermission()).toBe(true);
  await setLocationPermission(false);
  expect(await getLocationPermission()).toBe(false);
});

import { useEffect, useState } from "react";
import { useLocale } from "../i18n/locale";
import { PrivacyBoundaryExplorer } from "./PrivacyBoundaryExplorer";
import {
  deleteLocalProfileData,
  getLocationPermission,
  listPrivacyAccessEvents,
  recordPrivacyAccess,
  setLocationPermission,
  type PrivacyAccessEventRow,
} from "./privacy-store";

export function PrivacyPage() {
  const { locale, t } = useLocale();
  const [events, setEvents] = useState<PrivacyAccessEventRow[]>([]);
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => { void Promise.all([listPrivacyAccessEvents(), getLocationPermission()]).then(([rows, enabled]) => { setEvents(rows); setLocationEnabled(enabled); }); }, []);

  async function changeLocation(enabled: boolean) {
    setLocationEnabled(enabled);
    await setLocationPermission(enabled);
  }

  async function confirmDelete() {
    await deleteLocalProfileData();
    await recordPrivacyAccess({ category: "taste_profile", purpose: "profile_delete", recipient: "device" });
    setEvents(await listPrivacyAccessEvents());
    setConfirmingDelete(false);
    setStatus(t("privacy.deleted"));
  }

  return <main className="page privacy-page">
    <p className="hero-kicker">{t("privacy.kicker")}</p>
    <h1 className="page-title">{t("privacy.title")}</h1>
    <p className="page-lede privacy-promise">{t("privacy.promise")}</p>
    <PrivacyBoundaryExplorer />
    <section className="privacy-controls">
      <label className="privacy-toggle"><input type="checkbox" checked={locationEnabled} onChange={(event) => void changeLocation(event.target.checked)} /><span>{t("privacy.allowLocation")}</span></label>
      <article className="privacy-sync"><strong>{t("privacy.sync")}</strong><p>{t("privacy.syncFuture")}</p><button disabled>{t("privacy.sync")}</button></article>
      <button className="secondary-button" onClick={() => setConfirmingDelete(true)}>{t("privacy.deleteProfile")}</button>
      <p role="status">{status}</p>
    </section>
    <section className="privacy-log"><h2>{t("privacy.accessLog")}</h2>{events.length ? <ol>{events.map((event) => <li key={event.id}><time>{new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurred_at))}</time><strong>{t(`privacy.event.${event.purpose}`)}</strong><span>{event.recipient}</span></li>)}</ol> : <p>{t("privacy.noEvents")}</p>}</section>
    {confirmingDelete ? <div className="privacy-dialog-backdrop"><section className="privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-delete-title"><h2 id="privacy-delete-title">{t("privacy.deleteTitle")}</h2><p>{t("privacy.deleteBody")}</p><div><button className="secondary-button" onClick={() => setConfirmingDelete(false)}>{t("common.cancel")}</button><button className="primary-button" onClick={() => void confirmDelete()}>{t("common.delete")}</button></div></section></div> : null}
  </main>;
}

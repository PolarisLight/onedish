import { rejectionReasons, type RejectionReason } from "../domain/contracts";
import { useLocale } from "../i18n/locale";

export function RejectionSheet({ onChoose }: { onChoose: (reason: RejectionReason) => void }) {
  const { t } = useLocale();
  return (
    <section className="rejection-sheet" aria-labelledby="rejection-title">
      <h2 id="rejection-title">{t("winner.rejectTitle")}</h2>
      <p className="page-lede">{t("winner.rejectBody")}</p>
      <div className="reason-grid">
        {rejectionReasons.map((reason) => <button key={reason} onClick={() => onChoose(reason)}>{t(`winner.reject.${reason}`)}</button>)}
      </div>
    </section>
  );
}

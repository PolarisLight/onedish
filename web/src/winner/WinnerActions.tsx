import { useLocale } from "../i18n/locale";

export function WinnerActions({ onRetry, onEdit, onNearby, retrying, exhausted, error }: { readonly onRetry: () => void; readonly onEdit: () => void; readonly onNearby: () => void; readonly retrying: boolean; readonly exhausted: boolean; readonly error: string }) {
  const { t } = useLocale();
  return <div className="winner-action-block">
    <div className="winner-actions">
      <button className="primary-button" onClick={onNearby}>{t("winner.nearby")}</button>
      {!exhausted ? <button className="secondary-button" disabled={retrying} onClick={onRetry}>{retrying ? t("home.picking") : t("winner.another")}</button> : null}
      <button className="text-button" onClick={onEdit}>{t("decision.edit")}</button>
    </div>
    {exhausted ? <p className="page-lede">{t("winner.exhausted")}</p> : null}
    {error ? <p role="alert" className="page-lede">{error}</p> : null}
  </div>;
}

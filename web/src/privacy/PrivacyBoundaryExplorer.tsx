import { useMemo, useState } from "react";
import { useLocale } from "../i18n/locale";
import { getPrivacyCategories } from "./privacy-model";

export function PrivacyBoundaryExplorer() {
  const { t } = useLocale();
  const categories = useMemo(() => getPrivacyCategories(t), [t]);
  const [selectedId, setSelectedId] = useState(categories[0]!.id);
  const selected = categories.find((category) => category.id === selectedId) ?? categories[0]!;
  return <section className="privacy-explorer" aria-label={t("privacy.explorer")}>
    <div className="privacy-map">
      <div className="privacy-device">{t("privacy.deviceCenter")}</div>
      <div className="privacy-category-list">
        {categories.map((category) => <button key={category.id} className={category.id === selected.id ? "is-selected" : ""} aria-pressed={category.id === selected.id} onClick={() => setSelectedId(category.id)}>{category.title}</button>)}
      </div>
      {selected.leavesDevice ? <div className="privacy-flow" aria-label={`${selected.title} → ${selected.recipient}`}><span>{selected.recipient}</span></div> : null}
    </div>
    <div className="privacy-detail" key={selected.id}>
      <h2>{selected.title}</h2>
      <dl>
        <div><dt>{t("privacy.why")}</dt><dd>{selected.purpose}</dd></div>
        <div><dt>{t("privacy.storage")}</dt><dd>{selected.storage}</dd></div>
        <div><dt>{t("privacy.retention")}</dt><dd>{selected.retention}</dd></div>
        <div><dt>{t("privacy.thirdParty")}</dt><dd>{selected.recipient}</dd></div>
      </dl>
    </div>
  </section>;
}

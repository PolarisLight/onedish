import { useMemo, useState } from "react";
import { useLocale } from "../i18n/locale";
import {
  RADIAL_CENTER,
  RADIAL_TRACKS,
  connector,
  privacyReceiver,
  privacySlots,
} from "../shared/radial-geometry";
import { getPrivacyCategories } from "./privacy-model";

export function PrivacyBoundaryExplorer() {
  const { t } = useLocale();
  const categories = useMemo(() => getPrivacyCategories(t), [t]);
  const [selectedId, setSelectedId] = useState(categories[0]!.id);
  const selected = categories.find((category) => category.id === selectedId) ?? categories[0]!;
  const slots = privacySlots();
  const selectedPoint = slots[selected.slotIndex]!.point;
  const selectedConnector = connector(RADIAL_CENTER, selectedPoint);
  const receiverPoint = privacyReceiver();
  const outboundConnector = connector(selectedPoint, receiverPoint);
  return <section className="privacy-explorer" aria-label={t("privacy.explorer")}>
    <div className="privacy-map">
      <svg className="radial-tracks" viewBox="0 0 100 100" aria-hidden="true">
        {RADIAL_TRACKS.map((radius) => (
          <circle key={radius} cx="50" cy="50" r={radius * 100} />
        ))}
      </svg>
      <svg className="privacy-connectors" viewBox="0 0 100 100" aria-hidden="true">
        <line
          data-testid="privacy-selected-connector"
          data-target={selected.id}
          x1={selectedConnector.x1 * 100}
          y1={selectedConnector.y1 * 100}
          x2={selectedConnector.x2 * 100}
          y2={selectedConnector.y2 * 100}
        />
        {selected.leavesDevice ? <line
          data-testid="privacy-outbound-connector"
          className="is-outbound"
          x1={outboundConnector.x1 * 100}
          y1={outboundConnector.y1 * 100}
          x2={outboundConnector.x2 * 100}
          y2={outboundConnector.y2 * 100}
        /> : null}
      </svg>
      <div className="privacy-device">{t("privacy.deviceCenter")}</div>
      <div className="privacy-category-list">
        {categories.map((category) => {
          const point = slots[category.slotIndex]!.point;
          const active = category.id === selected.id;
          return <div
            key={category.id}
            className="privacy-node-position"
            data-privacy-id={category.id}
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          ><button className={active ? "is-selected" : ""} aria-pressed={active} onClick={() => setSelectedId(category.id)}>{category.title}</button></div>;
        })}
      </div>
      {selected.leavesDevice ? <div
        className="privacy-receiver"
        data-testid="privacy-receiver"
        style={{ left: `${receiverPoint.x * 100}%`, top: `${receiverPoint.y * 100}%` }}
      >{selected.recipient}</div> : null}
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

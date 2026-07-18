import { useEffect, useMemo, useState } from "react";
import { db, type HistoryEventRow } from "../db/db";
import { useLocale } from "../i18n/locale";
import { tagMessageKey } from "../i18n/dish-localization";
import { TasteOrbit } from "./TasteOrbit";
import { makeOrbitNodes } from "./orbit-model";

export function TasteOrbitPage() {
  const { t } = useLocale();
  const [events, setEvents] = useState<HistoryEventRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [range, setRange] = useState<7 | 30>(7);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    void db.historyEvents.orderBy("occurred_at").reverse().toArray().then((rows) => { setEvents(rows); setLoaded(true); });
  }, []);

  const nodes = useMemo(() => makeOrbitNodes(events, range, now), [events, range, now]);
  return (
    <main className="page orbit-page">
      <div className="orbit-heading-row">
        <div><p className="hero-kicker">{t("orbit.kicker")}</p><h1 className="page-title">{t("orbit.title")}</h1></div>
        <div className="orbit-range" role="group" aria-label={t("orbit.rangeLabel")}>
          <button aria-pressed={range === 7} onClick={() => setRange(7)}>{t("orbit.range7")}</button>
          <button aria-pressed={range === 30} onClick={() => setRange(30)}>{t("orbit.range30")}</button>
        </div>
      </div>
      <p className="page-lede">{t("orbit.lede")}</p>
      {loaded && nodes.length === 0 ? <section className="orbit-empty"><h2>{t("orbit.emptyTitle")}</h2><p>{t("orbit.emptyBody")}</p></section> : null}
      {nodes.length ? <><TasteOrbit nodes={nodes} /><details className="advanced"><summary>{t("orbit.summary")}</summary><ul>{nodes.map((node) => { const key = tagMessageKey(node.label); return <li key={node.id}>{t(node.count === 1 ? "orbit.nodeOne" : "orbit.nodeMany", { label: key ? t(key) : node.label, count: node.count })}</li>; })}</ul></details></> : null}
    </main>
  );
}

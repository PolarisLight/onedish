import { useEffect, useMemo, useState } from "react";
import { db, type HistoryEventRow } from "../db/db";

function hash(value: string) { return [...value].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 2166136261); }

export function TasteOrbitPage() {
  const [events, setEvents] = useState<HistoryEventRow[]>([]);
  useEffect(() => { void db.historyEvents.orderBy("occurred_at").reverse().toArray().then(setEvents); }, []);
  const recentEvents = useMemo(
    () => events.filter((event) => Date.now() - new Date(event.occurred_at).getTime() <= 7 * 86_400_000),
    [events],
  );
  const demoEvents = useMemo<HistoryEventRow[]>(() => recentEvents.length ? recentEvents : [
    { id: "demo-1", occurred_at: "2026-07-18T12:00:00Z", kind: "accepted", cuisine_tags: ["asian"], taste_tags: ["warm", "filling"], price_minor: 1650, protein_g: 38 },
    { id: "demo-2", occurred_at: "2026-07-17T12:00:00Z", kind: "rejected", cuisine_tags: ["mixed"], taste_tags: ["rich"], price_minor: 1450, protein_g: 28 },
    { id: "demo-3", occurred_at: "2026-07-16T12:00:00Z", kind: "eaten", cuisine_tags: ["asian"], taste_tags: ["warm", "spicy"], price_minor: 1550, protein_g: 32 },
  ], [recentEvents]);
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of demoEvents) for (const tag of [...(event.cuisine_tags ?? []), ...(event.taste_tags ?? [])]) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  }, [demoEvents]);
  const accepted = demoEvents.filter((event) => event.kind === "accepted" || event.kind === "eaten").length;
  const averagePrice = Math.round(demoEvents.reduce((sum, event) => sum + (event.price_minor ?? 0), 0) / demoEvents.length);
  const averageProtein = Math.round(demoEvents.reduce((sum, event) => sum + (event.protein_g ?? 0), 0) / demoEvents.length);
  return (
    <main className="page">
      <p className="hero-kicker">Last seven days</p>
      <h1 className="page-title">Your taste has an orbit.</h1>
      <p className="page-lede">Repeated signals move closer and grow larger. Every cluster has the same information in the list below.</p>
      <div className="orbit-grid">
        <svg className="orbit" viewBox="0 0 600 600" role="img" aria-label="Taste clusters from recent meal history">
          {[110, 200, 270].map((radius) => <circle key={radius} className="orbit-ring" cx="300" cy="300" r={radius} />)}
          <circle cx="300" cy="300" r="42" fill="var(--accent)" />
          <text x="300" y="306" className="orbit-label">YOU</text>
          {tags.map(([tag, count]) => {
            const angle = (hash(tag) % 360) * Math.PI / 180;
            const distance = 240 - count * 42;
            const x = 300 + Math.cos(angle) * distance;
            const y = 300 + Math.sin(angle) * distance;
            const radius = 24 + count * 10;
            return <g key={tag} tabIndex={0} aria-label={`${tag}, ${count} recent signal${count === 1 ? "" : "s"}`}><circle className="orbit-node" cx={x} cy={y} r={radius} fill={count > 1 ? "var(--signal)" : "var(--surface-strong)"} /><text className="orbit-label" x={x} y={y + 4}>{tag}</text></g>;
          })}
        </svg>
        <div className="orbit-stats">
          <div className="orbit-stat"><strong>{Math.round(accepted / demoEvents.length * 100)}%</strong><span>accepted or eaten</span></div>
          <div className="orbit-stat"><strong>${(averagePrice / 100).toFixed(0)}</strong><span>average meal</span></div>
          <div className="orbit-stat"><strong>{averageProtein}g</strong><span>average protein</span></div>
          <div className="orbit-stat"><strong>{tags[0]?.[0] ?? "None"}</strong><span>strongest recent signal</span></div>
        </div>
      </div>
      <details className="advanced"><summary>Text summary of taste clusters</summary><ul>{tags.map(([tag, count]) => <li key={tag}>{tag}: {count} recent signals</li>)}</ul></details>
    </main>
  );
}

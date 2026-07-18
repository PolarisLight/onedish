import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/locale";
import { pointOnOrbit, shortestRotation, type OrbitNode } from "./orbit-model";

interface FocusAnimation { readonly from: number; readonly to: number; readonly startedAt: number }

export function TasteOrbit({ nodes }: { readonly nodes: readonly OrbitNode[] }) {
  const { t } = useLocale();
  const stageRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const focusRef = useRef<FocusAnimation | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const writeAngle = useCallback((angle: number) => {
    angleRef.current = angle;
    stageRef.current?.style.setProperty("--orbit-angle", `${angle}deg`);
  }, []);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const delta = Math.min(now - last, 34);
      last = now;
      const focus = focusRef.current;
      if (focus) {
        const progress = Math.min(1, (now - focus.startedAt) / 1250);
        const eased = 1 - Math.pow(1 - progress, 4);
        writeAngle(focus.from + (focus.to - focus.from) * eased);
        if (progress === 1) focusRef.current = null;
      } else if (!selectedRef.current && !reducedMotion && document.visibilityState !== "hidden") {
        writeAngle(angleRef.current + delta * (360 / 90_000));
      }
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [reducedMotion, writeAngle]);

  function focus(node: OrbitNode) {
    selectedRef.current = node.id;
    setSelectedId(node.id);
    const target = angleRef.current + shortestRotation(angleRef.current, -90 - node.angleDeg);
    if (reducedMotion) writeAngle(target);
    else focusRef.current = { from: angleRef.current, to: target, startedAt: performance.now() };
  }

  function returnToCruise() {
    focusRef.current = null;
    selectedRef.current = null;
    setSelectedId(null);
  }

  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  return (
    <section className="taste-orbit" aria-label={t("nav.orbit")}>
      <div ref={stageRef} className={selected ? "orbit-stage has-focus" : "orbit-stage"}>
        <div className="orbit-wheel" aria-hidden="true"><span /><span /></div>
        <div className="orbit-nodes">
          {nodes.map((node) => {
            const point = pointOnOrbit(node.angleDeg, node.distance, 300, 300);
            const active = node.id === selectedId;
            return <button
              key={node.id}
              type="button"
              className={active ? "orbit-signal is-selected" : "orbit-signal"}
              style={{ left: `${point.x / 6}%`, top: `${point.y / 6}%`, width: node.radius * 2, height: node.radius * 2, opacity: .55 + node.intensity * .45 }}
              aria-label={t(node.count === 1 ? "orbit.nodeOne" : "orbit.nodeMany", { label: node.label, count: node.count })}
              aria-pressed={active}
              data-focus-target={active ? "top" : undefined}
              onClick={() => focus(node)}
            ><span>{node.label}</span></button>;
          })}
        </div>
        <button type="button" className="orbit-you" onClick={returnToCruise}>{t("orbit.you")}</button>
      </div>
      <div className="orbit-detail" aria-live="polite">
        {selected ? <><strong>{selected.label}</strong><span>{t("orbit.accepted", { count: selected.acceptedCount })} · {t("orbit.rejected", { count: selected.rejectedCount })}</span><small>{t("orbit.returnHint")}</small></> : <><strong>{t("orbit.you")}</strong><span>{t("orbit.focusHint")}</span></>}
      </div>
    </section>
  );
}

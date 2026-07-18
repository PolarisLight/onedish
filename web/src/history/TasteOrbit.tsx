import { useCallback, useEffect, useRef, useState } from "react";
import { tagMessageKey } from "../i18n/dish-localization";
import { useLocale } from "../i18n/locale";
import {
  RADIAL_TRACKS,
  focusRotation,
  polarPoint,
} from "../shared/radial-geometry";
import type { OrbitNode } from "./orbit-model";

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
    if (reducedMotion) return;
    let frameId = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const delta = Math.min(now - last, 34);
      last = now;
      const focus = focusRef.current;
      if (focus) {
        const progress = Math.min(1, (now - focus.startedAt) / 650);
        const eased = 1 - Math.pow(1 - progress, 3);
        writeAngle(focus.from + (focus.to - focus.from) * eased);
        if (progress === 1) focusRef.current = null;
      } else if (!selectedRef.current && document.visibilityState !== "hidden") {
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
    const target = focusRotation(angleRef.current, node.angleDeg);
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
        <svg className="radial-tracks" viewBox="0 0 100 100" aria-hidden="true">
          {RADIAL_TRACKS.map((radius) => (
            <circle key={radius} cx="50" cy="50" r={radius * 100} />
          ))}
        </svg>
        <div className="orbit-node-layer">
          {nodes.map((node) => {
            const trackRadius = RADIAL_TRACKS[node.trackIndex]!;
            const point = polarPoint(node.angleDeg, trackRadius);
            const active = node.id === selectedId;
            const labelKey = tagMessageKey(node.label);
            const label = labelKey ? t(labelKey) : node.label;
            return (
              <div
                key={node.id}
                className="radial-node-position"
                data-radial-position
                data-track-radius={trackRadius}
                data-node-angle={node.angleDeg}
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
              >
                <button
                  type="button"
                  className={active ? "orbit-signal is-selected" : "orbit-signal"}
                  style={{
                    width: node.radius * 2,
                    height: node.radius * 2,
                    opacity: .55 + node.intensity * .45,
                  }}
                  aria-label={t(
                    node.count === 1 ? "orbit.nodeOne" : "orbit.nodeMany",
                    { label, count: node.count },
                  )}
                  aria-pressed={active}
                  data-focus-target={active ? "top" : undefined}
                  onClick={() => focus(node)}
                ><span>{label}</span></button>
              </div>
            );
          })}
        </div>
        <button type="button" className="orbit-you" onClick={returnToCruise}>{t("orbit.you")}</button>
      </div>
      <div className="orbit-detail" aria-live="polite">
        {selected ? <><strong>{tagMessageKey(selected.label) ? t(tagMessageKey(selected.label)!) : selected.label}</strong><span>{t("orbit.accepted", { count: selected.acceptedCount })} · {t("orbit.rejected", { count: selected.rejectedCount })}</span><small>{t("orbit.returnHint")}</small></> : <><strong>{t("orbit.you")}</strong><span>{t("orbit.focusHint")}</span></>}
      </div>
    </section>
  );
}

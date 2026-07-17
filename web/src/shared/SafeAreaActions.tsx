import type { ReactNode } from "react";

export function SafeAreaActions({ label, children, secondary }: { readonly label: string; readonly children: ReactNode; readonly secondary?: ReactNode }) {
  return <aside className="safe-area-actions" role="region" aria-label={label}>
    <div className="safe-area-actions__primary">{children}</div>
    {secondary ? <div className="safe-area-actions__secondary">{secondary}</div> : null}
  </aside>;
}

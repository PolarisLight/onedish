import { useState } from "react";

export function DailyContextForm({ onSubmit }: { onSubmit: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try { await onSubmit(); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} aria-label="Daily meal context">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="energy">Energy eaten today</label>
          <input id="energy" type="number" min="0" max="20000" inputMode="numeric" placeholder="1180 kcal" />
          <small>Optional. Missing values stay unknown.</small>
        </div>
        <div className="field">
          <label htmlFor="protein">Protein eaten today</label>
          <input id="protein" type="number" min="0" max="1000" inputMode="numeric" placeholder="72 g" />
          <small>Used only to estimate today&apos;s protein gap.</small>
        </div>
        <div className="field span-two">
          <label htmlFor="craving">What sounds good?</label>
          <textarea id="craving" maxLength={2000} placeholder="Warm, filling, not too greasy" />
        </div>
      </div>
      <details className="advanced">
        <summary>Allergies and budget</summary>
        <div className="form-grid" style={{ marginTop: 18 }}>
          <div className="field">
            <label htmlFor="allergies">Exclude allergens</label>
            <input id="allergies" placeholder="Peanuts, milk" />
            <small>Uncertain allergen matches are excluded conservatively.</small>
          </div>
          <div className="field">
            <label htmlFor="budget">Maximum meal price</label>
            <input id="budget" type="number" min="1" max="1000" placeholder="$17.50" />
          </div>
        </div>
      </details>
      <div className="form-actions"><button className="primary-button" disabled={busy}>{busy ? "Loading demo..." : "Run synthetic demo"}</button></div>
    </form>
  );
}

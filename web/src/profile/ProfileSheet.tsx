import { useEffect } from "react";
import { DailyContextForm } from "../context/DailyContextForm";
import type { UserProfile } from "../recommendation/types";

export function ProfileSheet({
  profile,
  onSave,
  onClose,
}: {
  readonly profile: UserProfile;
  readonly onSave: (profile: UserProfile) => Promise<void>;
  readonly onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-sheet-title">
        <header className="sheet-header">
          <div>
            <p className="hero-kicker">Optional settings</p>
            <h2 id="profile-sheet-title">Meal preferences</h2>
          </div>
          <button className="sheet-close" aria-label="Close preferences" onClick={onClose}>×</button>
        </header>
        <p className="sheet-lede">Set these once. OneDish remembers them on this device.</p>
        <DailyContextForm initialProfile={profile} onSubmit={onSave} onCancel={onClose} />
      </section>
    </div>
  );
}

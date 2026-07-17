export function WinnerActions({ onRetry, onEdit, onNearby, retrying, exhausted, error }: { readonly onRetry: () => void; readonly onEdit: () => void; readonly onNearby: () => void; readonly retrying: boolean; readonly exhausted: boolean; readonly error: string }) {
  return <div className="winner-action-block">
    <div className="winner-actions">
      <button className="primary-button" onClick={onNearby}>Find nearby</button>
      {!exhausted ? <button className="secondary-button" disabled={retrying} onClick={onRetry}>{retrying ? "Picking..." : "Pick another"}</button> : null}
      <button className="text-button" onClick={onEdit}>Edit preferences</button>
    </div>
    {exhausted ? <p className="page-lede">No more safe choices remain. Edit your preferences to continue.</p> : null}
    {error ? <p role="alert" className="page-lede">{error}</p> : null}
  </div>;
}

type Props = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function HeatConfirmModal({ open, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="modal-root" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Dismiss" onClick={onCancel} />
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="heat-confirm-title">
        <h2 id="heat-confirm-title" className="modal-title">
          Heat up the driveway?
        </h2>
        <p className="modal-body">This turns the heater pad relay on (manual ON). You can also say “yes” or “no” into the mic.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary modal-btn" onClick={onConfirm}>
            Yes, heat it
          </button>
          <button type="button" className="btn modal-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

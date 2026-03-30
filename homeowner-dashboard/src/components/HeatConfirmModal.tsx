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
          Turn on BAM Heating?
        </h2>
        <p className="modal-body">
          Confirms manual override — pad relay pulls in. You can also answer by voice with <strong>yes</strong> or{" "}
          <strong>no</strong>.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary modal-btn" onClick={onConfirm}>
            Confirm energize
          </button>
          <button type="button" className="btn modal-btn" onClick={onCancel}>
            Abort
          </button>
        </div>
      </div>
    </div>
  );
}

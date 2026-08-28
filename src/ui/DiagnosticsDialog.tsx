export function DiagnosticsDialog({
  open,
  text,
  onClose,
}: {
  open: boolean;
  text: string;
  onClose: () => void;
}) {
  if (!open || !text) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>Diagnostics</strong>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <pre>{text}</pre>
      </div>
    </div>
  );
}

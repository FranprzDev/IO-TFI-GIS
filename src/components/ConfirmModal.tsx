"use client";

interface Props {
  open: boolean;
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ open, title, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-primary)]">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Esta accion puede modificar escenarios y resultados.</p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 rounded-md border border-[var(--border)] px-3 py-2">Cancelar</button>
          <button type="button" onClick={onConfirm} className="flex-1 rounded-md bg-[var(--btn-active)] px-3 py-2 font-semibold text-white">Confirmar</button>
        </div>
      </div>
    </div>
  );
}

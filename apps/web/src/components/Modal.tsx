import { useEffect, useRef, type ReactNode } from 'react';

/** Modal con <dialog> nativo: centrado, foco atrapado y Esc. Se cierra con ×, Esc o clic fuera. */
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose(): void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // El clic en el fondo llega al propio <dialog>; dentro del contenido, el target es un hijo.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-body stack">
        <div className="row spread">
          <h3>{title}</h3>
          <button type="button" className="modal-close" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}

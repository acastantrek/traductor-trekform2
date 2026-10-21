import { useEffect, useRef, type ReactNode } from 'react';

/** Modal con <dialog> nativo: centrado, foco atrapado y Esc. Se cierra con ×, Esc o clic fuera. */
export function Modal({
  open,
  title,
  onClose,
  children,
  size = 'md',
}: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  /** lg: formularios largos (cursos). */
  size?: 'md' | 'lg';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Si el clic empezó en el contenido y acabó en el fondo (arrastre, o el contenido cambió de
  // tamaño entre apretar y soltar), no se cierra.
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={size === 'lg' ? 'modal modal-lg' : 'modal'}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // El clic en el fondo llega al propio <dialog>; dentro del contenido, el target es un hijo.
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) onClose();
        pressedOnBackdrop.current = false;
      }}
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

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckIcon } from './Icons';

type ShowAlert = (message: string, detail?: string) => void;

const AlertContext = createContext<ShowAlert>(() => {});

/** Muestra el aviso de éxito: `message` en grande y, si hace falta, `detail` debajo. */
export const useSuccessAlert = () => useContext(AlertContext);

/** Aviso de éxito centrado (<dialog> modal). Solo se cierra con «Aceptar» (o Esc). */
export function SuccessAlertProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<{ message: string; detail?: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const show = useCallback<ShowAlert>((message, detail) => setAlert({ message, detail }), []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (alert && !d.open) d.showModal();
    if (!alert && d.open) d.close();
  }, [alert]);

  return (
    <AlertContext.Provider value={show}>
      {children}
      <dialog
        ref={dialog}
        className="alert"
        aria-labelledby="success-alert-message"
        onCancel={(e) => {
          e.preventDefault();
          setAlert(null);
        }}
      >
        {alert && (
          <div className="alert-body">
            <span className="alert-icon">
              <CheckIcon />
            </span>
            <p id="success-alert-message" className="alert-message">
              {alert.message}
            </p>
            {alert.detail && <p className="alert-detail">{alert.detail}</p>}
            <button className="btn primary" autoFocus onClick={() => setAlert(null)}>
              Aceptar
            </button>
          </div>
        )}
      </dialog>
    </AlertContext.Provider>
  );
}

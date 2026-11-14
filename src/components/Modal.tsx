import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

export default function Modal({ title, onClose, busy = false, children }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="adminModal" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="modalHead"><h2 id={titleId}>{title}</h2><button type="button" className="ghost" aria-label="Close dialog" disabled={busy} onClick={onClose}>✕</button></div>
    {children}
  </dialog>;
}

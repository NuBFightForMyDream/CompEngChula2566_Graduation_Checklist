import { type ReactNode, useEffect, useRef } from "react";

interface Props {
  title: string;
  onClose(): void;
  children: ReactNode;
  wide?: boolean;
}

/** ใช้ <dialog> ของเบราว์เซอร์ จึงได้ focus trap และปุ่ม Esc โดยไม่ต้องเขียนเอง */
export function Modal({ title, onClose, children, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog ref={ref} className={`modal${wide ? " wide" : ""}`} onClose={onClose} aria-label={title}>
      <header className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" aria-label="ปิด" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

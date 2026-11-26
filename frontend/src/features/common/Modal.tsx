import { type ReactNode, useEffect, useRef } from "react";

interface Props {
  title: string;
  onClose(): void;
  children: ReactNode;
  wide?: boolean;
  /** false = ต้องเลือกตัวเลือกในหน้าต่างเท่านั้น ปิดด้วย Esc หรือปุ่มกากบาทไม่ได้ */
  dismissible?: boolean;
}

/** ใช้ <dialog> ของเบราว์เซอร์ จึงได้ focus trap และปุ่ม Esc โดยไม่ต้องเขียนเอง */
export function Modal({ title, onClose, children, wide, dismissible = true }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? " wide" : ""}`}
      onClose={onClose}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      aria-label={title}
    >
      <header className="modal-head">
        <h2>{title}</h2>
        {dismissible && (
          <button type="button" className="icon-btn" aria-label="ปิด" onClick={onClose}>
            ✕
          </button>
        )}
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

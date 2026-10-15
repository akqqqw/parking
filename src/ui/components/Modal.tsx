import type { ReactNode } from 'react';

export interface ModalProps {
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

export function Modal({ title, children, onClose, className }: ModalProps): JSX.Element {
  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={onClose}>
      <div
        className={['modal', className ?? ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {title ? <h2 className="modal__title">{title}</h2> : null}
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

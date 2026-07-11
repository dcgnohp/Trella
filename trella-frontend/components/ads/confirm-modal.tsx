'use client';
import React from 'react';
import ReactDOM from 'react-dom';
import Button from '@atlaskit/button/new';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  appearance?: 'danger' | 'primary' | 'warning';
  confirmLoading?: boolean;
  confirmDisabled?: boolean;
  width?: number;
  onConfirm: () => void;
  onClose: () => void;
}

// ponytail: plain portal modal instead of @atlaskit/modal-dialog's ModalTransition.
// When mounted from a persistent (async layout) component, the atlaskit motion
// enter animation could stay stuck at opacity 0 until an unrelated reflow (e.g.
// navigating tabs), so the dialog appeared not to open on click. A portal + fixed
// overlay renders synchronously on isOpen — same pattern the task drawer uses.
export function ConfirmModal({
  isOpen,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  appearance = 'primary',
  confirmLoading = false,
  confirmDisabled = false,
  width = 400,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'var(--trella-blanket, rgba(9,30,66,0.54))',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: 'calc(100vw - 32px)',
          backgroundColor: 'var(--trella-surface)',
          borderRadius: 8,
          boxShadow: 'var(--trella-shadow-overlay, 0 8px 24px rgba(9,30,66,0.25))',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 24px 0' }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 600,
              color: appearance === 'danger' ? 'var(--trella-danger, #DE350B)' : 'var(--trella-text)',
            }}
          >
            {title}
          </h2>
        </div>
        <div style={{ padding: '16px 24px', fontSize: 14, color: 'var(--trella-text)' }}>{body}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '8px 24px 20px' }}>
          <Button appearance="subtle" onClick={onClose}>{cancelLabel}</Button>
          <Button
            appearance={appearance}
            isLoading={confirmLoading}
            isDisabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

'use client';
import React, { Fragment } from 'react';
import Modal, {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
} from '@atlaskit/modal-dialog';
import Button from '@atlaskit/button/new';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  appearance?: 'danger' | 'primary' | 'warning';
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  appearance = 'primary',
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={onClose} width="small">
          <ModalHeader>
            <ModalTitle appearance={appearance === 'danger' ? 'danger' : undefined}>
              {title}
            </ModalTitle>
          </ModalHeader>
          <ModalBody>{body}</ModalBody>
          <ModalFooter>
            <Button appearance="subtle" onClick={onClose}>{cancelLabel}</Button>
            <Button appearance={appearance} onClick={onConfirm}>{confirmLabel}</Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}

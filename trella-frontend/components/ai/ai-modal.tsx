'use client';
import Modal, {
  ModalBody,
  ModalHeader,
  ModalTitle,
  ModalTransition,
} from '@atlaskit/modal-dialog';
import type { ReactNode } from 'react';

interface AiModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testId?: string;
}

/** ADS modal wrapper for AI flows. Renders nothing when closed. */
export function AiModal({
  isOpen,
  onClose,
  title,
  children,
  testId,
}: AiModalProps) {
  return (
    <ModalTransition>
      {isOpen ? (
        <Modal onClose={onClose} testId={testId}>
          <ModalHeader hasCloseButton>
            <ModalTitle>{title}</ModalTitle>
          </ModalHeader>
          <ModalBody>{children}</ModalBody>
        </Modal>
      ) : null}
    </ModalTransition>
  );
}

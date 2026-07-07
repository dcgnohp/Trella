'use client';

import React, { useState } from 'react';
import Modal, {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
} from '@atlaskit/modal-dialog';
import Button from '@atlaskit/button/new';
import { token } from '@atlaskit/tokens';
import { Text } from '@atlaskit/primitives';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import ChevronRightIcon from '@atlaskit/icon/core/chevron-right';
import { usePlanStaging, type StagedChange, type StagedFields } from '../_hooks/use-plan-staging';

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sprintNameById: Record<string, string>;
  statusNameById: Record<string, string>;
}

const FIELD_LABELS: Record<keyof StagedFields, string> = {
  sprintId: 'Sprint',
  startDate: 'Start date',
  dueDate: 'Due date',
  customStatusId: 'Status',
  assigneeId: 'Assignee',
  priority: 'Priority',
};

export function UnsavedChangesDialog({
  isOpen,
  onClose,
  sprintNameById,
  statusNameById,
}: UnsavedChangesDialogProps) {
  const { changes, saveAll, discardChange, discardAll, isSaving } = usePlanStaging();

  const fmt = (field: keyof StagedFields, value: string | null | undefined): string => {
    if (value == null || value === '') return '—';
    if (field === 'sprintId') return sprintNameById[value] ?? 'Backlog';
    if (field === 'customStatusId') return statusNameById[value] ?? value;
    if (field === 'startDate' || field === 'dueDate') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    }
    return value;
  };

  const handleSave = async () => {
    await saveAll();
    onClose();
  };

  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={onClose} width="x-large">
          <ModalHeader hasCloseButton>
            <ModalTitle>Unsaved changes</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div style={{ marginBottom: 16 }}>
              <Text color="color.text.subtle">
                Save work items changed in your plan so they update in your workspace.
              </Text>
            </div>

            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1.2fr 1.2fr',
              gap: 12,
              padding: '8px 12px',
              borderBottom: `2px solid ${token('color.border')}`,
              fontSize: 12,
              fontWeight: 600,
              color: token('color.text.subtle'),
            }}>
              <span>Title</span>
              <span>Category</span>
              <span>Current</span>
              <span>New</span>
            </div>

            {changes.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Text color="color.text.subtle">No unsaved changes.</Text>
              </div>
            ) : (
              changes.map(change => (
                <ChangeRow
                  key={change.taskId}
                  change={change}
                  fmt={fmt}
                  onDiscard={() => discardChange(change.taskId)}
                />
              ))
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              appearance="subtle"
              onClick={discardAll}
              isDisabled={changes.length === 0 || isSaving}
            >
              Discard selected changes
            </Button>
            <Button
              appearance="primary"
              onClick={handleSave}
              isLoading={isSaving}
              isDisabled={changes.length === 0}
            >
              Save changes
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}

function ChangeRow({
  change,
  fmt,
  onDiscard,
}: {
  change: StagedChange;
  fmt: (field: keyof StagedFields, value: string | null | undefined) => string;
  onDiscard: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const changedFields = Object.keys(change.fields) as (keyof StagedFields)[];

  return (
    <div style={{ borderBottom: `1px solid ${token('color.border')}` }}>
      {/* Summary row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1.2fr 1.2fr',
        gap: 12,
        padding: '10px 12px',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: token('color.icon'), display: 'flex' }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDownIcon label="" size="small" /> : <ChevronRightIcon label="" size="small" />}
          </button>
          {change.issueKey && (
            <Text size="small" color="color.text.subtle">{change.issueKey}</Text>
          )}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Text weight="medium">{change.title}</Text>
          </span>
        </div>
        <Text size="small" color="color.text.subtle">Work item</Text>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', color: token('color.link') }}
        >
          <Text size="small" color="color.link">
            {changedFields.length} field{changedFields.length !== 1 ? 's' : ''}
          </Text>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text size="small" color="color.text.subtle">
            {changedFields.length > 1 ? 'Multiple' : FIELD_LABELS[changedFields[0]]}
          </Text>
          <button
            onClick={onDiscard}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: token('color.text.subtlest'), padding: 2 }}
            title="Discard this change"
            aria-label="Discard this change"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Expanded field diffs */}
      {expanded && (
        <div style={{ padding: '0 12px 12px 40px' }}>
          {changedFields.map(field => (
            <div key={field} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.2fr 1.2fr',
              gap: 12,
              padding: '6px 0',
              alignItems: 'center',
            }}>
              <Text size="small" color="color.text.subtle">{FIELD_LABELS[field]}</Text>
              <Text size="small">{fmt(field, change.before[field])}</Text>
              <Text size="small" weight="medium">{fmt(field, change.fields[field])}</Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';
import React, { useState } from 'react';
import Popup from '@atlaskit/popup';
import Button from '@atlaskit/button/new';
import Select from '@atlaskit/select';
import { Box, Stack, Text } from '@atlaskit/primitives';

interface FilterField {
  key: string;
  label: string;
  options: { label: string; value: string }[];
}

interface FilterPopupProps {
  fields: FilterField[];
  values: Record<string, string[]>;
  onChange: (key: string, values: string[]) => void;
  onClear: () => void;
}

export function FilterPopup({ fields, values, onChange, onClear }: FilterPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasFilters = Object.values(values).some(v => v.length > 0);

  return (
    <Popup
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      placement="bottom-start"
      trigger={(triggerProps) => (
        <Button
          {...triggerProps}
          appearance={hasFilters ? 'primary' : 'subtle'}
          onClick={() => setIsOpen(!isOpen)}
        >
          Filter {hasFilters ? `(${Object.values(values).flat().length})` : ''}
        </Button>
      )}
      content={() => (
        <Box padding="space.200" style={{ width: 280 }}>
          <Stack space="space.150">
            <Text weight="medium" size="small">Filter by</Text>
            {fields.map(field => (
              <Stack space="space.050" key={field.key}>
                <Text size="small" color="color.text.subtle">{field.label}</Text>
                <Select
                  isMulti
                  inputId={`filter-${field.key}`}
                  options={field.options}
                  value={field.options.filter(o => values[field.key]?.includes(o.value))}
                  onChange={(selected) => onChange(field.key, Array.from(selected ?? []).map(s => (s as { value: string }).value))}
                  placeholder={`All ${field.label}`}
                />
              </Stack>
            ))}
            {hasFilters && (
              <Button appearance="subtle" onClick={onClear}>Clear all</Button>
            )}
          </Stack>
        </Box>
      )}
    />
  );
}

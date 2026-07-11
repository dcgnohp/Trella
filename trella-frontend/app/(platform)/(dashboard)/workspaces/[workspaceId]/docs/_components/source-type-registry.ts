export type SourceTypeMeta = {
  label: string
  icon: string
  color: string
  editable: boolean
}

export const SOURCE_TYPE_REGISTRY: Record<string, SourceTypeMeta> = {
  MANUAL:        { label: 'Doc',           icon: '📄', color: '#0052CC', editable: true },
  TASK:          { label: 'Task Doc',      icon: '✅', color: '#36B37E', editable: false },
  SPRINT_REPORT: { label: 'Sprint Report', icon: '📊', color: '#FF991F', editable: false },
  MEETING_NOTE:  { label: 'Meeting Notes', icon: '📝', color: '#6554C0', editable: true },
  ADR:           { label: 'ADR',           icon: '🏛️', color: '#172B4D', editable: true },
  RFC:           { label: 'RFC',           icon: '📋', color: '#00B8D9', editable: true },
  ATTACHMENT:    { label: 'Attachment',    icon: '📎', color: '#5E6C84', editable: false },
}

export function getSourceType(type: string): SourceTypeMeta {
  return SOURCE_TYPE_REGISTRY[type] ?? SOURCE_TYPE_REGISTRY.MANUAL
}

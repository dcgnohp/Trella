import * as React from 'react'
import { FileText, CheckSquare, BarChart2, FileEdit, Landmark, ClipboardList, Paperclip } from 'lucide-react'

export type SourceTypeMeta = {
  label: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color: string
  editable: boolean
}

export const SOURCE_TYPE_REGISTRY: Record<string, SourceTypeMeta> = {
  MANUAL:        { label: 'Doc',           icon: FileText,      color: '#0052CC', editable: true },
  TASK:          { label: 'Task Doc',      icon: CheckSquare,   color: '#36B37E', editable: false },
  SPRINT_REPORT: { label: 'Sprint Report', icon: BarChart2,     color: '#FF991F', editable: false },
  MEETING_NOTE:  { label: 'Meeting Notes', icon: FileEdit,      color: '#6554C0', editable: true },
  ADR:           { label: 'ADR',           icon: Landmark,      color: '#172B4D', editable: true },
  RFC:           { label: 'RFC',           icon: ClipboardList, color: '#00B8D9', editable: true },
  ATTACHMENT:    { label: 'Attachment',    icon: Paperclip,     color: '#5E6C84', editable: false },
}

export function getSourceType(type: string): SourceTypeMeta {
  return SOURCE_TYPE_REGISTRY[type] ?? SOURCE_TYPE_REGISTRY.MANUAL
}

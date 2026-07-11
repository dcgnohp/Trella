'use client'

import * as React from 'react'
import { Timer, Zap, Kanban, CheckSquare, Building, Folder, Link2 } from 'lucide-react'

const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  sprint: Timer,
  epic: Zap,
  board: Kanban,
  task: CheckSquare,
  workspace: Building,
  project: Folder,
}

interface Props {
  type: string
  label: string
  href?: string
}

export function LinkedEntityBadge({ type, label, href }: Props) {
  const Icon = ICON_COMPONENTS[type] ?? Link2
  
  const content = (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors">
      <Icon className="w-3 h-3 text-muted-foreground" />
      <span>{label}</span>
    </span>
  )
  return href
    ? <a href={href} className="no-underline" onClick={e => e.stopPropagation()}>{content}</a>
    : content
}

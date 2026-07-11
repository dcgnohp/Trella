'use client'

const ICONS: Record<string, string> = {
  sprint: '🏃',
  epic: '⚡',
  board: '📋',
  task: '✅',
  workspace: '🏢',
  project: '📁',
}

interface Props {
  type: string
  label: string
  href?: string
}

export function LinkedEntityBadge({ type, label, href }: Props) {
  const content = (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors">
      {ICONS[type] ?? '🔗'} {label}
    </span>
  )
  return href
    ? <a href={href} className="no-underline" onClick={e => e.stopPropagation()}>{content}</a>
    : content
}

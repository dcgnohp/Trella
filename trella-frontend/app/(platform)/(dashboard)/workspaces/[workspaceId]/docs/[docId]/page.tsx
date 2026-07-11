'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { KnowledgeEditor } from '../_components/knowledge-editor'
import type { KnowledgeCollection } from '../_components/knowledge-center-client'

async function fetchCollections(workspaceId: string): Promise<KnowledgeCollection[]> {
  const res = await fetch(`/api/knowledge/${workspaceId}/collections`, { cache: 'no-store' })
  if (!res.ok) return []
  return res.json()
}

export default function EditDocPage() {
  const params = useParams()
  const router = useRouter()
  const workspaceId = params.workspaceId as string
  const docId = params.docId as string

  const { data: collections = [] } = useQuery<KnowledgeCollection[]>({
    queryKey: ['knowledge-collections', workspaceId],
    queryFn: () => fetchCollections(workspaceId),
  })

  return (
    <KnowledgeEditor
      workspaceId={workspaceId}
      docId={docId}
      collections={collections}
      onBack={() => router.push(`/workspaces/${workspaceId}/docs`)}
      onSaved={() => router.push(`/workspaces/${workspaceId}/docs`)}
    />
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'

export type DocPref = {
  isPinned: boolean
  isFavorite: boolean
  lastViewedAt: string | null
}

// ponytail: localStorage-backed prefs, swap hook internals to backend when prefs API is ready
export function useKnowledgePrefs(workspaceId: string) {
  const storageKey = `knowledge-prefs:${workspaceId}`

  const [prefs, setPrefs] = useState<Map<string, DocPref>>(() => {
    if (typeof window === 'undefined') return new Map()
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return new Map()
      return new Map(Object.entries(JSON.parse(raw)))
    } catch {
      return new Map()
    }
  })

  const persist = useCallback((next: Map<string, DocPref>) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(next)))
    } catch {}
    setPrefs(new Map(next))
  }, [storageKey])

  const getPref = useCallback((docId: string): DocPref => {
    return prefs.get(docId) ?? { isPinned: false, isFavorite: false, lastViewedAt: null }
  }, [prefs])

  const update = useCallback((docId: string, patch: Partial<DocPref>) => {
    const next = new Map(prefs)
    next.set(docId, { ...getPref(docId), ...patch })
    persist(next)
  }, [prefs, getPref, persist])

  const pin = useCallback((docId: string) => update(docId, { isPinned: true }), [update])
  const unpin = useCallback((docId: string) => update(docId, { isPinned: false }), [update])
  const favorite = useCallback((docId: string) => update(docId, { isFavorite: true }), [update])
  const unfavorite = useCallback((docId: string) => update(docId, { isFavorite: false }), [update])
  const markViewed = useCallback((docId: string) => update(docId, { lastViewedAt: new Date().toISOString() }), [update])

  return { prefs, getPref, pin, unpin, favorite, unfavorite, markViewed }
}

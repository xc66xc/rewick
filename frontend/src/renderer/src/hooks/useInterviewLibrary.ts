import { useEffect, useRef, useState } from 'react'
import type { DesktopBridge, InterviewLibrary, ReferenceDocument } from '../../../shared/types'
import { errorMessage } from './useSettings'

export default function useInterviewLibrary(bridge: DesktopBridge | undefined) {
  const [library, setLibrary] = useState<InterviewLibrary | null>(null)
  const [references, setReferences] = useState<ReferenceDocument[]>([])
  const [loading, setLoading] = useState(Boolean(bridge))
  const [libraryError, setLibraryError] = useState('')
  const [referenceError, setReferenceError] = useState('')
  const [referencesReady, setReferencesReady] = useState(false)
  const active = useRef(false)
  const librarySequence = useRef(0)
  const referenceSequence = useRef(0)
  async function reload() {
    if (!bridge) return undefined
    const request = ++librarySequence.current
    try {
      const next = await bridge.getInterviewLibrary()
      if (active.current && request === librarySequence.current) { setLibrary(next); setLibraryError('') }
      return next
    } catch (reason) { if (active.current && request === librarySequence.current) setLibraryError(errorMessage(reason)); return undefined }
    finally { if (active.current && request === librarySequence.current) setLoading(false) }
  }
  async function reloadReferences() {
    if (!bridge) return
    const request = ++referenceSequence.current
    try { const next = await bridge.listReferences(); if (active.current && request === referenceSequence.current) { setReferences(next); setReferencesReady(true); setReferenceError('') } }
    catch (reason) { if (active.current && request === referenceSequence.current) setReferenceError(errorMessage(reason)) }
  }
  const callbacks = useRef({ reload, reloadReferences })
  callbacks.current = { reload, reloadReferences }
  useEffect(() => {
    active.current = true
    void callbacks.current.reload()
    void callbacks.current.reloadReferences()
    const unsubscribe = bridge?.onEvent(event => {
      if (event.kind === 'interviews-changed') void callbacks.current.reload()
      if (event.kind === 'documents-changed') void callbacks.current.reloadReferences()
    })
    return () => { active.current = false; librarySequence.current++; referenceSequence.current++; unsubscribe?.() }
  }, [bridge])
  function acceptLibrary(next: InterviewLibrary) { librarySequence.current++; if (active.current) { setLibrary(next); setLibraryError(''); setLoading(false) } }
  async function retry() { await Promise.all([reload(), reloadReferences()]) }
  return { library, references, referencesReady, loading, error: [libraryError, referenceError].filter(Boolean).join(' '), reload, retry, acceptLibrary }
}

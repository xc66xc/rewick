import { useEffect, useRef, useState, type RefObject } from 'react'
import type { AsrStatus, Settings, SettingsInput } from '../../../shared/types'
import { selectedPlatformModel } from '../../../shared/platform-models'
import { AutoAnswerCoordinator, type AutoAnswerSnapshot, type AutoAnswerState } from './autoAnswerCoordinator'
import { settingsInput } from './useSettings'
import { explicitServiceReady } from './serviceChoices'

interface AutoAnswerOptions {
  settingsRef: RefObject<Settings>
  read: () => Omit<AutoAnswerSnapshot, 'active' | 'pauseMs'> & { source: 'system' | 'microphone'; status: AsrStatus; assembling: boolean }
  onAnswer: (selection: { question: string; transcript: string; autoWaitMs?: number }) => void
  onFiltered?: (count: number) => void
  saveSettings?: (input: SettingsInput) => Promise<Settings>
}

function isLocalModel(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl)
    return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
  } catch { return false }
}

export function usesPlatformAnswer(settings: Settings): boolean {
  if (settings.serviceSelections?.llm) return settings.serviceSelections.llm.source === 'platform'
  return !settings.llm.hasApiKey && !isLocalModel(settings.llm.baseUrl)
    && Boolean(settings.platform?.enabled && settings.platform.authenticated && settings.platform.capabilities.llm)
}

export function isAnswerModelReady(settings: Settings): boolean {
  return explicitServiceReady(settings, 'llm') ?? (settings.llm.hasApiKey || isLocalModel(settings.llm.baseUrl)
    || (usesPlatformAnswer(settings) && Boolean(selectedPlatformModel(settings.platform))))
}

export function isAsrReady(settings: Settings): boolean {
  return explicitServiceReady(settings, 'asr') ?? (settings.asr.hasApiKey || Boolean(settings.platform?.enabled && settings.platform.authenticated && settings.platform.capabilities.asr))
}

export function useAutoAnswer(options: AutoAnswerOptions) {
  const latest = useRef(options)
  latest.current = options
  const coordinator = useRef<AutoAnswerCoordinator | null>(null)
  const changing = useRef(false)
  const [state, setState] = useState<AutoAnswerState>('off')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const current = new AutoAnswerCoordinator({
      read: () => {
        const settings = latest.current.settingsRef.current
        const snapshot = latest.current.read()
        return { ...snapshot, pauseMs: settings.autoAnswer.pauseMs,
          active: !changing.current && !snapshot.assembling && settings.autoAnswer.enabled && snapshot.source === 'system'
            && snapshot.status === 'listening' && isAnswerModelReady(settings) }
      },
      includeTiming: true,
      answer: selection => latest.current.onAnswer(selection), onFiltered: count => latest.current.onFiltered?.(count), onState: setState,
    })
    coordinator.current = current
    return () => { current.dispose(); if (coordinator.current === current) coordinator.current = null }
  }, []) // A fresh coordinator per mounted effect also handles React StrictMode cleanup/recreation.

  async function setPreferences(next: Settings['autoAnswer']) {
    if (changing.current) throw new Error('自动回答设置正在保存，请稍后再试。')
    const save = latest.current.saveSettings
    if (!save) throw new Error('请在桌面应用中保存自动回答设置。')
    changing.current = true
    setSaving(true)
    coordinator.current?.refresh()
    try {
      const saved = await save({ ...settingsInput(latest.current.settingsRef.current), autoAnswer: next })
      latest.current.settingsRef.current = saved
    } finally {
      changing.current = false
      setSaving(false)
      coordinator.current?.refresh()
    }
  }

  return { state, saving, coordinator, setPreferences }
}

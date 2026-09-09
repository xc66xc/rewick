import { useEffect, useRef, useState } from 'react'
import { defaultSettings } from '../../../shared/defaults'
import type { DesktopBridge, Settings, SettingsInput } from '../../../shared/types'

export function settingsInput(settings: Settings): SettingsInput {
  return {
    serviceSelections: settings.serviceSelections,
    platform: { enabled: settings.platform?.enabled ?? false, baseUrl: settings.platform?.baseUrl ?? 'http://127.0.0.1:8080', selectedModelId: settings.platform?.selectedModelId },
    asr: { url: settings.asr.url, model: settings.asr.model, silenceMs: settings.asr.silenceMs },
    llm: { baseUrl: settings.llm.baseUrl, model: settings.llm.model, temperature: settings.llm.temperature },
    context: settings.context,
    interviewTarget: settings.interviewTarget,
    embedding: { baseUrl: settings.embedding.baseUrl, model: settings.embedding.model, dimensions: settings.embedding.dimensions },
    retrieval: settings.retrieval,
    remoteKnowledge: { enabled: settings.remoteKnowledge.enabled, url: settings.remoteKnowledge.url, agentId: settings.remoteKnowledge.agentId },
    answerStyle: settings.answerStyle,
    autoAnswer: settings.autoAnswer
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '操作未完成，请重试。'
}

export function useSettings(bridge: DesktopBridge | undefined) {
  const [settings, setSettings] = useState(defaultSettings)
  const [loading, setLoading] = useState(Boolean(bridge))
  const [error, setError] = useState('')
  const sequence = useRef(0)
  function apply(value: Settings) { sequence.current++; setSettings(value); setError('') }
  useEffect(() => {
    let active = true
    function reload() {
      const request = ++sequence.current
      if (bridge) void bridge.getSettings().then(value => { if (active && request === sequence.current) setSettings(value) })
        .catch(reason => { if (active && request === sequence.current) setError(errorMessage(reason)) })
        .finally(() => { if (active) setLoading(false) })
    }
    reload()
    const unsubscribe = bridge?.onEvent(event => { if (event.kind === 'interviews-changed' || event.kind === 'settings-changed') reload() })
    return () => { active = false; unsubscribe?.() }
  }, [bridge])
  async function save(input: SettingsInput) {
    if (!bridge) throw new Error('请在桌面应用中保存配置。')
    const scoped = settings.accountScope ? bridge.withAccountScope?.(settings.accountScope) ?? bridge : bridge
    const result = await scoped.saveSettings(input)
    apply(result)
    return result
  }
  return { settings, loading, error, save, apply }
}

import type { PlatformSettings } from './types'

/** Older backends expose only their default model; an explicit empty catalog stays empty. */
export function platformModels(platform: Pick<PlatformSettings, 'models'> | undefined): { id: string; name: string }[] {
  if (!platform) return []
  return platform.models.available ?? (platform.models.llm ? [{ id: platform.models.llm, name: platform.models.llm }] : [])
}

export function selectedPlatformModel(platform: PlatformSettings | undefined): { id: string; name: string } | undefined {
  const id = platform?.selectedModelId || platform?.models.llm
  return platformModels(platform).find(model => model.id === id)
}

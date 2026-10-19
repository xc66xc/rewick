import { readFile, lstat, open, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/** Explicit offline maintenance only. Never imported by the desktop runtime. */
export function cleanRetiredKnowledgeSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1 || !input.settings || typeof input.settings !== 'object') throw new Error('Expected a version 1 desktop settings.json object.')
  const value = structuredClone(input)
  delete value.settings.remoteKnowledge
  delete value.settings.serviceSelections?.knowledge
  delete value.settings.unavailablePlatformSelections?.knowledge
  delete value.secrets?.remoteKnowledge
  if (Array.isArray(value.customServices)) value.customServices = value.customServices.filter(profile => profile.kind !== 'knowledge')
  for (const info of [value.settings.platform, value.platformSession?.info]) {
    if (!info) continue
    delete info.capabilities?.knowledge
    delete info.services?.knowledge
    if (info.desktopDefaults) {
      delete info.desktopDefaults.retrievalMode
      delete info.desktopDefaults.knowledgeServiceId
    }
  }
  return value
}

export async function cleanSettingsFile(path, write = false) {
  const absolute = resolve(path)
  const stat = await lstat(absolute)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000) throw new Error('Expected an ordinary settings file no larger than 2 MB.')
  const original = await readFile(absolute, 'utf8')
  let input
  try { input = JSON.parse(original) } catch { throw new Error('Settings JSON is invalid; no file was changed.') }
  const cleaned = cleanRetiredKnowledgeSettings(input)
  const changed = JSON.stringify(cleaned) !== JSON.stringify(input)
  if (write && changed) {
    const temporary = `${absolute}.${randomUUID()}.tmp`
    try {
      const file = await open(temporary, 'wx', 0o600)
      try { await file.writeFile(JSON.stringify(cleaned, null, 2), 'utf8'); await file.sync() } finally { await file.close() }
      // Refuse overwriting edits made after the preview/read. Exit the desktop before running.
      if (await readFile(absolute, 'utf8') !== original) throw new Error('Settings changed during cleanup; close the desktop and retry.')
      await rename(temporary, absolute)
    } finally { await rm(temporary, { force: true }) }
  }
  return { path: absolute, changed, written: write && changed }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    const write = args.includes('--write')
    const paths = args.filter(arg => arg !== '--write' && arg !== '--dry-run')
    if (!paths.length || paths.some(arg => arg.startsWith('--'))) throw new Error('Usage: node scripts/remove-retired-knowledge-settings.mjs /absolute/path/settings.json [more settings paths] [--write]; default is dry-run. Close the desktop first. Encrypted history drafts are not processed.')
    for (const path of paths) console.info(JSON.stringify(await cleanSettingsFile(path, write)))
  } catch (error) { console.error(error instanceof Error ? error.message : 'Settings cleanup failed.'); process.exitCode = 1 }
}

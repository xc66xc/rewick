import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { cleanRetiredKnowledgeSettings, cleanSettingsFile } from './remove-retired-knowledge-settings.mjs'

const fixture = () => ({ version: 1, settings: { llm: { model: 'working' }, asr: { model: 'speech' }, remoteKnowledge: { apiKey: 'injected', enabled: true }, serviceSelections: { llm: { id: 'kept', source: 'custom' }, knowledge: { id: 'gone' } } }, customServices: [{ id: 'kept', kind: 'llm', secret: 'encrypted-llm' }, { id: 'gone', kind: 'knowledge', secret: 'encrypted-remote' }], secrets: { llm: 'llm-secret', asr: 'asr-secret', platformAccessToken: 'token', remoteKnowledge: 'encrypted-remote' }, rememberedLogin: 'encrypted-login', platformSession: { info: { capabilities: { llm: true, knowledge: true }, services: { asr: [], knowledge: [{ id: 'gone' }] }, desktopDefaults: { version: 3, llmModelId: 'kept', retrievalMode: 'remote', knowledgeServiceId: 'gone' } } } })

test('removes only retired settings and encrypted keys while keeping other account configuration', () => {
  const input = fixture(), output = cleanRetiredKnowledgeSettings(input)
  assert.equal(JSON.stringify(output).includes('knowledge'), false)
  assert.equal(JSON.stringify(output).includes('encrypted-remote'), false)
  assert.deepEqual(output.secrets, { llm: 'llm-secret', asr: 'asr-secret', platformAccessToken: 'token' })
  assert.deepEqual(output.settings.llm, input.settings.llm)
  assert.deepEqual(output.settings.asr, input.settings.asr)
  assert.equal(output.rememberedLogin, input.rememberedLogin)
  assert.deepEqual(output.customServices, [input.customServices[0]])
  assert.deepEqual(cleanRetiredKnowledgeSettings(output), output)
  assert.ok(input.settings.remoteKnowledge)
})

test('dry-run never writes; explicit write is idempotent and invalid/symlink files are refused', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'retired-knowledge-cleanup-'))
  try {
    const path = join(directory, 'settings.json'), original = JSON.stringify(fixture())
    await writeFile(path, original)
    assert.deepEqual(await cleanSettingsFile(path), { path, changed: true, written: false })
    assert.equal(await readFile(path, 'utf8'), original)
    assert.equal((await cleanSettingsFile(path, true)).written, true)
    assert.equal((await cleanSettingsFile(path, true)).changed, false)
    const linked = join(directory, 'linked.json'); await symlink(path, linked)
    await assert.rejects(cleanSettingsFile(linked, true), /ordinary settings/)
    await writeFile(path, 'not-json')
    await assert.rejects(cleanSettingsFile(path, true))
    assert.equal(await readFile(path, 'utf8'), 'not-json')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

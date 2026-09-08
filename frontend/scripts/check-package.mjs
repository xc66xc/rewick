import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright'
import { createPdfRagFixtures, syntheticResumeMarker, syntheticResumeChineseMarker, syntheticCacheMarker } from '../tests/fixtures/pdf-rag.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const appBundle = process.env.COPILOT_TEST_APP_PATH ?? join(root, '../dist/mac-arm64/Interview Copilot.app')
const profile = await mkdtemp(join(tmpdir(), 'copilot-package-'))
const env = { ...process.env, COPILOT_USER_DATA: profile }
delete env.ELECTRON_RUN_AS_NODE
let application
const report = { passed: false, packaged: true, appBundle, pdfTextExtractionTested: false,
  sqlitePersistenceTested: false, providerCalled: false, recordingStarted: false }

async function sqliteFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await sqliteFiles(path))
    else if (/\.(?:sqlite3?|db)$/.test(entry.name) && (await readFile(path)).subarray(0, 16).toString() === 'SQLite format 3\0') files.push(path)
  }
  return files
}

try {
  application = await _electron.launch({
    executablePath: join(appBundle, 'Contents/MacOS/Interview Copilot'),
    args: [], env, timeout: 30000
  })
  const page = await application.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('heading', { name: '面试工作台', exact: true }).waitFor()
  const state = await page.evaluate(() => window.copilot.getSettings())
  assert.equal(state.asr.model, 'fun-asr-realtime')
  assert.equal(state.asr.hasApiKey, false)
  assert.equal(state.llm.hasApiKey, false)
  assert.equal(state.context.text, '')
  assert.equal(await application.evaluate(({ app }) => app.isPackaged), true)
  const fixtures = await createPdfRagFixtures(join(profile, 'synthetic-fixtures'))
  await application.evaluate(({ dialog }, paths) => {
    globalThis.__packageFixtureSelections = [[paths.resume], [paths.cache]]
    dialog.showOpenDialog = async () => {
      const filePaths = globalThis.__packageFixtureSelections.shift()
      if (!filePaths) throw new Error('Unexpected native picker in packaged test')
      return { canceled: false, filePaths }
    }
  }, fixtures)
  const resume = await page.evaluate(() => window.copilot.importContext())
  assert.ok(resume.text.includes(syntheticResumeMarker), 'packaged PDF worker must extract actual fixture text')
  assert.ok(resume.text.includes(syntheticResumeChineseMarker), 'packaged PDF worker must preserve Chinese Unicode text')
  report.pdfTextExtractionTested = true
  assert.equal((await page.evaluate(() => window.copilot.getSettings())).context.text, '', 'preview must not save the resume implicitly')
  await page.evaluate(() => window.copilot.importReferences())
  const documents = await page.evaluate(() => window.copilot.listReferences())
  assert.equal(documents.length, 1)
  assert.equal(documents[0].pageCount, 2)
  assert.ok(['pending', 'ready'].includes(documents[0].status))
  const preview = await page.evaluate(id => window.copilot.previewReference(id), documents[0].id)
  assert.ok(preview.text.includes(syntheticCacheMarker))
  const databases = await sqliteFiles(profile)
  assert.ok(databases.length > 0, 'packaged app must persist a real SQLite database')
  report.sqlitePersistenceTested = true
  await mkdir(join(root, 'test-results'), { recursive: true })
  await page.screenshot({ path: join(root, 'test-results/first-launch.png'), animations: 'disabled' })
  assert.deepEqual(errors, [])
  report.passed = true
  console.log('Packaged .app launches, extracts real PDF text, and persists references in SQLite; no recording or provider call was started.')
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error)
  throw error
} finally {
  await mkdir(join(root, 'test-results'), { recursive: true })
  await writeFile(join(root, 'test-results/package-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await application?.close().catch(() => undefined)
  await rm(profile, { recursive: true, force: true })
}

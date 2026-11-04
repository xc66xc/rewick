import { describe, expect, it } from 'vitest'
import { LocalStorageGate } from '../../src/main/services/local-storage-gate'
import { SerialQueue } from '../../src/main/services/storage'

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

describe('local storage migration gate', () => {
  it('waits for an entered writer, invalidates queued writers and locks immediately', async () => {
    const gate = new LocalStorageGate(), started = deferred(), release = deferred(), events: string[] = []
    const revision = gate.revision
    const active = gate.write(revision, async () => { events.push('writer'); started.resolve(); await release.promise; events.push('writer finished') })
    await started.promise
    const queued = gate.write(revision, async () => { events.push('stale queued writer') })
    // Attach rejection observation before deliberately releasing the queue.
    const rejected = expect(queued).rejects.toThrow('迁移')
    const migrating = gate.migrate(async () => { events.push('migration') })
    expect(gate.migrating).toBe(true)
    expect(gate.revision).toBe(revision + 1)
    await expect(gate.write(gate.revision, async () => undefined)).rejects.toThrow('迁移')
    expect(events).toEqual(['writer'])
    release.resolve()
    await active; await rejected; await migrating
    expect(events).toEqual(['writer', 'writer finished', 'migration'])
    expect(gate.migrating).toBe(false)
    await gate.write(gate.revision, async () => { events.push('new writer') })
    expect(events.at(-1)).toBe('new writer')
  })

  it('rejects an IPC already waiting for account lookup when storage has since changed', async () => {
    const gate = new LocalStorageGate(), lookup = deferred()
    const revisionAtEntry = gate.revision
    let saved = false
    const enteredIpc = async () => {
      await lookup.promise // syncAccount in the main-process dispatcher
      gate.assertCurrent(revisionAtEntry)
      return gate.write(revisionAtEntry, async () => { saved = true })
    }
    const request = enteredIpc(), rejected = expect(request).rejects.toThrow('存储已切换')
    await gate.migrate(async () => undefined)
    lookup.resolve()
    await rejected
    expect(saved).toBe(false)
  })

  it('allows awaited session cleanup inside an entered writer to finish without a nested queue deadlock', async () => {
    const gate = new LocalStorageGate(), started = deferred(), release = deferred(), events: string[] = []
    const revision = gate.revision
    const writer = gate.write(revision, async () => {
      started.resolve(); await release.promise
      await gate.write(revision, async () => { events.push('cleanup') })
    })
    await started.promise
    const migrating = gate.migrate(async () => { events.push('migration') })
    release.resolve()
    await writer; await migrating
    expect(events).toEqual(['cleanup', 'migration'])
  })

  it('does not preserve a writer lease in background callbacks after the writer has finished', async () => {
    const gate = new LocalStorageGate(), later = deferred()
    const revision = gate.revision
    let child: Promise<void> | undefined
    await gate.write(revision, async () => {
      child = later.promise.then(() => gate.write(revision, async () => { throw Error('must never run') }))
    })
    await gate.migrate(async () => undefined)
    const rejected = expect(child).rejects.toThrow('存储已切换')
    later.resolve()
    await rejected
  })

  it('releases the queue after failed migration but still rejects stale operations', async () => {
    const gate = new LocalStorageGate(), revision = gate.revision
    await expect(gate.migrate(async () => { throw Error('legacy denied') })).rejects.toThrow('legacy denied')
    expect(gate.migrating).toBe(false)
    await expect(gate.write(revision, async () => undefined)).rejects.toThrow('存储已切换')
    await expect(gate.write(gate.revision, async () => 'fresh')).resolves.toBe('fresh')
  })

  it('rejects duplicate and nested migrations rather than waiting behind themselves', async () => {
    const gate = new LocalStorageGate(), release = deferred()
    const migration = gate.migrate(() => release.promise)
    await expect(gate.migrate(async () => undefined)).rejects.toThrow('正在迁移')
    release.resolve(); await migration
    await gate.write(gate.revision, async () => {
      await expect(gate.migrate(async () => undefined)).rejects.toThrow('设置正在保存')
    })
  })

  it('keeps platform serialization inside the storage gate in both write and migration paths', async () => {
    const gate = new LocalStorageGate(), platform = new SerialQueue(), started = deferred(), release = deferred(), events: string[] = []
    const writer = gate.write(gate.revision, () => platform.run(async () => {
      started.resolve(); await release.promise; events.push('login saved')
    }))
    await started.promise
    const migration = gate.migrate(() => platform.run(async () => { events.push('migrated') }))
    release.resolve(); await writer; await migration
    expect(events).toEqual(['login saved', 'migrated'])
  })
})

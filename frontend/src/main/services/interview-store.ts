import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { EnvironmentInput, InterviewEnvironment, InterviewLibrary, ResumeInput, Settings, TargetInput } from '../../shared/types'
import { resolveInterviewSettings } from '../../shared/interview-settings'
import { environmentInputSchema, interviewIdSchema, interviewLibrarySchema, persistedInterviewLibrarySchema, resumeInputSchema, targetInputSchema } from './interview-validation'
import { readJson, SerialQueue, writeJsonAtomic } from './storage'
import { parseInput } from './validation'

const MAX_BYTES = 32 * 1_048_576

export class InterviewStore {
  private readonly path: string
  private readonly queue = new SerialQueue()

  constructor(rootDir: string, private readonly seed: () => Promise<{ settings: Settings; referenceIds: string[] }>) {
    this.path = join(rootDir, 'interviews.json')
  }

  list(): Promise<InterviewLibrary> { return this.queue.run(() => this.read()) }

  saveResume(input: ResumeInput): Promise<InterviewLibrary> {
    return this.change(library => {
      const parsed = parseInput(resumeInputSchema, input)
      const previous = parsed.id ? library.resumes.find(resume => resume.id === parsed.id) : undefined
      if (parsed.id && !previous) throw new Error('要修改的简历已不存在，请刷新后重试。')
      const now = new Date().toISOString()
      const next = { ...parsed, id: previous?.id ?? randomUUID(), createdAt: previous?.createdAt ?? now, updatedAt: now }
      library.resumes = previous ? library.resumes.map(resume => resume.id === next.id ? next : resume) : [...library.resumes, next]
    })
  }

  removeResume(id: string): Promise<InterviewLibrary> {
    return this.change(library => {
      parseInput(interviewIdSchema, id)
      if (!library.resumes.some(resume => resume.id === id)) throw new Error('要删除的简历已不存在，请刷新后重试。')
      this.assertUnreferenced(library, 'resumeId', id, '简历')
      library.resumes = library.resumes.filter(resume => resume.id !== id)
    })
  }

  saveTarget(input: TargetInput): Promise<InterviewLibrary> {
    return this.change(library => {
      const parsed = parseInput(targetInputSchema, input)
      const previous = parsed.id ? library.targets.find(target => target.id === parsed.id) : undefined
      if (parsed.id && !previous) throw new Error('要修改的目标岗位已不存在，请刷新后重试。')
      const now = new Date().toISOString()
      const next = { ...parsed, id: previous?.id ?? randomUUID(), createdAt: previous?.createdAt ?? now, updatedAt: now }
      library.targets = previous ? library.targets.map(target => target.id === next.id ? next : target) : [...library.targets, next]
    })
  }

  removeTarget(id: string): Promise<InterviewLibrary> {
    return this.change(library => {
      parseInput(interviewIdSchema, id)
      if (!library.targets.some(target => target.id === id)) throw new Error('要删除的目标岗位已不存在，请刷新后重试。')
      this.assertUnreferenced(library, 'targetId', id, '目标岗位')
      library.targets = library.targets.filter(target => target.id !== id)
    })
  }

  saveEnvironment(input: EnvironmentInput): Promise<InterviewLibrary> {
    return this.change(library => {
      const parsed = parseInput(environmentInputSchema, input)
      const previous = parsed.id ? library.environments.find(environment => environment.id === parsed.id) : undefined
      if (parsed.id && !previous) throw new Error('要修改的面试环境已不存在，请刷新后重试。')
      if (parsed.resumeId !== null && !library.resumes.some(resume => resume.id === parsed.resumeId)) throw new Error('选择的简历已不存在，请重新选择。')
      if (parsed.targetId !== null && !library.targets.some(target => target.id === parsed.targetId)) throw new Error('选择的目标岗位已不存在，请重新选择。')
      const now = new Date().toISOString()
      const next = { ...parsed, id: previous?.id ?? randomUUID(), createdAt: previous?.createdAt ?? now, updatedAt: now }
      library.environments = previous ? library.environments.map(environment => environment.id === next.id ? next : environment) : [...library.environments, next]
    })
  }

  removeEnvironment(id: string): Promise<InterviewLibrary> {
    return this.change(library => {
      parseInput(interviewIdSchema, id)
      if (library.activeEnvironmentId === id) throw new Error('不能删除当前面试环境，请先进入其他环境。')
      if (!library.environments.some(environment => environment.id === id)) throw new Error('要删除的面试环境已不存在，请刷新后重试。')
      library.environments = library.environments.filter(environment => environment.id !== id)
    })
  }

  activate(id: string): Promise<InterviewLibrary> {
    return this.change(library => {
      parseInput(interviewIdSchema, id)
      if (!library.environments.some(environment => environment.id === id)) throw new Error('面试环境已不存在，请刷新后重试。')
      library.activeEnvironmentId = id
    })
  }

  resolve(settings: Settings): Promise<Settings> {
    return this.queue.run(async () => resolveInterviewSettings(settings, await this.read()))
  }

  private change(mutate: (library: InterviewLibrary) => void): Promise<InterviewLibrary> {
    return this.queue.run(async () => {
      const library = await this.read()
      mutate(library)
      return this.write(library)
    })
  }

  private assertUnreferenced(library: InterviewLibrary, key: 'resumeId' | 'targetId', id: string, label: string): void {
    const environments = library.environments.filter(environment => environment[key] === id)
    if (environments.length) throw new Error(`${label}正在被环境“${environments.map(environment => environment.name).join('”、“')}”使用，请先修改这些环境的选择。`)
  }

  private async write(library: InterviewLibrary): Promise<InterviewLibrary> {
    const parsed = parseInput(interviewLibrarySchema, library)
    const persisted = { version: 1, library: parsed }
    if (Buffer.byteLength(JSON.stringify(persisted, null, 2)) > MAX_BYTES) throw new Error('面试资料库超过 32 MB，请减少资料内容后重试。')
    await writeJsonAtomic(this.path, persisted)
    return parsed
  }

  private async read(): Promise<InterviewLibrary> {
    const raw = await readJson(this.path, MAX_BYTES)
    if (raw === undefined) return this.migrate()
    const parsed = persistedInterviewLibrarySchema.safeParse(raw)
    if (!parsed.success) throw new Error('本地面试资料库格式无效，请先备份后检查 interviews.json。')
    return parsed.data.library
  }

  private async migrate(): Promise<InterviewLibrary> {
    const { settings, referenceIds } = await this.seed()
    const now = new Date().toISOString()
    const resumes = settings.context.text.trim() || settings.context.name.trim() ? [{
      id: randomUUID(), name: settings.context.name.trim() || '原有简历', text: settings.context.text, createdAt: now, updatedAt: now,
    }] : []
    const target = settings.interviewTarget
    const targets = target.companyName.trim() || target.roleName.trim() || target.jobDescription.trim() ? [{
      ...target, id: randomUUID(), name: [target.companyName.trim(), target.roleName.trim()].filter(Boolean).join(' · ').slice(0, 255) || '默认目标岗位',
      createdAt: now, updatedAt: now,
    }] : []
    const environment: InterviewEnvironment = {
      id: randomUUID(), name: '默认环境', resumeId: resumes[0]?.id ?? null, targetId: targets[0]?.id ?? null,
      referenceIds, createdAt: now, updatedAt: now,
    }
    return this.write({ resumes, targets, environments: [environment], activeEnvironmentId: environment.id })
  }
}

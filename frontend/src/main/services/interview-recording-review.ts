import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { RecordingProgress } from '../../shared/recording-types'

export function recordingReviewRuntime(options: { isPackaged: boolean; resourcesPath: string; appPath: string }): { pythonPath: string; scriptPath: string; modelPath: string } {
  return options.isPackaged
    ? { pythonPath: join(options.resourcesPath, 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3'), scriptPath: join(options.resourcesPath, 'recording-review.py'), modelPath: join(options.resourcesPath, 'asr-model') }
    : { pythonPath: process.env.REWICK_PYTHON ?? join(options.appPath, 'build/python-runtime/python', process.platform === 'win32' ? 'python.exe' : 'bin/python3'), scriptPath: join(options.appPath, 'scripts/recording-review.py'), modelPath: join(options.appPath, 'build/asr-model') }
}

export function runRecordingReview(options: {
  pythonPath: string; scriptPath: string; audioPath: string; outputPath: string; modelPath?: string
  baseUrl: string; token: string; sessionId: string
  onProgress: (progress: RecordingProgress) => void; signal: AbortSignal
}): Promise<{ path: string }> {
  if (options.signal.aborted) return Promise.reject(new Error('已取消复盘导出。'))
  return new Promise((resolve, reject) => {
    const child = spawn(options.pythonPath, ['-I', options.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, ORT_DISABLE_TELEMETRY: '1' }
    })
    let pending = ''
    let result = false
    let failure = ''
    const cancel = () => child.kill()
    options.signal.addEventListener('abort', cancel, { once: true })
    const timeout = setTimeout(() => { failure = '复盘处理超时。'; child.kill() }, 6 * 60 * 60 * 1000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      pending += chunk
      if (pending.length > 64_000) { failure = '复盘进程响应异常。'; child.kill(); return }
      let end: number
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end); pending = pending.slice(end + 1)
        try {
          const event = JSON.parse(line) as Record<string, unknown>
          if (event.type === 'result') result = true
          if (event.type === 'error' && typeof event.message === 'string') failure = event.message
          if (event.type === 'progress' && ['transcribing', 'summarizing', 'exporting'].includes(String(event.stage)) && typeof event.completed === 'number' && typeof event.total === 'number') {
            options.onProgress({ sessionId: options.sessionId, stage: event.stage as RecordingProgress['stage'], completed: event.completed, total: event.total })
          }
        } catch { failure = '复盘进程响应格式无效。'; child.kill() }
      }
    })
    // Never forward stderr: upstream errors can contain bearer tokens or transcript text.
    child.stderr.resume()
    child.stdin.on('error', () => {})
    child.once('error', () => { failure = '无法启动复盘运行环境，请重新安装客户端。' })
    child.once('close', (code, signal) => {
      clearTimeout(timeout)
      options.signal.removeEventListener('abort', cancel)
      if (options.signal.aborted) reject(new Error('已取消复盘导出。'))
      else if (code === 0 && result && !failure) resolve({ path: options.outputPath })
      else reject(new Error(failure || (signal
        ? `本地复盘进程异常退出（${signal}），请重试；若仍失败，请更新客户端。`
        : `本地复盘进程未完成（退出码 ${code ?? '未知'}），请检查本地运行环境后重试。`)))
    })
    child.stdin.end(JSON.stringify({ audioPath: options.audioPath, outputPath: options.outputPath, baseUrl: options.baseUrl, token: options.token, modelPath: options.modelPath }))
  })
}

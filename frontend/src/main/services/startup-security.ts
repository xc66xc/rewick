import type { App } from 'electron'

const debuggingSwitches = ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk', 'inspect-wait', 'inspect-port']

/** Reject debugging launches before initializing account storage or registering IPC. */
export function enforcePackagedStartup(app: Pick<App, 'isPackaged' | 'commandLine' | 'exit'>, argv: readonly string[]): void {
  if (!app.isPackaged) return
  const blocked = debuggingSwitches.some(name => app.commandLine.hasSwitch(name))
    || argv.some(arg => debuggingSwitches.includes(arg.split('=', 1)[0].replace(/^--/, '')))
  if (blocked) {
    // Never log argument values: other launch arguments may contain credentials.
    console.error('打包版不允许使用调试启动参数。请移除调试参数后重新启动。')
    app.exit(1)
    // Fail closed even if exit is intercepted or unexpectedly returns.
    throw new Error('Packaged application debugging is disabled')
  }
}

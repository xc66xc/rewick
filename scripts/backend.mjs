import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('../backend/', import.meta.url))
const command = process.platform === 'win32' ? 'mvnw.cmd' : './mvnw'
const child = spawn(command, process.argv.slice(2), { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
child.on('error', error => { process.stderr.write(`无法启动后端构建工具：${error.message}\n`); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })

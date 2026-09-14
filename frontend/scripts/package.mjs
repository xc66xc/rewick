// Windows 打包入口：平台地址由 src/shared/platform-transport.ts 的 productionPlatformUrl 统一提供（强制 HTTPS）。
// mac 打包保持原有 pack/dist 脚本不变；本地联调可在 shell 里自行设置 COPILOT_PLATFORM_URL 指向回环地址（仅本机 HTTP 允许）。
// 用法：node scripts/package.mjs <win|mac> <nsis|dmg|dir> <x64|arm64>
import { spawnSync } from 'node:child_process'

const [platform, target, arch] = process.argv.slice(2)
if (!platform || !target) {
  console.error('用法: node scripts/package.mjs <mac|win> <dmg|nsis|dir> [arm64|x64]')
  process.exit(1)
}
const step = (cmd, args) => {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true })
  if (res.status !== 0) process.exit(res.status ?? 1)
}
step('npm', ['run', 'build'])
step('npx', ['electron-builder', `--${platform}`, target, ...(arch ? [`--${arch}`] : [])])

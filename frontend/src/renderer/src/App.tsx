import { useEffect } from 'react'
import type { DesktopBridge } from '../../shared/types'
import ErrorBoundary from './components/ErrorBoundary'
import LoginScreen from './components/LoginScreen'
import { useDesktopAuth } from './hooks/useDesktopAuth'
import { useSettings } from './hooks/useSettings'
import { AppToastProvider } from './components/ui/toast'
import { onWindowScrim } from './lib/window-scrim'
import Workbench from './Workbench'

export default function App({ bridge = window.copilot }: { bridge?: DesktopBridge }) {
  const config = useSettings(bridge)
  const auth = useDesktopAuth(bridge, config)
  // Windows 原生标题条(WCO)在网页层之上,弹窗遮罩盖不到:转发 Modal 挂载信号给主进程着色。
  // mac 红绿灯为系统按钮无着色接口,按平台跳过(jsdom UA 亦不含 Windows,测试零副作用)。
  useEffect(() => {
    if (!navigator.userAgent.includes('Windows')) return
    return onWindowScrim(visible => { void bridge?.setWindowScrim?.(visible) })
  }, [bridge])
  return <ErrorBoundary><AppToastProvider>{auth.ready && bridge
    ? <Workbench key={auth.accountKey} bridge={bridge} config={config} onLogout={auth.logout} />
    : <LoginScreen settings={config.settings} bridge={bridge} checking={config.loading || auth.checking}
      error={auth.error || config.error || config.settings.sessionNotice || ''} onSave={config.save} onAuthenticated={auth.accept} onRetry={auth.retry} />}
  </AppToastProvider></ErrorBoundary>
}

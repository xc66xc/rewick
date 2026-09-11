import type { DesktopBridge } from '../../shared/types'
import ErrorBoundary from './components/ErrorBoundary'
import LoginScreen from './components/LoginScreen'
import { useDesktopAuth } from './hooks/useDesktopAuth'
import { useSettings } from './hooks/useSettings'
import { AppToastProvider } from './components/ui/toast'
import Workbench from './Workbench'

export default function App({ bridge = window.copilot }: { bridge?: DesktopBridge }) {
  const config = useSettings(bridge)
  const auth = useDesktopAuth(bridge, config)
  return <ErrorBoundary><AppToastProvider>{auth.ready && bridge
    ? <Workbench key={auth.accountKey} bridge={bridge} config={config} onLogout={auth.logout} />
    : <LoginScreen settings={config.settings} bridge={bridge} checking={config.loading || auth.checking}
      error={auth.error || config.error} onSave={config.save} onAuthenticated={auth.accept} onRetry={auth.retry} />}
  </AppToastProvider></ErrorBoundary>
}

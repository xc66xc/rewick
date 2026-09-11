import { Component, type ReactNode } from 'react'
import { Button } from './ui/button'

interface ErrorBoundaryProps { children: ReactNode }
interface ErrorBoundaryState { failed: boolean }
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state = { failed: false }
  static getDerivedStateFromError(): ErrorBoundaryState { return { failed: true } }
  render() {
    if (this.state.failed) return <main className="flex h-dvh flex-col items-center justify-center gap-4 p-8"><h1>界面暂时无法显示</h1><p>请重新打开应用，已保存的会话会保留。</p>
      <Button variant="primary" onClick={() => window.location.reload()}>重新载入</Button></main>
    return this.props.children
  }
}

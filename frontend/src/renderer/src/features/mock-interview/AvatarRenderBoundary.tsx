import { Component, type ReactNode } from 'react'

/** Also catches a failed lazy engine import before a WebGL canvas exists. */
export default class AvatarRenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { console.error('Interviewer engine loading failed:', error) }
  render() {
    return this.state.failed
      ? <div className="mock-interviewer__loading" role="alert">角色引擎无法加载，请在下方切换 2D，或重启应用后重试。</div>
      : this.props.children
  }
}

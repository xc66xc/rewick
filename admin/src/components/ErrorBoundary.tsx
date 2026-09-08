import { Component, type ReactNode } from 'react'
import styles from '../styles.module.css'
interface Props { children: ReactNode }
export default class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className={styles.empty} role="alert"><h2>页面暂时无法显示</h2><p>重新打开此页面，或刷新后登录。</p><button className={styles.secondaryButton} onClick={() => this.setState({ failed: false })}>重试</button></div> : this.props.children }
}

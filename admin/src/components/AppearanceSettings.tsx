import { Sun, Moon, Desktop, Check } from '@phosphor-icons/react'
import Modal from './Modal'
import type { Appearance, Theme, Density } from '../appearance'
import styles from '../styles.module.css'
import layout from './AppearanceSettings.module.css'
interface Props { value: Appearance; error: string; onChange: (patch: Partial<Appearance>) => void; onClose: () => void }
const themes: { value: Theme; label: string; icon: typeof Sun }[] = [{ value: 'light', label: '浅色', icon: Sun }, { value: 'dark', label: '深色', icon: Moon }, { value: 'system', label: '跟随系统', icon: Desktop }]
const densities: { value: Density; label: string; description: string }[] = [{ value: 'comfortable', label: '宽松', description: '56 px' }, { value: 'standard', label: '标准', description: '48 px' }, { value: 'compact', label: '紧凑', description: '40 px' }]
export default function AppearanceSettings({ value, error, onChange, onClose }: Props) {
  return <Modal title="外观设置" onClose={onClose}><div className={styles.modalBody}>
    <p className={styles.hint}>调整管理后台的阅读方式，设置即时生效并保存在当前浏览器。</p>
    <fieldset className={layout.group}><legend>界面主题</legend><div className={layout.options}>{themes.map(item => <label key={item.value} className={layout.option}>
      <input type="radio" name="theme" value={item.value} checked={value.theme === item.value} onChange={() => onChange({ theme: item.value })} /><item.icon size={22} /><span>{item.label}</span><Check className={layout.check} size={16} />
    </label>)}</div></fieldset>
    <fieldset className={layout.group}><legend>信息密度</legend><div className={layout.options}>{densities.map(item => <label key={item.value} className={layout.option}>
      <input type="radio" name="density" value={item.value} checked={value.density === item.value} onChange={() => onChange({ density: item.value })} /><span className={layout.densityPreview} data-density={item.value} aria-hidden="true"><i /><i /><i /></span><span>{item.label}</span><small>最小行高 {item.description}</small>
    </label>)}</div></fieldset>
    <label className={layout.motion}><div><strong>界面动效</strong><p>页面入场、导航切换和浮层过渡；系统开启减少动态效果时自动减少。</p></div><input type="checkbox" role="switch" aria-label="界面动效" checked={value.motion} onChange={event => onChange({ motion: event.target.checked })} /></label>
    {error && <p className={styles.warning} role="status">{error}</p>}
  </div><div className={styles.modalFooter}><span className={styles.hint}>仅影响显示，不改变业务设置</span><button className={styles.primaryButton} onClick={onClose}>完成</button></div></Modal>
}

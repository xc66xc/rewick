import { suggestThinkingProtocol, thinkingModeNames, thinkingProtocolNames, type ThinkingMode, type ThinkingProtocol } from '../thinking'
import styles from '../styles.module.css'
interface ThinkingValue { thinkingMode?: ThinkingMode; thinkingProtocol?: ThinkingProtocol; url?: string }
interface Props { value: ThinkingValue; disabled: boolean; onChange: (value: Required<Pick<ThinkingValue, 'thinkingMode' | 'thinkingProtocol'>>) => void }
export default function ThinkingFields({ value, disabled, onChange }: Props) {
  const mode = value.thinkingMode ?? 'default'
  const protocol = value.thinkingProtocol ?? 'none'
  return <>
    <div className={styles.twoColumns}>
      <label className={styles.field}>思考模式<select disabled={disabled} value={mode} onChange={event => onChange({ thinkingMode: event.target.value as ThinkingMode, thinkingProtocol: protocol === 'none' ? suggestThinkingProtocol(value.url ?? '') : protocol })}>
        {Object.entries(thinkingModeNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      {mode !== 'default' && <label className={styles.field}>思考参数协议<select required disabled={disabled} value={protocol === 'none' ? '' : protocol} onChange={event => onChange({ thinkingMode: mode, thinkingProtocol: (event.target.value || 'none') as ThinkingProtocol })}>
        <option value="">请选择模型支持的协议</option>{Object.entries(thinkingProtocolNames).filter(([key]) => key !== 'none').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>}
    </div>
    <p className={styles.hint}>实时面试建议关闭思考。开启可能增加等待时间和 Token 消耗；请确认模型支持所选协议。跟随默认表示不发送开关参数，不保证关闭思考。专业术语提取、录音整理会在支持的协议上单独关闭思考。</p>
  </>
}

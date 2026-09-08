import styles from '../styles/App.module.css'
import libraryStyles from '../styles/InterviewLibrary.module.css'

interface DraftChangeNoticeProps { onKeep: () => void; onDiscard: () => void }
export default function DraftChangeNotice({ onKeep, onDiscard }: DraftChangeNoticeProps) {
  return <div className={libraryStyles.draftNotice} role="status"><p>当前草稿尚未保存。继续操作前，请选择保留草稿或放弃修改。</p>
    <div className={libraryStyles.actions}><button className={styles.secondaryButton} onClick={onKeep}>保留草稿</button><button className={styles.textButton} onClick={onDiscard}>放弃草稿并继续</button></div>
  </div>
}

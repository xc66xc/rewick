import type { ApiClient } from '../api'
import { downloadsSchema } from '../downloads'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
import ClientDownloadEditor from '../components/ClientDownloadEditor'
import styles from '../styles.module.css'
export default function ClientDownloadsPage({ api }: { api: ApiClient }) {
  const { state, reload } = useResource(api, '/admin/client-downloads', downloadsSchema)
  return <section className={styles.pageBody} aria-label="客户端下载"><div className={styles.sectionHeading}><div><h2>客户端下载</h2><p>每个平台只保留最新安装包，启用后在落地页提供免费下载。</p></div></div>
    {state.kind === 'ready' ? state.data.map(item => <ClientDownloadEditor key={item.id} api={api} initial={item} />) : <LoadState error={state.kind === 'error' ? state.error : undefined} onRetry={reload} />}
  </section>
}

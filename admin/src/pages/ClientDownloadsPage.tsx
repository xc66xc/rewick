import type { ApiClient } from '../api'
import { downloadsSchema } from '../downloads'
import { useResource } from '../hooks/useResource'
import LoadState from '../components/LoadState'
import ClientDownloadsOverview from '../components/ClientDownloadsOverview'
import styles from '../styles.module.css'
export default function ClientDownloadsPage({ api }: { api: ApiClient }) {
  const { state, reload } = useResource(api, '/admin/client-downloads', downloadsSchema)
  return <section className={styles.pageBody} aria-label="客户端下载"><div className={styles.sectionHeading}><div><h2>客户端下载</h2><p>管理各平台的最新安装包</p></div></div>
    {state.kind === 'ready' ? <ClientDownloadsOverview api={api} initial={state.data} /> : <LoadState error={state.kind === 'error' ? state.error : undefined} onRetry={reload} />}
  </section>
}

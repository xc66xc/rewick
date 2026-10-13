import type { ReactNode } from 'react'
import type { z } from 'zod'
import type { ApiClient } from '../../api'
import { useOperationsResource } from '../../hooks/useOperationsResource'
import OperationsFreshness from './OperationsFreshness'
import styles from '../../styles.module.css'
import LoadState from '../LoadState'
interface Props<T> { api: ApiClient; path: string; schema: z.ZodType<T>; active: boolean; children: (data: T) => ReactNode }
export default function OperationsResourcePanel<T extends { updatedAt: string; stale: boolean }>({ api, path, schema, active, children }: Props<T>) {
  const { state, reload } = useOperationsResource(api, path, schema, active)
  return state.kind === 'ready' ? <><OperationsFreshness updatedAt={state.data.updatedAt} stale={state.data.stale} />{state.data.stale && <p className={styles.warning}>当前观测数据不完整或已过期，空列表与未知值不代表没有业务活动。</p>}{children(state.data)}</> : <LoadState error={state.kind === 'error' ? state.error : undefined} onRetry={reload} />
}

<script setup lang="ts">
import { ref } from 'vue'
import type { ApiClient } from '../../api'
import { duration } from '../../duration'
import { dateTime, type User } from '../../types'
import { transactionsSchema } from '../../wallet'
import { useResource } from '../../composables/useResource'
import Modal from '../ui/Modal.vue'
import DataTable from '../ui/DataTable.vue'
import Pagination from '../ui/Pagination.vue'
import Button from '../ui/Button.vue'
const props = defineProps<{ api: ApiClient; user: User }>()
const emit = defineEmits<{ close: [] }>()
const page = ref(1)
const { state, reload } = useResource(props.api, () => `/admin/users/${encodeURIComponent(props.user.id)}/wallet/transactions?page=${page.value}&size=20`, transactionsSchema)
const columns = [{ key: 'delta', title: '变动' }, { key: 'reason', title: '原因 / 操作者' }, { key: 'createdAt', title: '时间' }]
</script>
<template><Modal :open="true" :title="`时长记录 · ${user.displayName}`" :width="760" @close="emit('close')"><p v-if="state.kind === 'error'" class="field-error" role="alert">{{ state.error }}<Button @click="reload">重试</Button></p><template v-else><DataTable :columns="columns" :data="state.kind === 'ready' ? state.data.items : []" :loading="state.kind === 'loading'" empty-text="暂无时长变动记录。"><template #cell-delta="{ row }"><span>{{ row.deltaSeconds < 0 ? '−' : '+' }}{{ duration(Math.abs(row.deltaSeconds)) }}</span><small class="muted cell-sub">{{ duration(row.beforeSeconds) }} → {{ duration(row.afterSeconds) }}</small></template><template #cell-reason="{ row }">{{ row.reason }}<small class="muted cell-sub">{{ row.actorDisplayName ?? '系统计时' }}<template v-if="row.sessionId"> · 面试 {{ row.sessionId }}</template></small></template><template #cell-createdAt="{ row }">{{ dateTime(row.createdAt) }}</template></DataTable><Pagination v-if="state.kind === 'ready'" :page="state.data.page" :total="state.data.total" :page-size="state.data.size" :sizes="[20]" @update:page="page = $event" /></template></Modal></template>

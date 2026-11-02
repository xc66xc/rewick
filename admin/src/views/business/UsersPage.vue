<script setup lang="ts">
import { computed, onDeactivated, ref } from 'vue'
import type { ApiClient } from '../../api'
import { usersSchema, dateTime, type User } from '../../types'
import { duration } from '../../duration'
import { useResource } from '../../composables/useResource'
import PageHeader from '../../components/ui/PageHeader.vue'
import Panel from '../../components/ui/Panel.vue'
import DataTable from '../../components/ui/DataTable.vue'
import Button from '../../components/ui/Button.vue'
import Field from '../../components/ui/Field.vue'
import TextInput from '../../components/ui/TextInput.vue'
import Pagination from '../../components/ui/Pagination.vue'
import StatusTag from '../../components/ui/StatusTag.vue'
import Avatar from '../../components/ui/Avatar.vue'
import UserEditor from '../../components/business-rewick/UserEditor.vue'
import UserSecurityDialog from '../../components/business-rewick/UserSecurityDialog.vue'
import WalletEditor from '../../components/business-rewick/WalletEditor.vue'
import WalletHistory from '../../components/business-rewick/WalletHistory.vue'
import MockUserBalance from '../../components/business-rewick/MockUserBalance.vue'
import UserOverview from '../../components/business-rewick/UserOverview.vue'
import UserMoreActions from '../../components/business-rewick/UserMoreActions.vue'
const props = defineProps<{ api: ApiClient; active?: boolean }>()
type Selection = { kind: 'create' } | { kind: 'edit' | 'password' | 'revoke' | 'wallet' | 'history' | 'mock-wallet'; user: User }
const search = ref(''), query = ref(''), page = ref(1), selection = ref<Selection | null>(null), overview = ref<User | null>(null), notice = ref(''), mockRevision = ref(0)
const { state, reload } = useResource(props.api, () => `/admin/users?${new URLSearchParams({ query: query.value, page: String(page.value), size: '20' })}`, usersSchema)
onDeactivated(() => { selection.value = null; overview.value = null })
const rows = computed(() => state.value.kind === 'ready' ? state.value.data.items : [])
const columns = [{ key: 'user', title: '用户', minWidth: 190 }, { key: 'enabled', title: '状态' }, { key: 'duration', title: '辅助可用时长' }, { key: 'mock', title: '模拟可用时长' }, { key: 'createdAt', title: '创建时间' }, { key: 'actions', title: '操作', className: 'col-actions', minWidth: 240 }]
function applySearch() { overview.value = null; const next = search.value.trim(); if (query.value === next && page.value === 1) reload(); query.value = next; page.value = 1 }
function saved() { selection.value = null; notice.value = '用户设置已更新。'; reload() }
function mockSaved() { selection.value = null; mockRevision.value++; notice.value = '模拟余额已更新，辅助余额不变。' }
function choose(kind: 'edit' | 'password' | 'revoke' | 'wallet' | 'history' | 'mock-wallet', user: User) { overview.value = null; selection.value = { kind, user } }
function clock(seconds: number) { return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':') }
</script>
<template><div class="page"><PageHeader title="用户管理" desc="管理账号与面试时长"><Button variant="primary" icon="plus" @click="selection = { kind: 'create' }">创建用户</Button></PageHeader><div class="stack"><form class="search-form m-surface reveal" @submit.prevent="applySearch"><Field label="邮箱或显示名称"><TextInput v-model="search" placeholder="搜索邮箱或显示名称" icon="search" :maxlength="254" /></Field><div class="search-actions"><Button variant="primary" type="submit" icon="search">搜索</Button></div></form><p v-if="notice" role="status" class="business-notice business-feedback">{{ notice }}</p><Panel class="reveal" title="平台用户列表" :meta="state.kind === 'ready' ? `共 ${state.data.total} 位用户` : ''"><template #tools><Button size="sm" icon="refresh" @click="reload">刷新</Button></template><p v-if="state.kind === 'error'" class="field-error" role="alert">{{ state.error }}<Button @click="reload">重试</Button></p><DataTable v-if="state.kind !== 'error'" :columns="columns" :data="rows" :loading="state.kind === 'loading'" :min-width="1080" empty-text="没有匹配的用户，可调整搜索或创建新用户。"><template #cell-user="{ row }"><button class="cell-main user-identity" :aria-label="`查看用户 ${row.displayName}`" @click="overview = row"><Avatar :name="row.displayName" /><span><strong>{{ row.displayName }}</strong><small class="muted cell-sub">{{ row.role === 'ADMIN' ? '管理员' : '普通用户' }} · ID {{ row.id }}</small></span></button></template><template #cell-enabled="{ row }"><StatusTag :status="row.enabled" on="已启用" off="已停用" /></template><template #cell-duration="{ row }"><span class="tnum" :aria-label="duration(row.availableSeconds)">{{ clock(row.availableSeconds) }}</span></template><template #cell-mock="{ row }"><MockUserBalance :key="`${row.id}-${mockRevision}`" :api="api" :user-id="row.id" /></template><template #cell-createdAt="{ row }"><span class="tnum">{{ dateTime(row.createdAt) }}</span></template><template #cell-actions="{ row }"><div class="row-actions"><Button variant="text" size="sm" :aria-label="`调整时长 ${row.displayName}`" @click="choose('wallet', row)">调整时长</Button><Button variant="text" size="sm" :aria-label="`编辑 ${row.displayName}`" @click="choose('edit', row)">编辑</Button><UserMoreActions :name="row.displayName" @select="choose($event, row)" /></div></template></DataTable><Pagination v-if="state.kind === 'ready'" :page="state.data.page" :page-size="state.data.size" :sizes="[20]" :total="state.data.total" @update:page="page = $event; overview = null" /></Panel><UserOverview v-if="overview" :user="overview" @close="overview = null" @action="choose($event, overview)" /><UserEditor v-if="selection?.kind === 'create' || selection?.kind === 'edit'" :key="selection.kind === 'create' ? 'create' : selection.user.id" :api="api" :user="selection.kind === 'edit' ? selection.user : undefined" @close="selection = null" @saved="saved" /><WalletEditor v-if="selection?.kind === 'wallet' || selection?.kind === 'mock-wallet'" :key="`${selection.kind}-${selection.user.id}`" :api="api" :user="selection.user" :mock="selection.kind === 'mock-wallet'" @close="selection = null" @saved="selection.kind === 'mock-wallet' ? mockSaved() : saved()" /><WalletHistory v-if="selection?.kind === 'history'" :api="api" :user="selection.user" @close="selection = null" /><UserSecurityDialog v-if="selection?.kind === 'password' || selection?.kind === 'revoke'" :api="api" :user="selection.user" :mode="selection.kind" @close="selection = null" @saved="saved" /></div></div></template>

<style scoped>.user-identity { border: 0; padding: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; }.user-identity:hover { color: var(--blue); }.cell-sub { display: block; }</style>

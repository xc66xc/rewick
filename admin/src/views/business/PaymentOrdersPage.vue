<script setup lang="ts">
import { computed, ref } from 'vue'
import { message, type ApiClient } from '../../api'
import { duration } from '../../duration'
import { dateTime } from '../../types'
import { money, paymentOrdersSchema, paymentOrderSchema, paymentStatus, paymentMethodName, type PaymentOrder } from '../../payments'
import { useResource } from '../../composables/useResource'
import PageHeader from '../../components/ui/PageHeader.vue'
import Button from '../../components/ui/Button.vue'
import Field from '../../components/ui/Field.vue'
import TextInput from '../../components/ui/TextInput.vue'
import Select from '../../components/ui/Select.vue'
import Segmented from '../../components/ui/Segmented.vue'
import Panel from '../../components/ui/Panel.vue'
import DataTable from '../../components/ui/DataTable.vue'
import Pagination from '../../components/ui/Pagination.vue'
import Tag from '../../components/ui/Tag.vue'
import PaymentOrderOverview from '../../components/business-rewick/PaymentOrderOverview.vue'
import PaymentRefundDialog from '../../components/business-rewick/PaymentRefundDialog.vue'
const props = defineProps<{ api: ApiClient; active?: boolean }>()
const { state, reload } = useResource(props.api, '/admin/payment-orders', paymentOrdersSchema)
const status = ref('all'), channel = ref('all'), page = ref(1), selectedId = ref<string | null>(null), filter = ref(''), refunding = ref<PaymentOrder | null>(null), busy = ref<string | null>(null), error = ref(''), notice = ref('')
const orders = computed(() => state.value.kind === 'ready' ? state.value.data.filter(order => `${order.displayName} ${order.id} ${order.packageName} ${paymentMethodName(order.paymentMethod)}`.toLowerCase().includes(filter.value.trim().toLowerCase()) && (channel.value === 'all' || order.paymentMethod === channel.value) && (status.value === 'all' || (status.value === 'pending' ? ['pending','creating','cancelling'].includes(order.status) : order.status === status.value))) : [])
const currentPage = computed(() => Math.min(page.value, Math.max(1, Math.ceil(orders.value.length / 20))))
const visible = computed(() => orders.value.slice((currentPage.value - 1) * 20, currentPage.value * 20))
const selected = computed(() => orders.value.find(order => order.id === selectedId.value))
const columns = [{ key: 'user', title: '用户' }, { key: 'id', title: '订单号', minWidth: 160 }, { key: 'package', title: '套餐 / 时长' }, { key: 'amount', title: '支付金额' }, { key: 'channel', title: '支付渠道' }, { key: 'status', title: '支付状态' }, { key: 'credited', title: '时长到账' }, { key: 'actions', title: '操作', className: 'col-actions', minWidth: 180 }]
const statuses = [{ value: 'all', label: '全部' }, { value: 'pending', label: '待支付' }, { value: 'paid', label: '已支付' }, { value: 'closed', label: '已关闭' }]
const channels = [{ value: 'all', label: '全部渠道' }, { value: 'wechat', label: '微信' }, { value: 'alipay', label: '支付宝' }, { value: 'zpay', label: 'ZPAY' }]
function resetSelection() { page.value = 1; selectedId.value = null }
async function refresh(order: PaymentOrder) { if (busy.value) return; busy.value = order.id; error.value = ''; notice.value = ''; try { const result = await props.api.request(`/admin/payment-orders/${encodeURIComponent(order.id)}/refresh`, paymentOrderSchema, { method: 'POST' }); notice.value = `订单 ${result.id}：${paymentStatus(result)}`; reload() } catch (failure) { error.value = message(failure) } finally { busy.value = null } }
function refunded() { refunding.value = null; selectedId.value = null; notice.value = '人工退款已登记，时长已扣回。'; reload() }
</script>
<template><div class="page"><PageHeader title="支付订单" desc="查看支付状态与时长到账 · 筛选范围为最近 100 条订单"><Button variant="primary" icon="refresh" :disabled="busy !== null || state.kind === 'loading'" @click="reload">刷新订单列表</Button></PageHeader><div class="stack"><p v-if="error" class="field-error" role="alert">{{ error }}</p><p v-if="notice" class="business-notice business-feedback" role="status">{{ notice }}</p><div class="search-form m-surface reveal"><Field label="筛选当前列表"><TextInput v-model="filter" placeholder="用户、订单号、套餐或渠道" icon="search" @update:model-value="resetSelection" /></Field><Field label="订单状态" class="order-status" group><Segmented v-model="status" :options="statuses" @update:model-value="resetSelection" /></Field><Field label="支付渠道"><Select v-model="channel" :options="channels" @update:model-value="resetSelection" /></Field></div><Panel class="reveal" title="支付订单列表" :meta="`共 ${orders.length} 条`"><p v-if="state.kind === 'error'" class="field-error" role="alert">{{ state.error }}<Button @click="reload">重试</Button></p><DataTable v-if="state.kind !== 'error'" :columns="columns" :data="visible" :loading="state.kind === 'loading'" :min-width="1160" empty-text="暂无匹配的支付订单。"><template #cell-user="{ row }"><span class="cell-title">{{ row.displayName }}</span><small class="muted cell-sub">ID {{ row.userId }}</small></template><template #cell-id="{ row }"><span class="business-code">{{ row.id }}</span><small class="muted cell-sub">{{ dateTime(row.createdAt) }}</small></template><template #cell-package="{ row }"><span class="cell-title">{{ row.packageName }}</span><small class="muted cell-sub">{{ duration(row.durationSeconds) }}</small></template><template #cell-amount="{ row }"><span class="tnum">{{ money(row.totalCents) }}</span></template><template #cell-channel="{ row }">{{ paymentMethodName(row.paymentMethod) }}支付</template><template #cell-status="{ row }"><Tag :tone="row.status === 'closed' ? 'neutral' : 'ok'">{{ row.status === 'paid' ? '已支付' : row.status === 'pending' ? '待支付' : row.status === 'closed' ? '已关闭' : paymentStatus(row) }}</Tag><small v-if="row.refundedCents > 0" class="muted cell-sub">已登记退款 {{ money(row.refundedCents) }}</small></template><template #cell-credited="{ row }"><Tag :tone="row.credited ? 'ok' : 'neutral'">{{ row.credited ? '已到账' : row.status === 'paid' ? '待到账' : '—' }}</Tag></template><template #cell-actions="{ row }"><div class="row-actions"><Button variant="text" size="sm" :aria-expanded="selectedId === row.id" @click="selectedId = selectedId === row.id ? null : row.id">查看详情</Button><Button v-if="!row.credited && row.status !== 'closed'" variant="text" size="sm" :disabled="busy !== null" @click="refresh(row)">{{ busy === row.id ? '查询中…' : row.status === 'paid' ? '重试时长到账' : '查询支付结果' }}</Button></div></template></DataTable><Pagination :page="currentPage" :page-size="20" :sizes="[20]" :total="orders.length" @update:page="page = $event; selectedId = null" /></Panel><PaymentOrderOverview v-if="selected" :order="selected" :busy="busy !== null" @close="selectedId = null" @refresh="refresh(selected)" @refund="refunding = selected" /><PaymentRefundDialog v-if="refunding" :api="api" :order="refunding" @close="refunding = null" @saved="refunded" /></div></div></template>

<style scoped>.cell-sub { display: block; }.search-form .order-status { width: auto; min-width: 300px; }@media(max-width:680px){.search-form .order-status{width:100%;min-width:0;}}</style>

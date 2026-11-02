<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ApiError, message, type ApiClient } from '../../api'
import { duration, operationId } from '../../duration'
import type { User } from '../../types'
import { walletSchema, type Adjustment } from '../../wallet'
import { mockWalletSchema } from '../../mock-interviews'
import { useResource } from '../../composables/useResource'
import Modal from '../ui/Modal.vue'
import Button from '../ui/Button.vue'
import Field from '../ui/Field.vue'
import TextInput from '../ui/TextInput.vue'
import Select from '../ui/Select.vue'
import DurationFields from './DurationFields.vue'
const props = withDefaults(defineProps<{ api: ApiClient; user: User; mock?: boolean }>(), { mock: false })
const emit = defineEmits<{ close: []; saved: [] }>()
const path = computed(() => `/admin/users/${encodeURIComponent(props.user.id)}/${props.mock ? 'mock-wallet' : 'wallet'}`)
// Both schemas preserve the server's independent balance/version contracts.
const auxiliary = useResource(props.api, path, walletSchema, () => !props.mock)
const simulation = useResource(props.api, path, mockWalletSchema, () => props.mock)
const state = computed(() => props.mock ? simulation.state.value : auxiliary.state.value)
const reload = () => { if (props.mock) simulation.reload(); else auxiliary.reload() }
const operation = ref<Adjustment>('add'), seconds = ref(0), reason = ref(''), busy = ref(false), error = ref(''), conflict = ref(false)
const attempt = ref<{ signature: string; id: string } | null>(null)
const form = ref<HTMLFormElement | null>(null)
const after = computed(() => state.value.kind !== 'ready' ? 0 : operation.value === 'set' ? seconds.value : state.value.data.availableSeconds + (operation.value === 'add' ? seconds.value : -seconds.value))
const activeSession = computed(() => !props.mock && auxiliary.state.value.kind === 'ready' && auxiliary.state.value.data.session?.status === 'active')
const options = computed(() => props.mock ? [{ value: 'add', label: '增加模拟时长' }, { value: 'subtract', label: '扣除模拟时长' }] : [{ value: 'add', label: '增加时长' }, { value: 'subtract', label: '扣除时长' }, { value: 'set', label: '设定剩余时长' }])
watch(() => auxiliary.state.value.kind === 'ready' ? auxiliary.state.value.data.version : null, () => { conflict.value = false })
async function save() {
 if (state.value.kind !== 'ready' || busy.value || conflict.value || !form.value?.reportValidity()) return
 if (!reason.value.trim() || !Number.isSafeInteger(seconds.value) || seconds.value < (props.mock ? 1 : 0) || seconds.value > 315360000 || after.value < 0 || after.value > 315360000) { error.value = props.mock ? '请填写大于 0 的有效时长和调整原因，扣除时长不能超过当前模拟余额。' : '请填写有效时长和调整原因，调整后可用时长不能小于 0 或超过 87600 小时。'; return }
 const fields = props.mock ? { deltaSeconds: operation.value === 'subtract' ? -seconds.value : seconds.value, reason: reason.value.trim() } : { operation: operation.value, seconds: seconds.value, expectedVersion: state.value.data.version, reason: reason.value.trim() }
 const signature = JSON.stringify(fields)
 if (attempt.value?.signature !== signature) attempt.value = { signature, id: operationId() }
 busy.value = true; error.value = ''
 try {
  if (props.mock) await props.api.request(`${path.value}/adjustments`, mockWalletSchema, { method: 'POST', body: { requestId: attempt.value.id, ...fields } })
  else await props.api.request(`${path.value}/adjust`, walletSchema, { method: 'POST', body: { requestId: attempt.value.id, ...fields } })
  emit('saved')
 } catch (failure) { error.value = message(failure); if (failure instanceof ApiError && failure.status === 409) { if (props.mock) reload(); else conflict.value = true } }
 finally { busy.value = false }
}
function reloadCurrent() { conflict.value = false; seconds.value = 0; reason.value = ''; attempt.value = null; error.value = ''; reload() }
</script>
<template><Modal :open="true" :busy="busy" :title="`${mock ? '调整模拟时长' : '调整可用时长'} · ${user.displayName}`" @close="!busy && emit('close')"><p v-if="state.kind === 'loading'" role="status">正在加载…</p><p v-else-if="state.kind === 'error'" class="field-error" role="alert">{{ state.error }}<Button @click="reload">重试</Button></p><form v-else ref="form" class="stack" @submit.prevent="save"><fieldset class="stack" :disabled="busy || conflict"><p>{{ mock ? '模拟余额' : '当前可用时长' }}：<strong>{{ duration(state.data.availableSeconds) }}</strong></p><p v-if="mock" class="muted">独立于辅助面试余额，仅用于 AI 模拟面试。调整会记录管理员和原因。</p><p v-if="activeSession" class="muted">用户正在面试。保存时会先结算已经使用的时间，再进行调整；设为 0 会结束面试。</p><Field label="调整方式"><Select v-model="operation" :options="options" :disabled="busy || conflict" /></Field><DurationFields v-model="seconds" :label="mock ? '模拟时长' : '时长'" /><p role="status">{{ mock ? '调整后预计模拟余额' : '调整后预计可用' }}：<strong>{{ after < 0 ? '时长不足' : duration(after) }}</strong></p><Field label="调整原因" required><TextInput v-model="reason" multiline :maxlength="500" /></Field><p v-if="!mock && operation === 'set' && seconds === 0" class="muted">保存后该用户不能开始面试，正在进行的面试也会结束。</p></fieldset></form><p v-if="error" class="field-error" role="alert">{{ error }}</p><template #footer><Button :disabled="busy" @click="emit('close')">取消</Button><Button v-if="conflict" variant="primary" @click="reloadCurrent">重新加载当前时长</Button><Button v-else variant="primary" :disabled="state.kind !== 'ready'" :loading="busy" @click="save">{{ mock ? '保存模拟时长' : '保存时长' }}</Button></template></Modal></template>

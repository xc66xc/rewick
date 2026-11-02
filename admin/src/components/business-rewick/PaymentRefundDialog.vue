<script setup lang="ts">
import { ref } from 'vue'
import { message, type ApiClient } from '../../api'
import { operationId } from '../../duration'
import { money, paymentOrderSchema, paymentMethodName, type PaymentOrder } from '../../payments'
import Modal from '../ui/Modal.vue'
import Button from '../ui/Button.vue'
import Field from '../ui/Field.vue'
import TextInput from '../ui/TextInput.vue'
import Checkbox from '../ui/Checkbox.vue'
import DurationFields from './DurationFields.vue'
const props = defineProps<{ api: ApiClient; order: PaymentOrder }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const amount = ref((props.order.totalCents - props.order.refundedCents) / 100), seconds = ref(props.order.durationSeconds - props.order.deductedSeconds), reference = ref(''), reason = ref(''), confirmed = ref(false), busy = ref(false), error = ref(''), form = ref<HTMLFormElement | null>(null)
const attempt = ref<{ signature: string; id: string } | null>(null)
const channelName = paymentMethodName(props.order.paymentMethod)
async function save() {
 if (!confirmed.value || busy.value || !form.value?.reportValidity()) return
 const fields = { refundCents: Math.round(amount.value * 100), deductSeconds: seconds.value, reference: reference.value.trim(), reason: reason.value.trim() }
 if (!fields.reference || !fields.reason || !Number.isSafeInteger(fields.refundCents) || fields.refundCents < 1 || fields.refundCents > props.order.totalCents - props.order.refundedCents || !Number.isSafeInteger(fields.deductSeconds) || fields.deductSeconds < 0) { error.value = '请填写有效退款金额、凭证、原因和扣回时长。'; return }
 const signature = JSON.stringify(fields)
 if (attempt.value?.signature !== signature) attempt.value = { signature, id: operationId() }
 busy.value = true; error.value = ''
 try { await props.api.request(`/admin/payment-orders/${encodeURIComponent(props.order.id)}/refund`, paymentOrderSchema, { method: 'POST', body: { ...fields, requestId: attempt.value.id } }); emit('saved') }
 catch (failure) { error.value = message(failure) } finally { busy.value = false }
}
</script>
<template><Modal :open="true" title="登记人工退款" :busy="busy" @close="!busy && emit('close')"><form ref="form" class="stack" @submit.prevent="save"><fieldset class="stack" :disabled="busy"><p class="business-error">本操作不会调用{{ channelName }}退款。请先在{{ channelName }}商户平台完成实际退款，再登记凭证并扣回时长。</p><p>{{ order.displayName }} · {{ order.packageName }}<small class="muted cell-sub">订单 {{ order.id }} · 剩余可登记退款 {{ money(order.totalCents - order.refundedCents) }}</small></p><Field label="已退款金额（元）"><span class="input-shell"><input v-model.number="amount" required type="number" min="0.01" :max="(order.totalCents - order.refundedCents) / 100" step="0.01" /></span></Field><DurationFields v-model="seconds" label="本次扣回时长" /><p class="muted">扣回时长不能超过该订单尚未扣回的时长或用户当前可用时长。</p><Field :label="`${channelName}退款单号／凭证`" required><TextInput v-model="reference" :maxlength="200" /></Field><Field label="退款原因" required><TextInput v-model="reason" multiline :maxlength="500" /></Field><Checkbox v-model="confirmed" :label="`我已在${channelName}商户平台完成实际退款`" /><p v-if="error" class="field-error" role="alert">{{ error }}</p></fieldset></form><template #footer><Button :disabled="busy" @click="emit('close')">取消</Button><Button variant="danger" :loading="busy" :disabled="!confirmed" @click="save">登记退款并扣回时长</Button></template></Modal></template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { message, type ApiClient } from '../../api'
import { money, packageSchema, type PackageDraft, type TimePackage } from '../../payments'
import Modal from '../ui/Modal.vue'
import Button from '../ui/Button.vue'
import Field from '../ui/Field.vue'
import TextInput from '../ui/TextInput.vue'
import Switch from '../ui/Switch.vue'
import DurationFields from './DurationFields.vue'
const props = defineProps<{ api: ApiClient; item?: TimePackage }>()
const emit = defineEmits<{ close: []; saved: [item: TimePackage]; archive: [item: TimePackage] }>()
const item = ref(props.item)
const draft = reactive<PackageDraft>(props.item ? { ...props.item } : { name: '', description: '', durationSeconds: 3600, originalPriceCents: 1000, discountBps: 10000, sortOrder: 0, enabled: false })
const busy = ref(false), error = ref(''), form = ref<HTMLFormElement | null>(null)
const price = computed({ get: () => draft.originalPriceCents / 100, set: (value: number) => { draft.originalPriceCents = Math.round(Number(value) * 100) } })
const discount = computed({ get: () => draft.discountBps / 1000, set: (value: number) => { draft.discountBps = Math.round(Number(value) * 1000) } })
async function save() {
 if (busy.value || !form.value?.reportValidity()) return
 if (!draft.name.trim() || draft.name.length > 100 || draft.description.length > 500 || !Number.isSafeInteger(draft.durationSeconds) || draft.durationSeconds <= 0 || draft.durationSeconds > 315360000 || !Number.isSafeInteger(draft.sortOrder) || draft.sortOrder < 0 || !Number.isSafeInteger(draft.originalPriceCents) || draft.originalPriceCents < 1 || draft.originalPriceCents > 100000000 || !Number.isSafeInteger(draft.discountBps) || draft.discountBps < 1 || draft.discountBps > 10000) { error.value = draft.durationSeconds <= 0 ? '套餐时长必须大于 0。' : '请填写有效的套餐名称、价格、折扣和排序。'; return }
 busy.value = true; error.value = ''
 try {
  const result = await props.api.request(item.value ? `/admin/packages/${item.value.id}` : '/admin/packages', packageSchema, { method: item.value ? 'PUT' : 'POST', body: { name: draft.name, description: draft.description, durationSeconds: draft.durationSeconds, originalPriceCents: draft.originalPriceCents, discountBps: draft.discountBps, sortOrder: draft.sortOrder, enabled: draft.enabled, ...(item.value ? { version: item.value.version } : {}) } })
  item.value = result; emit('saved', result)
 } catch (failure) { error.value = message(failure) } finally { busy.value = false }
}
</script>
<template><Modal :open="true" :title="item ? `编辑套餐 · ${item.name}` : '添加套餐'" :busy="busy" @close="!busy && emit('close')"><form ref="form" class="stack" @submit.prevent="save"><fieldset class="stack" :disabled="busy"><div class="form-grid"><Field label="套餐名称" required><TextInput v-model="draft.name" :maxlength="100" /></Field><Field label="排序"><span class="input-shell"><input v-model.number="draft.sortOrder" type="number" required min="0" step="1" /></span></Field></div><Field label="套餐说明"><TextInput v-model="draft.description" multiline :maxlength="500" /></Field><DurationFields v-model="draft.durationSeconds" label="购买时长（长期有效）" /><div class="form-grid"><Field label="原价（元）"><span class="input-shell"><input v-model.number="price" required type="number" min="0.01" max="1000000" step="0.01" /></span></Field><Field label="折扣（折，10 为原价）"><span class="input-shell"><input v-model.number="discount" required type="number" min="0.001" max="10" step="0.001" /></span></Field></div><p class="muted">预计售价 {{ money(Math.floor((draft.originalPriceCents * draft.discountBps + 5000) / 10000)) }}，保存后以服务端计算为准。<template v-if="item">当前售价 {{ money(item.priceCents) }}。</template></p><Switch v-model="draft.enabled" label="启用，保存后在桌面端显示" /><p v-if="error" class="field-error" role="alert">{{ error }}</p></fieldset></form><template #footer><Button v-if="item" danger :disabled="busy" @click="emit('archive', item)">归档套餐</Button><Button v-else :disabled="busy" @click="emit('close')">取消新增</Button><Button variant="primary" :loading="busy" @click="save">保存套餐</Button></template></Modal></template>

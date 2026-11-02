<script setup lang="ts">
import { onScopeDispose, ref, shallowRef } from 'vue'
import { ApiError, message, type ApiClient } from '../../api'
import { settingsSchema, type OperationsSettings } from '../../operations'
import Modal from '../../components/ui/Modal.vue'
import Field from '../../components/ui/Field.vue'
import TextInput from '../../components/ui/TextInput.vue'
import Switch from '../../components/ui/Switch.vue'
import Button from '../../components/ui/Button.vue'
import LoadState from '../../components/ui/LoadState.vue'
const props = defineProps<{ api: ApiClient }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const draft = shallowRef<OperationsSettings | null>(null), users = ref(''), error = ref(''), notice = ref(''), busy = ref(false)
const request = new AbortController()
void props.api.request('/admin/operations/settings', settingsSchema, { signal: request.signal }).then(value => { if (!request.signal.aborted) { draft.value = value; users.value = value.allowedUserIds.join('\n') } }).catch(reason => { if (!request.signal.aborted) error.value = message(reason) })
onScopeDispose(() => request.abort())
const fields = [['firstContentP95Ms','首段正文 P95 阈值（毫秒）',1,86400000,1],['errorRate','失败率阈值（大于 0，至 1）',0,1,'any'],['degradedRate','降级率阈值（大于 0，至 1）',0,1,'any'],['connectionUtilization','连接利用率阈值（大于 0，至 1）',0,1,'any'],['minSamples','最小样本数',20,10000,1],['sustainSeconds','持续时间（秒）',300,86400,1]] as const
function threshold(key: keyof OperationsSettings['thresholds'], value: unknown) { if (draft.value) draft.value = { ...draft.value, thresholds: { ...draft.value.thresholds, [key]: Number(value) } } }
async function save() {
  if (!draft.value || busy.value) return
  const value = settingsSchema.safeParse({ ...draft.value, allowedUserIds: [...new Set(users.value.split(/[\s,，]+/).map(v => v.trim()).filter(Boolean))] })
  if (!value.success) { error.value = '请检查灰度用户 ID 和阈值的范围。'; return }
  busy.value = true; error.value = ''; notice.value = ''
  try { const saved = await props.api.request('/admin/operations/settings',settingsSchema,{method:'PUT',body:value.data}); draft.value=saved;users.value=saved.allowedUserIds.join('\n');notice.value=`版本 ${saved.version} 已保存。采集开关将在客户端与后端下次刷新后生效。`;emit('saved') }
  catch(reason) { error.value=reason instanceof ApiError && reason.status===409?'版本冲突：其他管理员已修改。当前草稿已保留，请关闭后重新打开以加载新版本。':message(reason) }
  finally {busy.value=false}
}
</script>
<template><Modal open title="运营观测设置" :busy="busy" @close="emit('close')"><p v-if="error" role="alert" class="business-error">{{ error }}</p><p v-if="notice" role="status" class="business-notice">{{ notice }}</p><LoadState v-if="!draft" :error="error" /><form v-else class="form-grid" @submit.prevent="save"><p class="business-caption span-2">配置版本 {{ draft.version }}。默认关闭；采集开启且灰度名单为空时采集所有用户，名单非空时仅采集所列用户。采集不包含问题、回答正文、Key 或 URL。</p><Field label="开启采集" group span><Switch :model-value="draft.enabled" :disabled="busy" label="开启采集" @update:model-value="draft = { ...draft, enabled: $event }" /></Field><Field label="灰度用户 ID" span hint="每行一个数字用户 ID（最多 1000 个），也可用逗号分隔。留空表示采集所有用户。"><TextInput v-model="users" multiline :rows="3" :maxlength="10000" :disabled="busy" /></Field><Field v-for="[key,label,min,max,step] in fields" :key="key" :label="label"><TextInput :model-value="draft.thresholds[key]" type="number" required :min="min" :max="max" :step="step" :disabled="busy" @update:model-value="threshold(key,$event)" /></Field><div class="form-actions span-2"><Button variant="primary" type="submit" :loading="busy">保存观测设置</Button><Button :disabled="busy" @click="emit('close')">关闭</Button></div></form></Modal></template>

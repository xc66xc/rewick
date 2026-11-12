<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, ref, toRaw, watch } from 'vue'
import { ApiError, type ApiClient, message } from '../../api'
import { configPayload, configSchema, type Config } from '../../types'
import { validateQuestionRewrite } from '../../hooks/question-rewrite'
import { questionRewriteTestSchema, type QuestionRewriteProbe } from '../../question-rewrite'
import Button from '../ui/Button.vue'
import Field from '../ui/Field.vue'
import Select from '../ui/Select.vue'
import Switch from '../ui/Switch.vue'
import FormField from './FormField.vue'
import Panel from './ServicesPanel.vue'
import ServiceFeedback from './ServiceFeedback.vue'
import QuestionRewritePreview from './QuestionRewritePreview.vue'
const props = withDefaults(defineProps<{ api: ApiClient; config: Config; disabled?: boolean; active?: boolean }>(), { active: true })
const emit = defineEmits<{ saved: [value: Config]; busy: [value: boolean] }>()
const draft = ref({ ...props.config.questionRewrite }), busy = ref(false), conflict = ref(false), error = ref(''), notice = ref(''), preview = ref<QuestionRewriteProbe | null>(null), probeLatency = ref(0)
let controller: AbortController | undefined
const changed = computed(() => JSON.stringify(draft.value) !== JSON.stringify(props.config.questionRewrite))
const models = computed(() => [{ value: '', label: '暂不选择改写模型' }, ...props.config.models.filter(model => props.config.providers.some(provider => provider.id === model.providerId && provider.kind === 'llm')).map(model => ({ value: model.id, label: `${model.name}${model.enabled && props.config.providers.some(provider => provider.id === model.providerId && provider.enabled) ? '' : '（已停用）'}`, disabled: !model.enabled || !props.config.providers.some(provider => provider.id === model.providerId && provider.enabled) }))])
watch(() => props.config, (value, previous) => {
  if (JSON.stringify(draft.value) === JSON.stringify(previous.questionRewrite) || JSON.stringify(value.questionRewrite) !== JSON.stringify(previous.questionRewrite)) draft.value = { ...value.questionRewrite }
  conflict.value = false
})
watch(() => JSON.stringify(draft.value), () => { preview.value = null; notice.value = '' })
function cancel() { controller?.abort(); if (busy.value) { busy.value = false; emit('busy', false) } }
watch(() => props.active, active => { if (!active) cancel() })
onBeforeUnmount(cancel)
onDeactivated(cancel)
async function save(test = false) {
  if (busy.value || props.disabled || conflict.value || !props.active) return
  error.value = validateQuestionRewrite(props.config, draft.value, test)
  if (error.value) return
  busy.value = true; emit('busy', true); notice.value = ''; preview.value = null
  const current = new AbortController(); controller = current
  try {
    const payload = configPayload({ ...toRaw(props.config), questionRewrite: { ...draft.value } })
    if (test) {
      const result = await props.api.request('/admin/config/test', questionRewriteTestSchema, { method: 'POST', body: { config: payload, capability: 'question-rewrite' }, signal: current.signal })
      if (current.signal.aborted) return
      if (!result.success || !result.questionRewrite) throw new Error(result.message || '服务未返回有效的改写测试结果。')
      preview.value = result.questionRewrite; probeLatency.value = result.latencyMs; notice.value = `${result.message}，未保存配置。`
    } else {
      const result = await props.api.request('/admin/config', configSchema, { method: 'PUT', body: payload, signal: current.signal })
      if (current.signal.aborted) return
      emit('saved', result); notice.value = draft.value.enabled ? '问题改写配置已保存，桌面刷新平台配置后生效。' : '问题改写已关闭，模型选择与超时已保留。'
    }
  } catch (reason) {
    if (!current.signal.aborted) { error.value = message(reason); conflict.value = reason instanceof ApiError && reason.status === 409 }
  } finally { if (!current.signal.aborted) { busy.value = false; emit('busy', false) } }
}
</script>

<template>
  <Panel title="问题改写" meta="回答前整理问意">
    <form class="stack" aria-label="问题改写策略" @submit.prevent="save()">
      <p class="field-hint">整理口语、重复和长问题，保留问点与约束，原话仍保存在当前问题和会话中。关闭后沿用现有回答流程。</p>
      <ServiceFeedback :error="error" :notice="notice" :conflict="conflict" />
      <fieldset class="form-grid" :disabled="busy || disabled || conflict">
        <Field label="改写开关" group><Switch v-model="draft.enabled" label="启用问题改写" /></Field>
        <Field label="问题改写模型" :hint="draft.enabled ? '独立绑定已启用的回答模型，不改变用户选择的回答模型。' : '当前关闭；模型选择仅保留，暂不生效。'"><Select v-model="draft.modelId" aria-label="问题改写模型" :options="models" :disabled="busy || disabled || conflict" filterable /></Field>
        <FormField v-model="draft.timeoutMs" label="问题改写超时（毫秒）" aria-label="问题改写超时（毫秒）" type="number" min="500" max="3000" step="1" required hint="范围 500–3000，默认 1500；超时或普通失败时继续使用原问题。" />
        <p class="field-hint">建议选用快速、非思考模型。每个问题至多一次额外模型调用，可能增加回答等待和 Token 用量；测试使用固定合成样例，不发布开关。</p>
      </fieldset>
      <div class="page-actions">
        <Button :disabled="busy || disabled || conflict || !draft.modelId" @click="save(true)">测试问题改写</Button>
        <Button variant="primary" type="submit" :loading="busy" :disabled="disabled || conflict || !changed">保存问题改写配置</Button>
      </div>
      <QuestionRewritePreview v-if="preview" :value="preview" :duration-ms="probeLatency" />
    </form>
  </Panel>
</template>

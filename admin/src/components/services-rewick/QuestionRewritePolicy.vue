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
const models = computed(() => [{ value: '', label: '暂不选择提取模型' }, ...props.config.models.filter(model => props.config.providers.some(provider => provider.id === model.providerId && provider.kind === 'llm')).map(model => ({ value: model.id, label: `${model.name}${model.enabled && props.config.providers.some(provider => provider.id === model.providerId && provider.enabled) ? '' : '（已停用）'}`, disabled: !model.enabled || !props.config.providers.some(provider => provider.id === model.providerId && provider.enabled) }))])
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
      const result = await props.api.request('/admin/config/test', questionRewriteTestSchema, { method: 'POST', body: { config: payload, capability: 'question-rewrite', resultFormat: 'questions-v1' }, signal: current.signal })
      if (current.signal.aborted) return
      if (!result.success || !result.questionRewrite) throw new Error(result.message || '服务未返回有效的问题提取结果。')
      preview.value = result.questionRewrite; probeLatency.value = result.latencyMs; notice.value = `${result.message}，未保存配置。`
    } else {
      const result = await props.api.request('/admin/config', configSchema, { method: 'PUT', body: payload, signal: current.signal })
      if (current.signal.aborted) return
      emit('saved', result); notice.value = draft.value.enabled ? '问题提取与整理配置已保存，桌面刷新平台配置后生效。' : '问题提取与整理已关闭，模型选择与超时已保留。'
    }
  } catch (reason) {
    if (!current.signal.aborted) { error.value = message(reason); conflict.value = reason instanceof ApiError && reason.status === 409 }
  } finally { if (!current.signal.aborted) { busy.value = false; emit('busy', false) } }
}
</script>

<template>
  <Panel title="问题提取与整理" meta="逐题检索，一次完整回答">
    <form class="stack" aria-label="问题提取与整理策略" @submit.prevent="save()">
      <p class="field-hint">一次提取并整理长话中的独立问点，各题分别检索资料与联网内容，最后统一回答。保留原顺序、问点和约束，当前问题与会话仍保存原话；关闭后沿用原流程。</p>
      <ServiceFeedback :error="error" :notice="notice" :conflict="conflict" />
      <fieldset class="form-grid" :disabled="busy || disabled || conflict">
        <Field label="提取开关" group><Switch v-model="draft.enabled" label="启用问题提取与整理" /></Field>
        <Field label="问题提取模型" :hint="draft.enabled ? '独立绑定已启用的回答模型，不改变用户选择的回答模型。' : '当前关闭；模型选择仅保留，暂不生效。'"><Select v-model="draft.modelId" aria-label="问题提取模型" :options="models" :disabled="busy || disabled || conflict" filterable /></Field>
        <FormField v-model="draft.timeoutMs" label="问题提取超时（毫秒）" aria-label="问题提取超时（毫秒）" type="number" min="500" max="3000" step="1" required hint="范围 500–3000，默认 1500；超时或普通失败时继续使用完整原问题。" />
        <p class="field-hint">建议选用快速、非思考模型。每次提交只做一次提取，最多 5 个问点；分题检索、重排和联网的调用量随问点增加，最终回答仍只有一次。测试使用固定合成样例，仅检查提取结果，不发布开关或执行检索。</p>
      </fieldset>
      <div class="page-actions">
        <Button :disabled="busy || disabled || conflict || !draft.modelId" @click="save(true)">测试问题提取</Button>
        <Button variant="primary" type="submit" :loading="busy" :disabled="disabled || conflict || !changed">保存问题提取配置</Button>
      </div>
      <QuestionRewritePreview v-if="preview" :value="preview" :duration-ms="probeLatency" />
    </form>
  </Panel>
</template>

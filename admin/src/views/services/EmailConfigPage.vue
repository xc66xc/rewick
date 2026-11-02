<script setup lang="ts">
import { onDeactivated,onBeforeUnmount, ref, watch } from 'vue'
import { ApiError, type ApiClient, message } from '../../api'
import { cleanEmailPassword, emailPasswordRequired, emailConfigPayload, emailConfigSchema, testSchema, type EmailConfig } from '../../types'
import Button from '../../components/ui/Button.vue'
import Panel from '../../components/services-rewick/ServicesPanel.vue'
import PageHeader from '../../components/ui/PageHeader.vue'
import Switch from '../../components/ui/Switch.vue'
import FormField from '../../components/services-rewick/FormField.vue'
import ServiceFeedback from '../../components/services-rewick/ServiceFeedback.vue'
import { confirm } from '../../composables/confirm'
const props = withDefaults(defineProps<{ api: ApiClient; active?: boolean }>(), { active: true })
const form = ref<HTMLFormElement | null>(null)
const draft = ref<EmailConfig | null>(null), saved = ref<EmailConfig | null>(null)
const loading = ref(true), busy = ref(false), error = ref(''), notice = ref(''), conflict = ref(false), editing = ref(false)
let loadController: AbortController | undefined, operation: AbortController | undefined
async function load() {
  loadController?.abort(); const controller = new AbortController(); loadController = controller
  loading.value = true; error.value = ''; notice.value = ''
  try { const value = await props.api.request('/admin/email-config', emailConfigSchema, { signal: controller.signal }); if (!controller.signal.aborted) { draft.value = { ...value }; saved.value = value; conflict.value = false } }
  catch (reason) { if (!controller.signal.aborted) error.value = message(reason) }
  finally { if (!controller.signal.aborted) loading.value = false }
}
async function reload() { if (await confirm({ title: '重新加载邮件配置', message: '将丢弃未保存修改和密码，以服务器配置替换。', confirmText: '丢弃草稿并重新加载' })) await load() }
async function submit(test = false) {
  if (!draft.value || busy.value) return
  if (editing.value && form.value && !form.value.reportValidity()) return
  if (test && (!draft.value.host.trim() || !draft.value.from.trim())) { error.value = '测试连接前，请填写 SMTP 主机和发件邮箱。'; return }
  const controller = new AbortController(); operation = controller; busy.value = true; error.value = ''; notice.value = ''
  try {
    const payload = emailConfigPayload(draft.value)
    if (test) {
      const result = await props.api.request('/admin/email-config/test', testSchema, { method: 'POST', body: { config: payload }, signal: controller.signal })
      if (!controller.signal.aborted) { if (result.success) notice.value = `${result.message}（${result.latencyMs} ms）。仅验证连接与认证，未发送邮件，也未保存配置。`; else error.value = `${result.message}（${result.latencyMs} ms）。配置草稿已保留。` }
    } else {
      const value = await props.api.request('/admin/email-config', emailConfigSchema, { method: 'PUT', body: payload, signal: controller.signal })
      if (!controller.signal.aborted) { saved.value = value; draft.value = { ...value }; conflict.value = false; notice.value = `邮件配置版本 ${value.version} 已保存。` }
    }
  } catch (reason) { if (!controller.signal.aborted) { error.value = message(reason); if (reason instanceof ApiError && reason.status === 409) conflict.value = true } }
  finally { if (!controller.signal.aborted) busy.value = false }
}
function cancel() { if (saved.value) draft.value = { ...saved.value }; editing.value = false; error.value = ''; notice.value = '' }
onDeactivated(() => { if(draft.value)draft.value=cleanEmailPassword(draft.value) })
watch(() => draft.value?.username, value => { if(draft.value && !value?.trim())draft.value.password=undefined })
watch(() => props.active, active => { if (!active && draft.value) draft.value = cleanEmailPassword(draft.value) })
onBeforeUnmount(() => { loadController?.abort(); operation?.abort(); if (draft.value) draft.value = cleanEmailPassword(draft.value) })
void load()
</script>
<template><div class="page stack"><PageHeader title="邮件服务" desc="管理注册验证码的邮件发送服务"><Button :disabled="busy" @click="reload">重新加载邮件配置</Button><Button v-if="!editing" variant="primary" :disabled="busy" @click="editing = true">编辑配置</Button></PageHeader><ServiceFeedback :error="error" :notice="notice" :conflict="conflict" /><p v-if="loading" role="status">正在加载…</p><Button v-else-if="!draft" @click="load">重新加载</Button><Panel v-else title="邮件发送配置" class="reveal"><template v-if="!editing"><div class="kv-grid"><div class="kv" v-for="item in [['状态', saved?.enabled ? '已启用' : '未启用'], ['SMTP 主机',saved?.host],['端口',saved?.port],['登录用户',saved?.username],['发件邮箱',saved?.from],['SMTP 密码',!saved?.username?'无需认证':saved?.hasPassword ? '已保存' : '未配置'],['连接方式',saved?.ssl?'SSL/TLS':saved?.startTls?'STARTTLS':'明文连接'],['配置版本',saved?.version]]" :key="String(item[0])"><div class="kv-label">{{ item[0] }}</div><div class="kv-value">{{ item[1] || '未配置' }}</div></div></div><Button :disabled="busy" @click="submit(true)">测试连接</Button></template><form v-else ref="form" class="stack" @submit.prevent="submit()"><fieldset class="form-grid" :disabled="busy"><Switch v-model="draft.enabled" label="启用邮件服务" /><FormField v-model="draft.host" label="SMTP 主机" :required="draft.enabled" maxlength="253" /><FormField v-model="draft.port" label="SMTP 端口" type="number" min="1" max="65535" required /><FormField v-model="draft.username" label="SMTP 用户名" maxlength="254" autocomplete="off" /><FormField v-model="draft.from" label="发件邮箱" type="email" :required="draft.enabled" maxlength="254" /><FormField :model-value="draft.password" @update:model-value="draft.password=String($event)" label="SMTP 密码" maxlength="4096" :required="emailPasswordRequired(draft,saved)" :disabled="!draft.username.trim()" type="password" autocomplete="new-password" :placeholder="saved?.hasPassword ? '已保存，留空保留' : '填写密码'" /><Switch :model-value="draft.startTls" @update:model-value="draft.startTls=$event;if($event)draft.ssl=false" label="启用 STARTTLS" /><Switch :model-value="draft.ssl" @update:model-value="draft.ssl=$event;if($event)draft.startTls=false" label="启用 SSL" /></fieldset><p class="field-hint">测试只验证连接与认证，不发送邮件，也不会保存配置。密码仅在当前表单内存中保留。</p><div class="page-actions"><Button :disabled="busy" @click="cancel">取消编辑</Button><Button :disabled="busy" @click="submit(true)">测试连接</Button><Button type="submit" variant="primary" :loading="busy">保存邮件配置</Button></div></form></Panel></div></template>

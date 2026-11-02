<script setup lang="ts">
import { computed,onBeforeUnmount,ref } from 'vue'
import { type ApiClient,message } from '../../api'
import { type Config } from '../../types'
import { desktopSettingsSchema,type DesktopSettings } from '../../desktop-settings'
import Button from '../ui/Button.vue'
import Panel from './ServicesPanel.vue'
import Field from '../ui/Field.vue'
import Select from '../ui/Select.vue'
import FormField from './FormField.vue'
import ServiceFeedback from './ServiceFeedback.vue'
import AdvancedSettingsUsers from './AdvancedSettingsUsers.vue'
const props=defineProps<{api:ApiClient;config:Config}>(),value=ref<DesktopSettings|null>(null),busy=ref(false),error=ref(''),notice=ref('')
let controller:AbortController|undefined,operation:AbortController|undefined
async function load(){controller?.abort();const c=new AbortController();controller=c;notice.value='';try{const data=await props.api.request('/admin/desktop-settings',desktopSettingsSchema,{signal:c.signal});if(!c.signal.aborted){value.value=data;error.value=''}}catch(reason){if(!c.signal.aborted)error.value=message(reason)}}
async function save(){if(!value.value||busy.value)return;if(!models.value.some(item=>item.value===value.value?.llmModelId)||!services.value.some(item=>item.value===value.value?.asrServiceId)){error.value='请选择回答模型与语音转写服务。';return}busy.value=true;error.value='';notice.value='';const c=new AbortController();operation=c;try{const data=await props.api.request('/admin/desktop-settings',desktopSettingsSchema,{method:'PUT',body:value.value,signal:c.signal});if(!c.signal.aborted){value.value=data;notice.value='默认服务已保存。'}}catch(reason){if(!c.signal.aborted)error.value=message(reason)}finally{if(!c.signal.aborted)busy.value=false}}
const models=computed(()=>props.config.models.filter(m=>m.enabled&&props.config.providers.some(p=>p.id===m.providerId&&p.kind==='llm'&&p.enabled)).map(m=>({value:m.id,label:m.name})))
const services=computed(()=>props.config.providers.filter(p=>p.enabled&&p.kind==='asr'&&props.config.asr.enabled&&props.config.asr.providerId===p.id).map(p=>({value:p.id,label:p.name})))
onBeforeUnmount(()=>{controller?.abort();operation?.abort()})
void load()
</script>
<template><div class="stack"><Panel title="桌面高级设置权限" class="reveal"><template #tools><Button :disabled="busy" @click="load">重新加载默认服务</Button></template><div class="stack"><ServiceFeedback :error="error" :notice="notice"/><form v-if="value" aria-label="普通用户默认服务" class="stack" @submit.prevent="save"><h3>普通用户默认服务</h3><p class="field-hint">普通用户只调整回答风格，回答和转写使用以下平台配置，资料检索使用平台混合检索服务。</p><fieldset class="form-grid" :disabled="busy"><Field label="默认回答模型"><Select v-model="value.llmModelId" :options="models" placeholder="请选择回答模型"/></Field><FormField v-model="value.temperature" label="默认生成温度" type="number" min="0" max="2" step="0.1" required/><Field label="默认语音转写服务"><Select v-model="value.asrServiceId" :options="services" placeholder="请选择语音转写服务"/></Field></fieldset><Button variant="primary" type="submit" :loading="busy">保存默认服务</Button></form><p v-else role="status">正在加载…</p></div></Panel><AdvancedSettingsUsers :api="api"/></div></template>

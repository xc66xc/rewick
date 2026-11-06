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
async function save(){
 if(!value.value||busy.value)return
 if(!desktopSettingsSchema.shape.sessionRecordMaxMiB.safeParse(value.value.sessionRecordMaxMiB).success){error.value='单次会话大小上限需为 1–50 MiB 的整数。';return}
 if((value.value.llmModelId&&!models.value.some(item=>item.value===value.value?.llmModelId))||(value.value.asrServiceId&&!services.value.some(item=>item.value===value.value?.asrServiceId))){error.value='所选默认模型或语音转写服务不可用，请重新选择。';return}
 busy.value=true;error.value='';notice.value=''
 const c=new AbortController();operation=c
 try{const data=await props.api.request('/admin/desktop-settings',desktopSettingsSchema,{method:'PUT',body:value.value,signal:c.signal});if(!c.signal.aborted){value.value=data;notice.value='桌面设置已保存。'}}catch(reason){if(!c.signal.aborted)error.value=message(reason)}finally{if(!c.signal.aborted)busy.value=false}
}
const models=computed(()=>[{value:'',label:'暂不设置默认回答模型'},...props.config.models.filter(m=>m.enabled&&props.config.providers.some(p=>p.id===m.providerId&&p.kind==='llm'&&p.enabled)).map(m=>({value:m.id,label:m.name}))])
const services=computed(()=>[{value:'',label:'暂不设置默认语音服务'},...props.config.providers.filter(p=>p.enabled&&p.kind==='asr'&&props.config.asr.enabled&&props.config.asr.providerId===p.id).map(p=>({value:p.id,label:p.name}))])
onBeforeUnmount(()=>{controller?.abort();operation?.abort()})
void load()
</script>
<template><div class="stack"><Panel title="桌面默认设置" class="reveal"><template #tools><Button :disabled="busy" @click="load">重新加载桌面设置</Button></template><div class="stack"><ServiceFeedback :error="error" :notice="notice"/><form v-if="value" aria-label="桌面默认设置" class="stack" @submit.prevent="save"><h3>默认服务与会话保存</h3><p class="field-hint">普通用户只调整回答风格，回答和转写使用以下平台配置，资料检索使用平台混合检索服务。</p><fieldset class="form-grid" :disabled="busy"><Field label="默认回答模型"><Select v-model="value.llmModelId" :options="models" placeholder="请选择回答模型"/></Field><FormField v-model="value.temperature" label="默认生成温度" type="number" min="0" max="2" step="0.1" required/><Field label="默认语音转写服务"><Select v-model="value.asrServiceId" :options="services" placeholder="请选择语音转写服务"/></Field><FormField v-model="value.sessionRecordMaxMiB" label="单次会话大小上限（MiB）" type="number" min="1" max="50" step="1" required hint="适用于所有用户，范围 1–50 MiB，默认 20 MiB。计入问答、转写及模型输入等会话内容，不包含录音文件。"/></fieldset><Button variant="primary" type="submit" :loading="busy">保存桌面设置</Button></form><p v-else role="status">正在加载…</p></div></Panel><AdvancedSettingsUsers :api="api"/></div></template>

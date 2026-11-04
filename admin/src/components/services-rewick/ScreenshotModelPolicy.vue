<script setup lang="ts">
import { computed,onBeforeUnmount,onDeactivated,ref,toRaw,watch } from 'vue'
import { type ApiClient,message } from '../../api'
import { configPayload,configSchema,testSchema,type Config } from '../../types'
import Button from '../ui/Button.vue'
import Field from '../ui/Field.vue'
import Select from '../ui/Select.vue'
import Panel from './ServicesPanel.vue'
import ServiceFeedback from './ServiceFeedback.vue'
const props=defineProps<{api:ApiClient;config:Config;disabled?:boolean}>()
const emit=defineEmits<{saved:[value:Config]}>()
const selected=ref(props.config.screenshotModelId),busy=ref(false),error=ref(''),notice=ref('')
let controller:AbortController|undefined
watch(()=>props.config,value=>{selected.value=value.screenshotModelId})
const models=computed(()=>[{value:'',label:'不启用截图识别'},...props.config.models.filter(m=>m.enabled&&props.config.providers.some(p=>p.id===m.providerId&&p.enabled)).map(m=>({value:m.id,label:m.name}))])
async function save(test=false){
 if(busy.value||props.disabled)return
 busy.value=true;error.value='';notice.value='';const c=new AbortController();controller=c
 try{
  const payload=configPayload({...toRaw(props.config),screenshotModelId:selected.value})
  if(test){const result=await props.api.request('/admin/config/test',testSchema,{method:'POST',body:{config:payload,capability:'screenshot'},signal:c.signal});if(!result.success)throw new Error(result.message);if(!c.signal.aborted)notice.value=`${result.message}，未保存配置。`}
  else{const value=await props.api.request('/admin/config',configSchema,{method:'PUT',body:payload,signal:c.signal});if(!c.signal.aborted){emit('saved',value);notice.value=selected.value?'截图识别模型已保存。':'截图识别已关闭。'}}
 }catch(reason){if(!c.signal.aborted)error.value=message(reason)}finally{if(!c.signal.aborted)busy.value=false}
}
onBeforeUnmount(()=>controller?.abort())
onDeactivated(()=>{controller?.abort();busy.value=false})
</script>
<template><Panel title="截图识别模型" meta="全屏算法题识别"><div class="stack"><p class="field-hint">独立于回答模型。请选择支持图片输入、兼容 Chat Completions image_url 的视觉模型；识别后的题目交给用户当前回答模型解题。截图不长期保存。</p><ServiceFeedback :error="error" :notice="notice"/><Field label="截图识别模型"><Select v-model="selected" :options="models" :disabled="busy||disabled" filterable/></Field><div class="page-actions"><Button :disabled="busy||disabled||!selected" @click="save(true)">测试图片识别</Button><Button variant="primary" :loading="busy" :disabled="disabled||selected===config.screenshotModelId" @click="save(false)">保存截图识别配置</Button></div></div></Panel></template>

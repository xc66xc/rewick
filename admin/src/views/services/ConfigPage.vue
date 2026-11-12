<script setup lang="ts">
import { computed,onBeforeUnmount,ref,toRaw } from 'vue'
import { ApiError,type ApiClient,message } from '../../api'
import { capabilityNames,configPayload,configSchema,defaultRerankModel,defaultRerankUrl,testSchema,type Capability,type Config } from '../../types'
import { applyService,serviceForms,type ServiceForm } from '../../hooks/unified-service'
import { createServiceId } from '../../service-id'
import PageHeader from '../../components/ui/PageHeader.vue'
import Button from '../../components/ui/Button.vue'
import Panel from '../../components/services-rewick/ServicesPanel.vue'
import Segmented from '../../components/ui/Segmented.vue'
import UnifiedServiceCard from '../../components/services-rewick/UnifiedServiceCard.vue'
import ServiceFeedback from '../../components/services-rewick/ServiceFeedback.vue'
import ReferencePolicy from '../../components/services-rewick/ReferencePolicy.vue'
import ScreenshotModelPolicy from '../../components/services-rewick/ScreenshotModelPolicy.vue'
import QuestionRewritePolicy from '../../components/services-rewick/QuestionRewritePolicy.vue'
import DesktopSettingsPolicy from '../../components/services-rewick/DesktopSettingsPolicy.vue'
import { confirm } from '../../composables/confirm'
const props=withDefaults(defineProps<{api:ApiClient;active?:boolean}>(),{active:true})
const config=ref<Config|null>(null),items=ref<ServiceForm[]>([]),category=ref('all'),showAdd=ref(false),showPolicy=ref(false),showDesktop=ref(false),busy=ref(false),error=ref(''),notice=ref('')
const reloadRevision=ref(0)
let loadController:AbortController|undefined,operation:AbortController|undefined
async function load(){loadController?.abort();const c=new AbortController();loadController=c;try{const value=await props.api.request('/admin/config',configSchema,{signal:c.signal});if(!c.signal.aborted){config.value=value;items.value=serviceForms(value);reloadRevision.value+=1;error.value=''}}catch(reason){if(!c.signal.aborted)error.value=message(reason)}}
async function reload(){if(await confirm({title:'重新加载配置',message:'重新加载会丢弃未保存内容，是否继续？',confirmText:'重新加载'}))await load()}
function add(kind:Capability){const id=createServiceId();category.value='all';showAdd.value=false;items.value.push({id,providerId:id,kind,searchProtocol:'tavily',name:'',model:kind==='rerank'?defaultRerankModel:'',url:kind==='web-search'?'https://api.tavily.com/search':kind==='rerank'?defaultRerankUrl:'',topK:5,searchDepth:'advanced',timeoutMs:kind==='rerank'?1500:8000,includeAnswer:'none',maxOutputTokens:2048,thinkingMode:'default',thinkingProtocol:'none',dimensions:1024,enabled:kind!=='rerank'})}
async function save(item:ServiceForm,test=false,remove=false):Promise<boolean>{
 if(!config.value||busy.value)return false
 busy.value=true;error.value='';notice.value='';const c=new AbortController();operation=c
 try{const previous=config.value,payload=configPayload(applyService(toRaw(previous),item,remove));if(test){const modelId=payload.models.find(m=>m.providerId===item.providerId&&(m.id===item.id||m.id===`model-${item.providerId}`))?.id;const result=await props.api.request('/admin/config/test',testSchema,{method:'POST',body:{config:payload,capability:item.kind,...(modelId?{modelId}:{})},signal:c.signal});if(!result.success)throw new Error(result.message);if(!c.signal.aborted)notice.value=`${result.message}，未保存配置。`}else{const value=await props.api.request('/admin/config',configSchema,{method:'PUT',body:payload,signal:c.signal});if(!c.signal.aborted){const fresh=serviceForms(value);items.value=[...fresh.map(row=>{const old=items.value.find(candidate=>candidate.id===row.id);return old&&JSON.stringify(old)===JSON.stringify(row)?old:row}),...items.value.filter(row=>row.id!==item.id&&!previous.providers.some(p=>p.id===row.providerId))];config.value=value;notice.value=remove?'已删除。':item.kind==='rerank'?'重排序配置已保存，下一次检索请求生效。':item.enabled?'已保存并启用，平台与桌面刷新后可用。':'已停用，桌面端不再提供此项。'}}return !c.signal.aborted}catch(reason){if(!c.signal.aborted)error.value=message(reason)+(reason instanceof ApiError&&reason.status===409?' 请重新加载配置后重试。':'');return false}finally{if(!c.signal.aborted)busy.value=false}}
async function remove(item:ServiceForm){if(!await confirm({title:`删除 ${item.name||'新服务'}`,message:'删除后桌面端不再提供此项。',confirmText:'确认删除',danger:true}))return;if(config.value?.providers.some(p=>p.id===item.providerId))await save(item,false,true);else items.value=items.value.filter(row=>row.id!==item.id)}
const categories=[{value:'all',label:'全部'},...Object.entries(capabilityNames).map(([value,label])=>({value,label}))]
const visible=computed(()=>items.value.filter(item=>category.value==='all'||item.kind===category.value))
onBeforeUnmount(()=>{loadController?.abort();operation?.abort()})
void load()
</script>
<template>
  <div class="page stack">
    <PageHeader title="模型与服务" desc="配置回答模型、语音转写、向量、重排序与联网搜索服务"><Button variant="primary" icon="plus" :disabled="busy" :aria-expanded="showAdd" @click="showAdd=!showAdd">添加服务</Button></PageHeader>
    <Panel v-if="showAdd" title="添加服务"><div class="page-actions"><Button v-for="kind in (['llm','asr','embedding','rerank','web-search'] as const)" :key="kind" :disabled="busy" @click="add(kind)">添加{{capabilityNames[kind]}}</Button></div></Panel>
    <Segmented v-model="category" :options="categories" aria-label="服务分类" />
    <ServiceFeedback :error="error" :notice="notice" />
    <p v-if="!config&&!error" role="status">正在加载…</p>
    <Button v-if="!config&&error" @click="load">重新加载</Button>
    <div v-if="config" class="form-grid"><div v-for="item in items" :key="item.id" :hidden="category!=='all'&&category!==item.kind"><UnifiedServiceCard :value="item" :busy="busy" :saved="config.providers.some(p=>p.id===item.providerId)" :active="active&&(category==='all'||category===item.kind)" :on-save="save" @remove="remove(item)" /></div></div>
    <p v-if="config&&!visible.length">此分类尚无模型或服务，请添加。</p>
    <QuestionRewritePolicy v-if="config" :key="reloadRevision" :api="api" :config="config" :disabled="busy" :active="active" @busy="busy=$event" @saved="value=>{config=value;items=serviceForms(value)}" />
    <ScreenshotModelPolicy v-if="config" :api="api" :config="config" :disabled="busy" @saved="value=>{config=value;items=serviceForms(value)}" />
    <Panel title="平台相关设置" class="reveal"><div class="page-actions"><Button :aria-expanded="showPolicy" @click="showPolicy=!showPolicy">资料检索策略</Button><Button :aria-expanded="showDesktop" @click="showDesktop=!showDesktop">桌面默认设置</Button><Button :disabled="busy" @click="reload">重新加载配置</Button></div></Panel>
    <ReferencePolicy v-if="showPolicy" :api="api" />
    <DesktopSettingsPolicy v-if="showDesktop&&config" :api="api" :config="config" />
  </div>
</template>

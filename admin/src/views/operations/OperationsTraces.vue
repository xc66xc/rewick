<script setup lang="ts">
import {computed,reactive,ref} from 'vue'
import {type ApiClient,message} from '../../api'
import {traceDetailSchema,tracesSchema,outcomeNames,operationTypeNames,type Trace} from '../../operations'
import {dateTime} from '../../types'
import {useOperationsResource} from '../../composables/useOperationsResource'
import Panel from '../../components/ui/Panel.vue'
import Field from '../../components/ui/Field.vue'
import TextInput from '../../components/ui/TextInput.vue'
import Button from '../../components/ui/Button.vue'
import DataTable from '../../components/ui/DataTable.vue'
import Pagination from '../../components/ui/Pagination.vue'
import LoadState from '../../components/ui/LoadState.vue'
import TraceDetailPanel from './TraceDetailPanel.vue'
export interface TraceSelection{operationId?:string;userId:string}
const props=defineProps<{api:ApiClient;hours:number;active:boolean;initial?:TraceSelection}>()
const blank={userId:'',sessionId:'',model:'',appVersion:''},draft=reactive({...blank,userId:props.initial?.userId??''}),filters=ref({...draft}),page=ref(1),lookup=ref(props.initial?.operationId??''),error=ref('')
const selected=ref<{operationId:string;userId:string}|null>(props.initial?.operationId?{operationId:props.initial.operationId,userId:props.initial.userId}:null)
const {state,reload}=useOperationsResource(props.api,()=>`/admin/operations/traces?${new URLSearchParams({...Object.fromEntries(Object.entries(filters.value).filter(([,v])=>v.trim())),hours:String(Math.min(props.hours,168)),page:String(page.value),size:'20'})}`,tracesSchema,()=>props.active)
const columns=[{key:'identity',title:'操作 / 用户',minWidth:230},{key:'operationType',title:'操作类型'},{key:'model',title:'模型 / 客户端版本',minWidth:180},{key:'startedAt',title:'开始时间',minWidth:170},{key:'outcome',title:'结果'},{key:'eventCount',title:'事件'},{key:'source',title:'来源'},{key:'actions',title:'操作',className:'col-actions'}]
const fields=[['userId','用户 ID'],['sessionId','会话 ID'],['model','模型'],['appVersion','客户端版本']] as const
function select(trace:Trace){selected.value={operationId:trace.operationId,userId:trace.userId};lookup.value=trace.operationId}
function search(){filters.value=Object.fromEntries(Object.entries(draft).map(([k,v])=>[k,v.trim()])) as typeof blank;page.value=1;selected.value=null;reload()}
function specified(){if(!/^[1-9]\d*$/.test(draft.userId.trim())){error.value='查看指定操作需要有效用户 ID，请先填写筛选栏的用户 ID。';return}try{selected.value={operationId:traceDetailSchema.shape.operationId.parse(lookup.value.trim()),userId:draft.userId.trim()};error.value=''}catch(reason){error.value=`请输入有效的操作 UUID。${message(reason).includes('登录')?message(reason):''}`}}
</script>
<template><form class="search-form m-surface reveal" @submit.prevent="search"><Field v-for="[key,label] in fields" :key="key" :label="label"><TextInput v-model="draft[key]" :pattern="key==='userId'?'[1-9][0-9]*':undefined" :maxlength="key==='model'?200:key==='appVersion'?32:128" /></Field><div class="search-actions"><Button variant="primary" type="submit">筛选链路</Button></div></form><form class="business-toolbar reveal" @submit.prevent="specified"><Field label="操作 ID"><TextInput v-model="lookup" required :maxlength="36" /></Field><Button type="submit">查看指定操作</Button></form><p v-if="error" role="alert" class="business-error">{{error}}</p><p class="business-caption">全量明细保留 7 天。客户端报告无法用于验证真实回答质量或计费；未上报的阶段不补造。会话同步失败不等于回答模型调用失败。</p><LoadState v-if="state.kind!=='ready'" :error="state.kind==='error'?state.error:undefined" @retry="reload" /><Panel v-else title="最近操作" meta="最多 7 天" class="reveal"><DataTable :data="state.data.items.map(t=>({...t,id:`${t.userId}:${t.operationId}`}))" :columns="columns" :min-width="1100" empty-text="暂无匹配链路，不代表没有面试。"><template #cell-identity="{row}"><span class="business-code">{{row.operationId}}</span><p class="business-caption">用户 {{row.userId}}{{row.sessionId?` · 会话 ${row.sessionId}`:''}}</p></template><template #cell-operationType="{row}">{{operationTypeNames[row.operationType as keyof typeof operationTypeNames]}}</template><template #cell-model="{row}">{{row.operationType==='session-sync'?'不涉及模型':row.model||'未上报'}}<p class="business-caption">{{row.appVersion?`客户端 ${row.appVersion}`:'客户端版本未上报'}}</p></template><template #cell-startedAt="{row}">{{dateTime(row.startedAt)}}</template><template #cell-outcome="{row}">{{outcomeNames[row.outcome as keyof typeof outcomeNames]}}</template><template #cell-source="{row}">{{row.clientReported?'含客户端报告':'仅后端'}}</template><template #cell-actions="{row}"><Button variant="text" @click="select(row)">查看链路</Button></template></DataTable><Pagination :page="state.data.page" :page-size="state.data.size" :total="state.data.total" :sizes="[20]" @update:page="page=$event" /></Panel><template v-if="selected"><Button variant="text" @click="selected=null">收起操作链路</Button><TraceDetailPanel :api="api" :selection="selected" :active="active" /></template></template>

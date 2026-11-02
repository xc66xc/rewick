<script setup lang="ts">
import {onDeactivated,computed,reactive,ref} from 'vue'
import type {ApiClient} from '../../api'
import {capabilityNames,dateTime,statusNames,usagePageSchema} from '../../types'
import {useResource} from '../../composables/useResource'
import PageHeader from '../../components/ui/PageHeader.vue'
import Panel from '../../components/ui/Panel.vue'
import Field from '../../components/ui/Field.vue'
import TextInput from '../../components/ui/TextInput.vue'
import Select from '../../components/ui/Select.vue'
import Button from '../../components/ui/Button.vue'
import DataTable from '../../components/ui/DataTable.vue'
import Pagination from '../../components/ui/Pagination.vue'
import Drawer from '../../components/ui/Drawer.vue'
import Tag from '../../components/ui/Tag.vue'
const props=defineProps<{api:ApiClient}>()
const emit=defineEmits<{openTrace:[selection:{operationId?:string;userId:string}]}>()
const capabilityLabels:Record<string,string>={...capabilityNames,knowledge:'资料检索'}
const blank={userId:'',query:'',capability:'',status:'',model:''},draft=reactive({...blank}),filters=ref({...blank}),page=ref(1),more=ref(false),selectedId=ref<string|null>(null)
const {state,reload}=useResource(props.api,()=>`/admin/usage?${new URLSearchParams({...filters.value,page:String(page.value),size:'20'})}`,usagePageSchema)
const selected=computed(()=>state.value.kind==='ready'?state.value.data.items.find(v=>v.id===selectedId.value):undefined)
const rows=computed(()=>state.value.kind==='ready'?state.value.data.items:[])
const columns=[{key:'identity',title:'用户',minWidth:180},{key:'capability',title:'服务能力'},{key:'model',title:'模型',minWidth:160},{key:'status',title:'状态'},{key:'createdAt',title:'开始时间',minWidth:170},{key:'elapsed',title:'耗时'},{key:'actions',title:'操作',className:'col-actions'}]
function usageDuration(start:string,finish:string|null){if(!finish)return'—';const elapsed=Date.parse(finish)-Date.parse(start);return Number.isFinite(elapsed)&&elapsed>=0?`${(elapsed/1000).toFixed(2)} 秒`:'—'}
function search(){filters.value={...draft,query:draft.query.trim()};page.value=1;selectedId.value=null;reload()}
const facts=computed(()=>{const v=selected.value;return v?[['请求 ID',v.requestId],['用户 ID',v.userId],['服务能力',capabilityLabels[v.capability]??v.capability],['模型',v.model||'—'],['状态',statusNames[v.status]??v.status],['开始时间',dateTime(v.createdAt)],['结束时间',dateTime(v.finishedAt)],['耗时',usageDuration(v.createdAt,v.finishedAt)]]:[]})
onDeactivated(() => { selectedId.value = null })
</script>
<template><div class="page stack"><PageHeader title="调用记录" desc="查看模型请求与执行状态"><Button icon="refresh" :disabled="state.kind==='loading'" @click="reload">刷新</Button></PageHeader><form class="search-form m-surface reveal" @submit.prevent="search"><Field label="邮箱或显示名称"><TextInput v-model="draft.query" :maxlength="254" /></Field><Field label="服务能力"><Select v-model="draft.capability" :options="[{value:'',label:'全部能力'},...Object.entries(capabilityLabels).map(([value,label])=>({value,label}))]" /></Field><Field label="请求状态"><Select v-model="draft.status" :options="[{value:'',label:'全部状态'},...Object.entries(statusNames).map(([value,label])=>({value,label}))]" /></Field><div class="search-actions"><Button :aria-expanded="more" @click="more=!more">更多筛选{{filters.userId||filters.model?' · 已应用':''}}</Button><Button variant="primary" type="submit">筛选记录</Button></div><template v-if="more"><Field label="用户 ID"><TextInput v-model="draft.userId" :maxlength="64" /></Field><Field label="模型"><TextInput v-model="draft.model" :maxlength="200" /></Field></template></form><p v-if="state.kind==='error'" role="alert" class="business-error">{{state.error}}</p><Panel title="调用记录列表" class="reveal"><DataTable :data="rows" :columns="columns" :loading="state.kind==='loading'" :min-width="1000" empty-text="没有匹配的调用记录。"><template #cell-identity="{row}"><strong>{{row.displayName||'未命名用户'}}</strong><p class="business-caption">用户 ID {{row.userId}}</p></template><template #cell-capability="{row}">{{capabilityLabels[row.capability]??row.capability}}</template><template #cell-model="{row}"><span class="business-code">{{row.model||'—'}}</span></template><template #cell-status="{row}"><Tag :tone="row.status==='failed'?'red':row.status==='complete'?'lime':'gray'">{{statusNames[row.status]??row.status}}</Tag></template><template #cell-createdAt="{row}">{{dateTime(row.createdAt)}}</template><template #cell-elapsed="{row}">{{usageDuration(row.createdAt,row.finishedAt)}}</template><template #cell-actions="{row}"><Button variant="text" @click="selectedId=row.id">查看详情</Button></template></DataTable><Pagination v-if="state.kind==='ready'" :page="state.data.page" :page-size="state.data.size" :total="state.data.total" :sizes="[20]" @update:page="page=$event;selectedId=null" /></Panel><Drawer :open="!!selected" title="请求详情" @close="selectedId=null"><dl class="business-facts"><div v-for="[label,value] in facts" :key="label"><dt>{{label}}</dt><dd>{{value}}</dd></div></dl><template v-if="selected"><Button @click="emit('openTrace',{operationId:selected.operationId,userId:selected.userId})">{{selected.operationId?'查看操作链路':'查看该用户操作'}}</Button><p v-if="!selected.operationId" class="business-caption">旧调用记录未关联操作链路，入口仅按用户筛选，不推断请求与操作的关系。</p></template><p class="business-caption">不包含问题与回答正文。调用记录不等于费用账单。</p></Drawer></div></template>

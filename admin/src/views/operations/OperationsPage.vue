<script setup lang="ts">
import {onDeactivated,computed,ref,watch} from 'vue'
import type {ApiClient} from '../../api'
import {overviewSchema,performanceSchema,healthSchema} from '../../operations'
import {useOperationsResource} from '../../composables/useOperationsResource'
import PageHeader from '../../components/ui/PageHeader.vue'
import Button from '../../components/ui/Button.vue'
import Select from '../../components/ui/Select.vue'
import Field from '../../components/ui/Field.vue'
import Segmented from '../../components/ui/Segmented.vue'
import LoadState from '../../components/ui/LoadState.vue'
import OperationsFreshness from './OperationsFreshness.vue'
import OperationsOverview from './OperationsOverview.vue'
import OperationsHealth from './OperationsHealth.vue'
import OperationsPerformance from './OperationsPerformance.vue'
import OperationsTraces,{type TraceSelection} from './OperationsTraces.vue'
import OperationsSettings from './OperationsSettings.vue'
const props=withDefaults(defineProps<{api:ApiClient;active?:boolean;initialTrace?:TraceSelection}>(),{active:true})
const tabs=[{value:'overview',label:'总览'},{value:'performance',label:'性能'},{value:'traces',label:'操作链路'},{value:'health',label:'健康'}]
const tab=ref(props.initialTrace?'traces':'overview'),hours=ref(24),settings=ref(false)
watch(()=>props.initialTrace,v=>{if(v)tab.value='traces'})
const overview=useOperationsResource(props.api,()=>`/admin/operations/overview?hours=${hours.value}`,overviewSchema,()=>props.active&&tab.value==='overview')
const perf=useOperationsResource(props.api,()=>`/admin/operations/performance?hours=${hours.value}`,performanceSchema,()=>props.active&&tab.value==='performance')
const health=useOperationsResource(props.api,'/admin/operations/health',healthSchema,()=>props.active&&tab.value==='health')
const state=computed(()=>tab.value==='overview'?overview.state.value:tab.value==='performance'?perf.state.value:health.state.value)
function refresh(){if(tab.value==='overview')overview.reload();else if(tab.value==='performance')perf.reload();else if(tab.value==='health')health.reload();else traceRevision.value++}
const traceRevision=ref(0)
onDeactivated(() => { settings.value = false })
</script>
<template><div class="page stack"><PageHeader title="运营观测" desc="业务趋势、回答延迟与运行健康"><Button icon="refresh" @click="refresh">刷新观测</Button><Button icon="settings" @click="settings=true">观测设置</Button></PageHeader><div class="page-head reveal"><Segmented v-model="tab" :options="tabs" label="观测页签" /><Field label="时间范围"><Select v-model="hours" :options="[{label:'最近 24 小时',value:24},{label:'最近 7 天',value:168},{label:'最近 30 天',value:720},{label:'最近 90 天',value:2160}]" /></Field></div><p class="business-caption reveal">可见页面每 30 秒刷新；页面隐藏时停止轮询。链路明细限最近 7 天。</p><OperationsTraces v-if="tab==='traces'" :key="`${traceRevision}:${hours}:${initialTrace?.operationId??initialTrace?.userId??''}`" :api="api" :hours="hours" :active="active" :initial="initialTrace" /><template v-else><LoadState v-if="state.kind!=='ready'" :error="state.kind==='error'?state.error:undefined" @retry="refresh" /><template v-else><OperationsFreshness :updated-at="state.data.updatedAt" :stale="state.data.stale" /><p v-if="state.data.stale" class="business-error">当前观测数据不完整或已过期，空列表与未知值不代表没有业务活动。</p><OperationsOverview v-if="tab==='overview'&&overview.state.value.kind==='ready'" :data="overview.state.value.data" /><OperationsPerformance v-if="tab==='performance'&&perf.state.value.kind==='ready'" :data="perf.state.value.data" :hours="hours" /><OperationsHealth v-if="tab==='health'&&health.state.value.kind==='ready'" :data="health.state.value.data" /></template></template><OperationsSettings v-if="settings&&active" :api="api" @close="settings=false" @saved="refresh" /></div></template>

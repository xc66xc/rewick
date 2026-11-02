<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { z } from 'zod'
import { type ApiClient,message } from '../../api'
import Panel from './ServicesPanel.vue'
import Button from '../ui/Button.vue'
import Switch from '../ui/Switch.vue'
import FormField from './FormField.vue'
import ServiceFeedback from './ServiceFeedback.vue'
const policySchema = z.object({
  maxFiles: z.number().int().min(1).max(100), maxTotalBytes: z.number().int().min(1048576).max(1073741824), maxChunks: z.number().int().min(1).max(50000),
  childTarget: z.number().int().min(100).max(640), childOverlap: z.number().int().min(0).max(100), parentTarget: z.number().int().min(400).max(1600),
  bm25K1: z.number().min(0.1).max(3), bm25B: z.number().min(0).max(1), vectorMinScore: z.number().min(0).max(1), rrfConstant: z.number().int().min(1).max(1000),
  bm25TimeoutMs: z.number().int().min(30).max(1000), maxTermRows: z.number().int().min(1000).max(2000000), cacheEnabled: z.boolean(), cacheWeightBytes: z.number().int().min(1048576).max(16777216),
  questionVectorMinScore: z.number().min(0).max(1), hybridEnabled: z.boolean(), version: z.number().int().nonnegative(),
}).refine(p => p.childOverlap < p.childTarget && p.parentTarget >= p.childTarget, '重叠必须小于子片段目标，父片段不能小于子片段。')
type Policy = z.infer<typeof policySchema>
const numericFields = [
  ['maxFiles', '每用户文件数量', 1, 100, 1], ['maxChunks', '每用户子片段数量', 1, 50000, 1],
  ['childTarget', '子片段目标字符数', 100, 640, 1], ['childOverlap', '子片段重叠字符数', 0, 100, 1], ['parentTarget', '父正文目标字符数', 400, 1600, 1],
  ['bm25K1', 'BM25 k1', 0.1, 3, 0.1], ['bm25B', 'BM25 b', 0, 1, 0.05], ['questionVectorMinScore', '问题向量相似度阈值', 0, 1, 0.01], ['vectorMinScore', '正文向量相似度阈值', 0, 1, 0.01],
  ['rrfConstant', 'RRF 常数', 1, 1000, 1], ['bm25TimeoutMs', 'BM25 SQL 超时（毫秒）', 30, 1000, 1], ['maxTermRows', '每用户倒排记录上限', 1000, 2000000, 1],
] as const

const props=defineProps<{api:ApiClient}>(),policy=ref<Policy|null>(null),busy=ref(false),error=ref(''),notice=ref('')
let controller:AbortController|undefined,operation:AbortController|undefined
async function load(){controller?.abort();const c=new AbortController();controller=c;try{const value=await props.api.request('/admin/reference-policy',policySchema,{signal:c.signal});if(!c.signal.aborted){policy.value=value;error.value=''}}catch(reason){if(!c.signal.aborted)error.value=message(reason)}}
async function save(){if(!policy.value||busy.value)return;busy.value=true;notice.value='';error.value='';const c=new AbortController();operation=c;try{await props.api.request('/admin/reference-policy',z.undefined(),{method:'PUT',body:policySchema.parse(policy.value),signal:c.signal});if(!c.signal.aborted){notice.value='资料策略已保存。';await load()}}catch(reason){if(!c.signal.aborted)error.value=message(reason)}finally{if(!c.signal.aborted)busy.value=false}}
onBeforeUnmount(()=>{controller?.abort();operation?.abort()})
void load()
</script>
<template><Panel title="参考资料混合检索" class="reveal"><div class="stack"><p class="field-hint">支持 Markdown 和 Word，单文件最大 10MB。QA 按问题标题优先召回，问题/正文向量以2:1排名融合为向量Top4，再与BM25 Top4做RRF保留Top2，同题去重。联网搜索独立配置；切分参数修改只影响之后重建的索引。</p><ServiceFeedback :error="error" :notice="notice"/><Button v-if="!policy" @click="load">{{error?'重新加载策略':'正在加载策略…'}}</Button><form v-else class="stack" aria-label="资料检索策略设置" @submit.prevent="save"><fieldset :disabled="busy" class="form-grid"><Switch v-model="policy.hybridEnabled" label="启用本地混合检索"/><FormField v-for="[key,label,min,max,step] in numericFields" :key="key" v-model="policy[key]" :label="label" type="number" :min="min" :max="max" :step="step" required/><FormField label="每用户资料总容量（MB）" :model-value="policy.maxTotalBytes/1048576" type="number" min="1" max="1024" required @update:model-value="policy.maxTotalBytes=Math.round(Number($event)*1048576)"/><FormField label="父正文缓存估算容量（MB）" :model-value="policy.cacheWeightBytes/1048576" type="number" min="1" max="16" required @update:model-value="policy.cacheWeightBytes=Math.round(Number($event)*1048576)"/><Switch v-model="policy.cacheEnabled" label="启用父正文缓存"/></fieldset><Button variant="primary" type="submit" :loading="busy">保存资料策略</Button></form></div></Panel></template>

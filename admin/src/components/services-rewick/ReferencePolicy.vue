<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { z } from 'zod'
import { type ApiClient,message } from '../../api'
import { referencePolicySchema as policySchema,type ReferencePolicy as Policy } from '../../reference-policy'
import Panel from './ServicesPanel.vue'
import Button from '../ui/Button.vue'
import Switch from '../ui/Switch.vue'
import FormField from './FormField.vue'
import ServiceFeedback from './ServiceFeedback.vue'
const numericFields = [
  ['bm25TopK', 'BM25 召回数', 1, 20, 1], ['vectorTopK', '向量召回数', 1, 20, 1],
  ['rrfTopN', 'RRF 保留数 TopN', 1, 40, 1], ['rerankTopN', 'rerank 保留数 TopN（开启后生效）', 1, 20, 1],
  ['maxFiles', '每用户文件数量', 1, 100, 1], ['maxChunks', '每用户子片段数量', 1, 50000, 1],
  ['childTarget', '子片段目标字符数', 100, 640, 1], ['childOverlap', '子片段重叠字符数', 0, 100, 1], ['parentTarget', '父正文目标字符数', 400, 1600, 1],
  ['bm25K1', 'BM25 k1', 0.1, 3, 0.1], ['bm25B', 'BM25 b', 0, 1, 0.05], ['questionVectorMinScore', '问题向量相似度阈值', 0, 1, 0.01], ['vectorMinScore', '正文向量相似度阈值', 0, 1, 0.01],
  ['rrfConstant', 'RRF 常数', 1, 1000, 1], ['bm25TimeoutMs', 'BM25 SQL 超时（毫秒）', 30, 1000, 1], ['maxTermRows', '每用户倒排记录上限', 1000, 2000000, 1],
] as const

const props=defineProps<{api:ApiClient}>(),policy=ref<Policy|null>(null),busy=ref(false),error=ref(''),notice=ref('')
let controller:AbortController|undefined,operation:AbortController|undefined
async function load(){controller?.abort();const c=new AbortController();controller=c;try{const value=await props.api.request('/admin/reference-policy',policySchema,{signal:c.signal});if(!c.signal.aborted){policy.value=value;error.value=''}}catch(reason){if(!c.signal.aborted)error.value=message(reason)}}
async function save(){if(!policy.value||busy.value)return;busy.value=true;notice.value='';error.value='';const c=new AbortController();operation=c;try{const parsed=policySchema.safeParse(policy.value);if(!parsed.success)throw new Error(parsed.error.issues.map(issue=>issue.message).join('；'));await props.api.request('/admin/reference-policy',z.undefined(),{method:'PUT',body:parsed.data,signal:c.signal});if(!c.signal.aborted){notice.value='资料策略已保存，下一次检索请求生效。';await load()}}catch(reason){if(!c.signal.aborted)error.value=message(reason)}finally{if(!c.signal.aborted)busy.value=false}}
onBeforeUnmount(()=>{controller?.abort();operation?.abort()})
void load()
</script>
<template><Panel title="参考资料混合检索" class="reveal"><div class="stack"><p class="field-hint">支持 Markdown 和 Word，单文件最大 10MB。问题/正文向量以 2:1 排名融合，再与 BM25 做 RRF 同题去重。先保留 RRF 候选池；开启重排序后从池内选取 rerank TopN，失败时按 RRF 顺序取同样数量；关闭时直接使用 RRF 候选池。须满足 rerank TopN ≤ RRF TopN ≤ 两路召回数之和。以上召回与保留数按每个提取问题分别执行；多题资料按覆盖合并，整轮正文仍最多 4800 字符，实际送入模型的片段可能少于召回数。数量修改下一次请求生效，无需重建索引；切分参数仅影响之后重建的索引。</p><ServiceFeedback :error="error" :notice="notice"/><Button v-if="!policy" @click="load">{{error?'重新加载策略':'正在加载策略…'}}</Button><form v-else class="stack" aria-label="资料检索策略设置" @submit.prevent="save"><fieldset :disabled="busy" class="form-grid"><Switch v-model="policy.hybridEnabled" label="启用本地混合检索"/><FormField v-for="[key,label,min,max,step] in numericFields" :key="key" v-model="policy[key]" :label="label" type="number" :min="min" :max="max" :step="step" required/><FormField label="每用户资料总容量（MB）" :model-value="policy.maxTotalBytes/1048576" type="number" min="1" max="1024" required @update:model-value="policy.maxTotalBytes=Math.round(Number($event)*1048576)"/><FormField label="父正文缓存估算容量（MB）" :model-value="policy.cacheWeightBytes/1048576" type="number" min="1" max="16" required @update:model-value="policy.cacheWeightBytes=Math.round(Number($event)*1048576)"/><Switch v-model="policy.cacheEnabled" label="启用父正文缓存"/></fieldset><Button variant="primary" type="submit" :loading="busy">保存资料策略</Button></form></div></Panel></template>

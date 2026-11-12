<script setup lang="ts">
import { questionRewriteStatusNames, type QuestionRewriteProbe } from '../../question-rewrite'
defineProps<{ value: QuestionRewriteProbe; durationMs: number }>()
</script>

<template>
  <section class="stack" aria-label="改写测试结果" aria-live="polite">
    <p class="field-hint">{{ questionRewriteStatusNames[value.status] }} · 实际模型：{{ value.model }} · 测试耗时 {{ durationMs.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) }} ms</p>
    <dl class="business-facts">
      <div><dt>固定样例原文</dt><dd>{{ value.originalQuestion }}</dd></div>
      <div><dt>改写结果</dt><dd>{{ value.status === 'rewritten' ? value.question : value.originalQuestion }}</dd></div>
    </dl>
  </section>
</template>

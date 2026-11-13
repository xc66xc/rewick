<script setup lang="ts">
import { questionRewriteStatusNames, type QuestionRewriteProbe } from '../../question-rewrite'
defineProps<{ value: QuestionRewriteProbe; durationMs: number }>()
</script>

<template>
  <section class="stack" aria-label="问题提取测试结果" aria-live="polite">
    <p class="field-hint">{{ questionRewriteStatusNames[value.status] }} · 实际模型：{{ value.model }} · 测试耗时 {{ durationMs.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) }} ms</p>
    <dl class="business-facts">
      <div><dt>固定样例原文</dt><dd>{{ value.originalQuestion }}</dd></div>
      <div><dt>{{ value.status === 'rewritten' ? `提取的 ${value.questions.length} 个问题` : '整理结果' }}</dt><dd>
        <ol v-if="value.status === 'rewritten'" class="question-preview__list" aria-label="提取的问题">
          <li v-for="question in value.questions" :key="question.id">
            <p class="question-preview__question">{{ question.question }}</p>
            <p class="field-hint">对应原话：{{ question.sourceTexts.join('；') }}</p>
            <p v-if="question.contextSourceTexts?.length" class="field-hint">指代上下文：{{ question.contextSourceTexts.join('；') }}</p>
          </li>
        </ol>
        <p v-else>{{ value.originalQuestion }}</p>
      </dd></div>
    </dl>
  </section>
</template>

<style scoped>
.question-preview__list { display: grid; gap: 12px; margin: 0; padding-inline-start: 1.5em; list-style: decimal; }
.question-preview__question { margin: 0; overflow-wrap: anywhere; }
</style>

<script setup lang="ts">
import { dateTime } from '../../types'
import Tag from '../../components/ui/Tag.vue'
defineProps<{ updatedAt?: string | null; stale?: boolean }>()
</script>
<template><div class="business-toolbar business-caption"><Tag :tone="stale ? 'red' : 'lime'">{{ stale ? '数据可能过期' : '数据已更新' }}</Tag><span>更新于 {{ updatedAt ? dateTime(updatedAt) : '未知' }}</span></div></template>

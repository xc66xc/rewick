<script setup lang="ts">
import Button from './Button.vue'
defineProps<{ error?: string; text?: string }>()
const emit = defineEmits<{ retry: [] }>()
</script>
<template><div class="empty-state" :role="error ? 'alert' : 'status'"><span v-if="!error && !text" class="spinner" aria-hidden="true" /><p>{{ error || text || '正在加载…' }}</p><Button v-if="error" @click="emit('retry')">重试</Button></div></template>

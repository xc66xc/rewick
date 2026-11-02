<script setup lang="ts">
import { onErrorCaptured, ref, watch } from 'vue'
import LoadState from './LoadState.vue'
const props = defineProps<{ resetKey?: string }>()
const error = ref('')
watch(() => props.resetKey, () => { error.value = '' })
onErrorCaptured(reason => { console.error('[error][admin-page]', reason); error.value = '页面显示失败，请切换页面后重试。'; return false })
</script>
<template><LoadState v-if="error" :error="error" @retry="error = ''" /><slot v-else /></template>

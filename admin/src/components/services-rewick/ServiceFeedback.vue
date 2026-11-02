<script setup lang="ts">
defineProps<{ error?: string; notice?: string; conflict?: boolean }>()
</script>
<template><div v-if="error || notice || conflict" class="stack"><p v-if="error" role="alert" class="field-error">{{ error }}</p><p v-if="notice" role="status" class="field-hint">{{ notice }}</p><p v-if="conflict" role="status" class="field-error">配置已被其他管理员修改，当前草稿已保留。请核对后重新加载。</p></div></template>

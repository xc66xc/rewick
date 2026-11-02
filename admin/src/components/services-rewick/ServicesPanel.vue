<script setup lang="ts">
import Panel from '../ui/Panel.vue'
defineProps<{title?:string;meta?:string}>()
</script>
<template><Panel :title="title" :meta="meta"><template v-if="$slots.tools" #tools><slot name="tools"/></template><div class="panel-body"><slot/></div></Panel></template>

<style scoped>
/* Keep native fieldset disabling without the browser border absent from reference forms. */
:deep(fieldset) { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
</style>

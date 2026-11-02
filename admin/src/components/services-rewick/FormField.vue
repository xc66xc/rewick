<script setup lang="ts">
import Field from '../ui/Field.vue'
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ label: string; modelValue?: string | number | null; type?: string; multiline?: boolean; hint?: string }>(), { type: 'text' })
const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
function input(event: Event) { const el = event.target as HTMLInputElement; emit('update:modelValue', el.type === 'number' ? Number(el.value) : el.value) }
</script>
<template><Field :label="label" :hint="hint" :class="$attrs.class"><span :class="['input-shell', multiline && 'is-multiline']"><textarea v-if="multiline" v-bind="{...$attrs,class:undefined}" :value="modelValue ?? ''" @input="input" /><input v-else v-bind="{...$attrs,class:undefined}" :type="type" :value="modelValue ?? ''" @input="input" /></span></Field></template>

<script setup lang="ts">
import { computed } from 'vue'
import Field from '../ui/Field.vue'
const props = withDefaults(defineProps<{ modelValue: number; label?: string; disabled?: boolean }>(), { label: '时长' })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const parts = computed(() => [Math.floor(props.modelValue / 3600), Math.floor(props.modelValue % 3600 / 60), props.modelValue % 60])
function change(index: number, event: Event) { const next = [...parts.value]; next[index] = Number((event.target as HTMLInputElement).value); emit('update:modelValue', next[0] * 3600 + next[1] * 60 + next[2]) }
</script>
<template><fieldset><legend class="field-label">{{ label }}</legend><div class="form-grid"><Field v-for="(name, index) in ['小时', '分钟', '秒']" :key="name" :label="name"><span class="input-shell"><input type="number" required :min="0" :max="index === 0 ? 87600 : 59" step="1" :value="parts[index]" :disabled="disabled" @input="change(index, $event)" /></span></Field></div></fieldset></template>

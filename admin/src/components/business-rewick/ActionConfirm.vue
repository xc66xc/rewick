<script setup lang="ts">
import Modal from '../ui/Modal.vue'
import Button from '../ui/Button.vue'
withDefaults(defineProps<{ title: string; action: string; busy?: boolean; error?: string }>(), { busy: false, error: '' })
const emit = defineEmits<{ close: []; confirm: [] }>()
</script>
<template><Modal :open="true" :busy="busy" :title="title" @close="!busy && emit('close')"><slot /><p v-if="error" class="field-error" role="alert">{{ error }}</p><template #footer><Button :disabled="busy" @click="emit('close')">取消</Button><Button variant="danger" :loading="busy" @click="emit('confirm')">{{ action }}</Button></template></Modal></template>

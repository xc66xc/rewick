<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Modal from '../ui/Modal.vue'
import TextInput from '../ui/TextInput.vue'
import Icon from '../Icon.vue'
import { pages, type PageId } from '../../composables/navigation'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; navigate: [page: PageId] }>()
const query = ref('')
watch(() => props.open, value => { if (value) query.value = '' })
const filtered = computed(() => pages.filter(p => p.label.includes(query.value.trim())))
</script>
<template><Modal :open="open" title="搜索页面" :width="560" close-on-overlay @close="emit('close')"><TextInput v-model="query" icon="search" placeholder="搜索管理页面" aria-label="搜索管理页面" /><div class="stack" role="list"><button v-for="p in filtered" :key="p.key" class="nav-item" @click="emit('navigate', p.key); emit('close')"><Icon :name="p.icon" /><span>{{ p.label }}</span></button><p v-if="!filtered.length" class="faint">没有匹配的页面</p></div></Modal></template>

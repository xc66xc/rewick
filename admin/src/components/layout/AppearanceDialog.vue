<script setup lang="ts">
import Modal from '../ui/Modal.vue'
import Segmented from '../ui/Segmented.vue'
import Button from '../ui/Button.vue'
import Switch from '../ui/Switch.vue'
import { appearance, appearanceError } from '../../composables/appearance'
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const themes = [{ label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }, { label: '跟随系统', value: 'auto' }]
const densities = [{ label: '宽松', value: 'comfy' }, { label: '标准', value: 'regular' }, { label: '紧凑', value: 'compact' }]
</script>
<template><Modal :open="open" title="外观设置" sub="仅保存在当前浏览器" :width="460" close-on-overlay @close="emit('close')"><div class="pref-list"><div class="pref-row"><div><div class="pref-title">主题</div><div class="pref-desc">跟随系统时随操作系统的浅色 / 深色自动切换</div></div><Segmented v-model="appearance.theme" :options="themes" label="主题" /></div><div class="pref-row"><div><div class="pref-title">表格密度</div><div class="pref-desc">影响所有列表的行高</div></div><Segmented v-model="appearance.density" :options="densities" label="表格密度" /></div><div class="pref-row"><div><div class="pref-title">界面动效</div><div class="pref-desc">系统减少动态效果优先，页面隐藏时暂停</div></div><Switch v-model="appearance.motion" label="界面动效" /></div></div><p v-if="appearanceError" role="status" class="form-error">{{ appearanceError }}</p><template #footer><Button variant="primary" @click="emit('close')">完成</Button></template></Modal></template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '../Icon.vue'
import IconButton from '../ui/IconButton.vue'
import Avatar from '../ui/Avatar.vue'
import { groups, pages, type PageId } from '../../composables/navigation'
const props = defineProps<{ page: PageId; name: string }>()
const emit = defineEmits<{ toggle: []; command: []; appearance: []; logout: [] }>()
const group = computed(() => groups.find(g => g.items.some(item => item.key === props.page))?.title)
const current = computed(() => pages.find(p => p.key === props.page)?.label)
</script>
<template><header class="topbar"><IconButton name="panelLeft" label="切换导航" @click="emit('toggle')" /><nav class="crumbs" aria-label="面包屑"><span>{{ group }}</span><Icon class="crumb-sep" name="chevronRight" :size="12" /><span class="crumb-current">{{ current }}</span></nav><span class="spacer" /><button class="cmd-trigger m-pill" type="button" @click="emit('command')"><Icon name="search" :size="16" /><span class="cmd-text">搜索页面与操作</span><span class="kbd">⌘ K</span></button><IconButton name="sun" label="外观设置" @click="emit('appearance')" /><span class="user-chip"><Avatar :name="name" :size="30" /><span class="user-meta"><span class="user-name">{{ name }}</span><br /><span class="user-role">管理员</span></span></span><IconButton name="logout" label="退出登录" @click="emit('logout')" /></header></template>

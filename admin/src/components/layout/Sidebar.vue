<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '../Icon.vue'
import { APP } from '../../data'
import { groups, type PageId } from '../../composables/navigation'
import { slideThumb } from '../../composables/motion'
import { appearance } from '../../composables/appearance'
const props = defineProps<{ page: PageId }>()
const emit = defineEmits<{ navigate: [page: PageId] }>()
const nav = ref<HTMLElement | null>(null), thumb = ref<HTMLElement | null>(null)
let observer: ResizeObserver | undefined
async function move(instant = false) { await nextTick(); slideThumb(thumb.value, nav.value?.querySelector('.is-active') ?? null, 'y', instant) }
watch(() => props.page, () => move())
watch(() => appearance.railCollapsed, () => move(true))
onMounted(() => { void move(true); observer = new ResizeObserver(() => move(true)); if (nav.value) observer.observe(nav.value) })
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <aside class="rail m-rail"><div class="rail-brand"><img class="brand-mark" src="/rewick-icon.png" alt="掌灯 Rewick" width="34" height="34" /><div class="brand-text"><div class="brand-name">掌灯 Rewick</div><div class="brand-sub">平台管理工作区</div></div></div>
    <nav ref="nav" class="rail-nav" aria-label="管理导航"><div ref="thumb" class="nav-thumb m-pill" aria-hidden="true" />
      <div v-for="group in groups" :key="group.title" class="nav-group"><div class="nav-group-title">{{ group.title }}</div><div class="nav-list"><button v-for="item in group.items" :key="item.key" type="button" class="nav-item" :class="{ 'is-active': page === item.key }" :aria-label="item.label" :aria-current="page === item.key ? 'page' : undefined" :title="appearance.railCollapsed ? item.label : undefined" @click="emit('navigate', item.key)"><Icon class="nav-ico" :name="item.icon" /><span class="nav-label">{{ item.label }}</span></button></div></div>
    </nav><div class="rail-foot"><span class="nav-label faint">管理端 {{ APP.version }}</span></div>
  </aside>
</template>

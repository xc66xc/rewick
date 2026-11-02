<script setup lang="ts">
import { computed } from 'vue'
import Odometer from '../../components/ui/Odometer.vue'
import { trackGlow } from '../../composables/motion'
const props = defineProps<{ values: [string, string][]; hero?: boolean }>()
const figures = computed(() => props.values.map(([label, value]) => {
  const match = value.match(/^([¥￥]?\s*)(\d[\d,]*(?:\.\d+)?)(.*)$/)
  return { label, value, number: match ? Number(match[2].replaceAll(',', '')) : null, prefix: match?.[1] ?? '', unit: match?.[3] ?? '', decimals: match?.[2].split('.')[1]?.length ?? 0 }
}))
</script>
<template><div class="bento-grid"><section v-for="(item, i) in figures" :key="item.label" class="bento" :class="hero && i === 0 ? 'bento-hero m-glow' : hero && i < 3 ? 'bento-side' : 'bento-third'" :aria-label="`${item.label} ${item.value}`" @pointermove="trackGlow"><span v-if="hero && i === 0" class="glow-layer" aria-hidden="true" /><div class="bento-head"><h3 class="section-label">{{ item.label }}</h3></div><div class="metric" :class="hero && i === 0 ? 'metric-xl' : 'metric-m'"><span class="metric-figure"><span v-if="item.prefix" class="metric-unit">{{ item.prefix }}</span><Odometer v-if="item.number !== null" :value="item.number" :decimals="item.decimals" /><span v-else>{{ item.value }}</span><sup v-if="item.unit" class="metric-unit">{{ item.unit }}</sup></span></div></section></div></template>

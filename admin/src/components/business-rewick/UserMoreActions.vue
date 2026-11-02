<script setup lang="ts">
import { nextTick, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { overlayEnter, overlayLeave } from '../../composables/motion'
const props = defineProps<{ name: string }>()
const emit = defineEmits<{ select: [kind: 'history' | 'mock-wallet' | 'password' | 'revoke'] }>()
const trigger = ref<HTMLButtonElement | null>(null), panel = ref<HTMLElement | null>(null), position = ref<{ top: number; left: number } | null>(null)
const actions = [{ kind: 'history', label: '时长记录' }, { kind: 'mock-wallet', label: '调整模拟时长' }, { kind: 'password', label: '重置密码' }, { kind: 'revoke', label: '撤销登录' }] as const
function close(focus = false) { position.value = null; if (focus) trigger.value?.focus() }
function toggle() { const rect = trigger.value?.getBoundingClientRect(); if (!rect) return; if (position.value) return close(); position.value = { top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 190)), left: Math.max(8, Math.min(rect.right - 220, window.innerWidth - 228)) } }
function outside(event: PointerEvent) { if (event.target instanceof Node && !panel.value?.contains(event.target) && !trigger.value?.contains(event.target)) close() }
function key(event: KeyboardEvent) { if (event.key === 'Escape') { event.stopPropagation(); close(true) }; if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && panel.value) { event.preventDefault(); const buttons = [...panel.value.querySelectorAll<HTMLButtonElement>('button')]; const index = buttons.findIndex(node => node === document.activeElement); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus() } }
function resized() { close() }
function focusout(event: FocusEvent) { if (!(event.relatedTarget instanceof Node) || !panel.value?.contains(event.relatedTarget)) close() }
function dispose() { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); window.removeEventListener('resize', resized); window.removeEventListener('scroll', resized, true) }
watch(position, async value => { dispose(); if (!value) return; await nextTick(); if (!position.value) return; panel.value?.querySelector('button')?.focus(); document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key); window.addEventListener('resize', resized); window.addEventListener('scroll', resized, true) })
onBeforeUnmount(dispose)
onDeactivated(() => { close(); dispose() })
function select(kind: typeof actions[number]['kind']) { close(true); emit('select', kind) }
</script>
<template><button ref="trigger" class="btn btn-text btn-sm" :aria-label="`更多操作 ${props.name}`" :aria-expanded="Boolean(position)" @click="toggle">更多</button><Teleport to="body"><Transition :css="false" @enter="(el, done) => overlayEnter(el, done, 'pop')" @leave="(el, done) => overlayLeave(el, done, 'pop')"><div v-if="position" ref="panel" class="menu-pop m-float" role="group" :aria-label="`${props.name} 的更多操作`" :style="{ top: `${position.top}px`, left: `${position.left}px` }" @focusout="focusout"><button v-for="action in actions" :key="action.kind" class="menu-item" type="button" :aria-label="`${action.label} ${props.name}`" @click="select(action.kind)">{{ action.label }}</button></div></Transition></Teleport></template>

<script setup lang="ts">
import { APP } from '../data'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import NeuralNet from '../components/NeuralNet.vue'
import Icon from '../components/Icon.vue'
import Button from '../components/ui/Button.vue'
import Field from '../components/ui/Field.vue'
import TextInput from '../components/ui/TextInput.vue'
import IconButton from '../components/ui/IconButton.vue'
import AppearanceDialog from '../components/layout/AppearanceDialog.vue'
import { EASE, gsap, motionSkipped, playShellEntrance, trackGlow } from '../composables/motion'
const props = defineProps<{ busy: boolean; error: string; login: (identifier: string, password: string) => Promise<boolean> }>()
const emit = defineEmits<{ preparing: []; ready: [] }>()
const identifier = ref(''), password = ref(''), succeeded = ref(false), appearanceOpen = ref(false), netBurst = ref(0)
const root = ref<HTMLElement | null>(null), card = ref<HTMLElement | null>(null), now = ref(new Date())
const clock = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false }))
const dateLine = computed(() => now.value.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }))
const ticks = Array.from({ length: 60 }, (_, i) => { const a = i / 60 * Math.PI * 2 - Math.PI / 2, r = i % 5 === 0 ? 40 : 43; return { i, x1: 50 + Math.cos(a)*r, y1: 50 + Math.sin(a)*r, x2: 50 + Math.cos(a)*47, y2: 50 + Math.sin(a)*47 } })
const capabilities = [{ icon: 'users', title: '用户与时长', desc: '账号授权、独立余额与变更账本' }, { icon: 'settings', title: '模型与服务', desc: '回答、语音、检索和联网服务统一配置' }, { icon: 'chart', title: '运营观测', desc: '运行健康、操作链路与执行记录' }, { icon: 'wallet', title: '支付与套餐', desc: '商户配置、订单及退款记录' }]
let timer: ReturnType<typeof setInterval> | undefined, entrance: gsap.core.Timeline | undefined, success: gsap.core.Timeline | undefined
function onTilt(event: PointerEvent) {
  if (!card.value || motionSkipped() || !window.matchMedia('(hover: hover)').matches) return
  const rect = card.value.getBoundingClientRect()
  gsap.to(card.value, { rotateY: Math.max(-4, Math.min(4, ((event.clientX-rect.left)/rect.width-.5)*8)), rotateX: Math.max(-3, Math.min(3, -((event.clientY-rect.top)/rect.height-.5)*6)), duration: .55, ease: EASE.glide, overwrite: 'auto' })
}
function resetTilt() { if (card.value) gsap.to(card.value, { rotateX: 0, rotateY: 0, duration: .6, ease: EASE.glide }) }
function visibility() { if (document.hidden) clearInterval(timer); else { now.value = new Date(); clearInterval(timer); timer = setInterval(() => { now.value = new Date() }, 1000) } }
async function submit() {
  if (props.busy || succeeded.value) return
  emit('preparing')
  const accepted = await props.login(identifier.value.trim(), password.value)
  password.value = ''
  if (!accepted) { emit('ready'); return }
  succeeded.value = true; netBurst.value++
  await nextTick()
  const orb = card.value?.querySelector('.success-orb')
  if (!orb || motionSkipped()) { emit('ready'); return }
  success = gsap.timeline({ onComplete: () => emit('ready') })
  success.fromTo(orb, { width: card.value?.querySelector('.login-submit-slot')?.clientWidth ?? 240 }, { width: 46, duration: .42, ease: EASE.swap })
  success.fromTo(orb.querySelector('circle'), { strokeDashoffset: 126 }, { strokeDashoffset: 0, duration: .5, ease: EASE.reveal }, '-=.08')
  success.fromTo(orb.querySelector('path'), { strokeDashoffset: 24 }, { strokeDashoffset: 0, duration: .32, ease: EASE.settle }, '-=.22')
}
onMounted(() => {
  visibility()
  document.addEventListener('visibilitychange', visibility)
  const element = root.value
  if (!element) return
  // Clearing GSAP's inline opacity must reveal the final CSS state, including
  // when entrance motion is skipped for reduced motion or a hidden page.
  element.classList.add('is-entrance-ready')
  if (!motionSkipped()) {
    entrance = gsap.timeline()
    entrance.fromTo(element.querySelectorAll('.login-brand,.hero-line,.cap-item,.login-dial,.login-plate,.login-card'),
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: .8, stagger: .07, ease: EASE.reveal, clearProps: 'transform,opacity' })
  }
})
onBeforeUnmount(() => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); entrance?.kill(); success?.kill(); if (card.value) gsap.killTweensOf(card.value) })
</script>
<template><div ref="root" class="login"><section class="login-canvas" aria-label="系统介绍"><div class="canvas-grid" aria-hidden="true" /><div class="canvas-glow" aria-hidden="true" /><NeuralNet :burst-key="netBurst" /><div class="login-brand"><span class="brand-mark"><span class="brand-dot" /></span><div><div class="brand-name">掌灯 Rewick</div><div class="brand-sub">平台管理工作区</div></div></div><div class="canvas-main"><div class="canvas-copy"><span class="eyebrow hero-line">平台管理 · {{ APP.version }}</span><h1 class="login-title"><span class="hero-line">统一的平台管理，</span><span class="hero-line">专注业务本身。</span></h1><p class="login-lead hero-line">用户、模型、服务与运行观测，在同一个清晰的工作台中管理。</p></div><div class="login-dial" aria-hidden="true"><svg viewBox="0 0 100 100"><line v-for="t in ticks" :key="t.i" class="dial-tick" :class="{ 'is-major': t.i % 5 === 0, 'is-on': t.i <= now.getSeconds() }" :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2" /></svg><div class="dial-center"><span class="dial-time tnum">{{ clock }}</span><span class="dial-date">{{ dateLine }}</span></div></div></div><div class="canvas-plates"><div class="login-plate is-health"><span class="eyebrow">访问权限</span><Icon name="shield" /><b>管理员专用</b><span class="plate-sub">登录后验证账号权限</span></div><ul class="login-plate cap-list"><li v-for="cap in capabilities" :key="cap.title" class="cap-item"><span class="cap-ico"><Icon :name="cap.icon" :size="16" /></span><span><span class="cap-title">{{ cap.title }}</span><span class="cap-desc">{{ cap.desc }}</span></span></li></ul></div><div class="login-foot">© {{ now.getFullYear() }} 掌灯 Rewick</div></section><section class="login-side" @pointermove="onTilt" @pointerleave="resetTilt"><div class="login-appearance"><IconButton name="sun" label="外观设置" @click="appearanceOpen = true" /></div><div ref="card" class="login-card m-float m-glow" role="region" aria-labelledby="login-heading" @pointermove="trackGlow"><span class="glow-layer" aria-hidden="true" /><div class="login-card-inner"><span class="eyebrow">账号登录</span><h2 id="login-heading" class="login-card-title">登录管理后台</h2><p class="login-card-sub">使用已配置的管理员账号，刷新后重新验证权限</p><form class="login-form" @submit.prevent="submit"><Field label="管理员账号" required><TextInput v-model="identifier" required :maxlength="64" icon="user" autocomplete="username" placeholder="请输入管理员账号" :disabled="busy || succeeded" /></Field><Field label="登录密码" required><TextInput v-model="password" required type="password" icon="lock" autocomplete="current-password" placeholder="请输入登录密码" :disabled="busy || succeeded" /></Field><p v-if="error" class="login-error" role="alert"><Icon name="alert" :size="15" />{{ error }}</p><div class="login-submit-slot"><Button v-if="!succeeded" type="submit" variant="primary" block :loading="busy" class="login-submit">登录管理后台</Button><div v-else class="success-orb" role="status" aria-label="登录成功，正在进入"><svg width="30" height="30" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="20" stroke-dasharray="126" /><path d="m15 23.5 5.5 5.5L31.5 18" stroke-dasharray="24" /></svg></div></div></form></div></div></section><AppearanceDialog :open="appearanceOpen" @close="appearanceOpen = false" /></div></template>

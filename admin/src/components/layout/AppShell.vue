<script setup lang="ts">
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Session } from '../../composables/auth'
import type { PageId } from '../../composables/navigation'
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'
import AppearanceDialog from './AppearanceDialog.vue'
import CommandPalette from './CommandPalette.vue'
import { appearance } from '../../composables/appearance'
import { pageLeave, playShellEntrance, gsap } from '../../composables/motion'
import { enterBusinessPage, stopBusinessPage } from '../../composables/pageMotion'
import PageBoundary from '../ui/PageBoundary.vue'
import { settleConfirm } from '../../composables/confirm'
import { createFocusTrap } from '../../composables/focus'
const props = defineProps<{ session: Session }>()
const emit = defineEmits<{ logout: [] }>()
const views = {
  users: defineAsyncComponent(() => import('../../views/business/UsersPage.vue')),
  packages: defineAsyncComponent(() => import('../../views/business/PackagesPage.vue')),
  'payment-orders': defineAsyncComponent(() => import('../../views/business/PaymentOrdersPage.vue')),
  invitations: defineAsyncComponent(() => import('../../views/business/InvitationsPage.vue')),
  config: defineAsyncComponent(() => import('../../views/services/ConfigPage.vue')),
  email: defineAsyncComponent(() => import('../../views/services/EmailConfigPage.vue')),
  'payment-config': defineAsyncComponent(() => import('../../views/services/PaymentConfigPage.vue')),
  'mock-interviews': defineAsyncComponent(() => import('../../views/services/MockInterviewConfigPage.vue')),
  downloads: defineAsyncComponent(() => import('../../views/services/ClientDownloadsPage.vue')),
  operations: defineAsyncComponent(() => import('../../views/operations/OperationsPage.vue')),
  usage: defineAsyncComponent(() => import('../../views/operations/UsagePage.vue')),
  audit: defineAsyncComponent(() => import('../../views/operations/AuditPage.vue'))
}
const page = ref<PageId>('users'), frame = ref<HTMLElement | null>(null), content = ref<HTMLElement | null>(null)
const mobile = ref(false), mobileOpen = ref(false), commandOpen = ref(false), appearanceOpen = ref(false), scrolled = ref(false)
const trace = ref<{ operationId?: string; userId: string }>()
const sidebar = ref<{ $el: HTMLElement } | null>(null)
const navigationFocus = createFocusTrap()
watch([mobile, mobileOpen], async ([small, open]) => {
  await nextTick()
  if (small && open && mobile.value && mobileOpen.value) navigationFocus.activate(sidebar.value?.$el ?? null)
  else navigationFocus.deactivate()
}, { flush: 'post' })
const mq = window.matchMedia('(max-width: 820px)')
const syncMobile = () => { mobile.value = mq.matches; if (!mq.matches) mobileOpen.value = false }
function navigate(next: PageId) { if (page.value !== next) settleConfirm(false); page.value = next; mobileOpen.value = false }
function shortcut(event: KeyboardEvent) { if (event.key === 'Escape' && mobileOpen.value && navigationFocus.isTop()) { event.preventDefault(); mobileOpen.value = false; return } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); commandOpen.value = !commandOpen.value } }
function enter(el: Element, done: () => void) { enterBusinessPage(el, () => { done(); const heading = el.querySelector<HTMLElement>('h1'); heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true }) }) }
function leave(el: Element, done: () => void) { stopBusinessPage(el); pageLeave(el, done) }
onMounted(() => { syncMobile(); mq.addEventListener('change', syncMobile); document.addEventListener('keydown', shortcut); if (frame.value) playShellEntrance(frame.value) })
onBeforeUnmount(() => { settleConfirm(false); navigationFocus.deactivate(); mq.removeEventListener('change', syncMobile); document.removeEventListener('keydown', shortcut); if (frame.value) { gsap.killTweensOf(frame.value.querySelectorAll('*')); frame.value.querySelectorAll('.page').forEach(stopBusinessPage) } })
</script>
<template><div class="stage"><div ref="frame" class="app-frame" :class="{ 'is-collapsed': appearance.railCollapsed && !mobile, 'is-mobile-open': mobileOpen && mobile }"><Sidebar ref="sidebar" :inert="mobile && !mobileOpen ? true : undefined" :role="mobile && mobileOpen ? 'dialog' : undefined" :aria-label="mobile && mobileOpen ? '管理导航' : undefined" :page="page" @navigate="navigate" /><button v-if="mobileOpen && mobile" class="rail-scrim" aria-label="关闭管理菜单" @click="mobileOpen = false" /><div class="workspace" :inert="mobile && mobileOpen ? true : undefined" :class="{ 'is-scrolled': scrolled }"><Topbar :page="page" :name="session.admin.displayName" @toggle="mobile ? mobileOpen = !mobileOpen : appearance.railCollapsed = !appearance.railCollapsed" @command="commandOpen = true" @appearance="appearanceOpen = true" @logout="emit('logout')" /><main ref="content" class="content" tabindex="-1" @scroll.passive="scrolled = (content?.scrollTop ?? 0) > 8"><PageBoundary :reset-key="page"><Transition mode="out-in" :css="false" appear @leave="leave" @after-leave="content?.scrollTo({ top: 0 }); scrolled = false" @enter="enter"><KeepAlive :include="['UsersPage','ConfigPage','EmailConfigPage','UsagePage','AuditPage','OperationsPage']"><component :is="views[page]" :key="page" :api="session.api" :active="true" v-bind="page === 'operations' ? { initialTrace: trace } : {}" @open-trace="trace = $event; navigate('operations')" /></KeepAlive></Transition></PageBoundary></main></div></div><AppearanceDialog :open="appearanceOpen" @close="appearanceOpen = false" /><CommandPalette :open="commandOpen" @close="commandOpen = false" @navigate="navigate" /></div></template>

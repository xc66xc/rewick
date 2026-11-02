<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from './composables/auth'
import LoginPage from './views/LoginPage.vue'
import AppShell from './components/layout/AppShell.vue'
import LoadState from './components/ui/LoadState.vue'
import ToastHost from './components/ui/ToastHost.vue'
import ConfirmHost from './components/ui/ConfirmHost.vue'
const auth = useAuth(), loginTransition = ref(false)
async function login(identifier: string, password: string) { await auth.login(identifier, password); return Boolean(auth.session.value) }
</script>
<template><LoadState v-if="auth.checking.value" text="正在验证管理会话…" /><AppShell v-else-if="auth.session.value && !loginTransition" :session="auth.session.value" @logout="auth.logout" /><LoginPage v-else :busy="auth.busy.value" :error="auth.error.value" :login="login" @preparing="loginTransition = true" @ready="loginTransition = false" /><ToastHost /><ConfirmHost /><div class="grain-layer" aria-hidden="true" /></template>

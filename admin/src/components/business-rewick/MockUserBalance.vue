<script setup lang="ts">
import type { ApiClient } from '../../api'
import { useResource } from '../../composables/useResource'
import { mockWalletSchema } from '../../mock-interviews'
import { duration } from '../../duration'
import Button from '../ui/Button.vue'
const props = defineProps<{ api: ApiClient; userId: string }>()
const { state, reload } = useResource(props.api, () => `/admin/users/${encodeURIComponent(props.userId)}/mock-wallet`, mockWalletSchema)
</script>
<template><span v-if="state.kind === 'ready'">{{ duration(state.data.availableSeconds) }}</span><span v-else-if="state.kind === 'loading'">加载中…</span><Button v-else variant="text" size="sm" :title="state.error" @click="reload">读取失败，重试</Button></template>

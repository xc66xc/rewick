<script setup lang="ts">
import type {ApiClient} from '../../api'
import {traceDetailSchema} from '../../operations'
import {useOperationsResource} from '../../composables/useOperationsResource'
import LoadState from '../../components/ui/LoadState.vue'
import OperationTimeline from './OperationTimeline.vue'
const props=defineProps<{api:ApiClient;selection:{operationId:string;userId:string};active:boolean}>()
const {state,reload}=useOperationsResource(props.api,()=>`/admin/operations/traces/${encodeURIComponent(props.selection.operationId)}?${new URLSearchParams({userId:props.selection.userId})}`,traceDetailSchema,()=>props.active)
</script>
<template><OperationTimeline v-if="state.kind==='ready'" :data="state.data" /><LoadState v-else :error="state.kind==='error'?state.error:undefined" @retry="reload" /></template>

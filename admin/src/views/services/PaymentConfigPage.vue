<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ApiClient } from '../../api'
import { paymentConfigSchema,alipayConfigSchema,zpayConfigSchema } from '../../payments'
import { useResource } from '../../composables/useResource'
import PageHeader from '../../components/ui/PageHeader.vue'
import Panel from '../../components/services-rewick/ServicesPanel.vue'
import Button from '../../components/ui/Button.vue'
import StatusTag from '../../components/ui/StatusTag.vue'
import PaymentChannelOverview from '../../components/services-rewick/PaymentChannelOverview.vue'
import PaymentChannelEditor from '../../components/services-rewick/PaymentChannelEditor.vue'
const props = defineProps<{ api:ApiClient }>()
const channel=ref<'wechat'|'alipay'|'zpay'>('wechat'),editing=ref(false),notice=ref('')
const wechat=useResource(props.api,'/admin/payment-config',paymentConfigSchema), alipay=useResource(props.api,'/admin/payment-config/alipay',alipayConfigSchema), zpay=useResource(props.api,'/admin/payment-config/zpay',zpayConfigSchema)
const resources={wechat,alipay,zpay}, selected=computed(()=>resources[channel.value].state.value)
const channels=[{value:'wechat',label:'微信支付',desc:'Native 扫码支付'},{value:'alipay',label:'支付宝支付',desc:'电脑网站支付'},{value:'zpay',label:'ZPAY',desc:'支付宝或微信收款'}] as const
function saved(){ notice.value=channel.value==='wechat'?'支付设置已保存。':channel.value==='alipay'?'支付宝设置已保存。':'ZPAY 设置已保存。'; resources[channel.value].reload() }
</script>
<template><div class="page stack"><PageHeader title="支付设置" desc="管理支付渠道，配置收款方式" /><div class="form-grid reveal" role="group" aria-label="选择支付渠道"><Button v-for="item in channels" :key="item.value" :aria-pressed="channel===item.value" :variant="channel===item.value?'primary':'secondary'" @click="channel=item.value;editing=false;notice=''">{{ item.label }} · {{ item.desc }}</Button></div><p v-if="notice" role="status">{{ notice }}</p><Panel v-if="selected.kind==='ready'" :title="channels.find(c=>c.value===channel)?.label" class="reveal"><PaymentChannelOverview v-if="!editing" :key="channel" :config="selected.data" :channel="channel" @edit="editing=true"/><PaymentChannelEditor v-else :key="`${channel}-${selected.data.version}`" :api="api" :channel="channel" :config="selected.data" @saved="saved" @cancel="editing=false" /></Panel><Panel v-else title="支付配置"><p :role="selected.kind==='error'?'alert':'status'">{{ selected.kind==='error'?selected.error:'正在加载…' }}</p><Button v-if="selected.kind==='error'" @click="resources[channel].reload">重新加载</Button></Panel></div></template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { type ApiClient, message } from '../../api'
import { paymentConfigSchema, alipayConfigSchema, zpayConfigSchema, type PaymentConfig, type AlipayConfig, type ZpayConfig } from '../../payments'
import Button from '../ui/Button.vue'
import Switch from '../ui/Switch.vue'
import Select from '../ui/Select.vue'
import Field from '../ui/Field.vue'
import FormField from './FormField.vue'
import ServiceFeedback from './ServiceFeedback.vue'
const props = defineProps<{ api: ApiClient; channel: 'wechat' | 'alipay' | 'zpay'; config: PaymentConfig | AlipayConfig | ZpayConfig }>()
const emit = defineEmits<{ saved: []; cancel: [] }>()
const draft = ref<Record<string, unknown>>({ ...props.config }), secrets = ref<Record<string, string>>({}), busy = ref(false), error = ref('')
if (props.channel === 'alipay') draft.value.gatewayUrl ||= 'https://openapi.alipay.com/gateway.do'
if (props.channel === 'zpay') Object.assign(draft.value, { gatewayUrl: draft.value.gatewayUrl || 'https://zpayz.cn/mapi.php', queryUrl: draft.value.queryUrl || 'https://zpayz.cn/api.php', notifyUrl: draft.value.notifyUrl || 'https://api.junshi.icu/api/v1/payments/zpay/notify', returnUrl: draft.value.returnUrl || 'https://junshi.icu/payment/result' })
const fields = computed(() => props.channel === 'wechat' ? [['mchId','商户号 MchID'],['appId','AppID'],['merchantSerial','商户证书序列号'],['wechatPublicKeyId','微信支付公钥 ID'],['notifyUrl','支付通知地址（HTTP / HTTPS）']] : props.channel === 'alipay' ? [['appId','支付宝 AppID'],['sellerId','收款商家 PID'],['notifyUrl','支付宝支付通知地址（HTTPS）'],['returnUrl','支付完成返回地址（HTTPS）']] : [['pid','ZPAY 商户 ID（PID）'],['gatewayUrl','API 下单地址（完整 mapi.php 地址）'],['queryUrl','订单查询地址（完整 api.php 地址）'],['notifyUrl','ZPAY 支付通知地址（HTTPS）'],['returnUrl','支付完成返回地址（HTTPS）'],['cid','指定支付渠道 CID（选填）']])
const secretFields = computed(() => props.channel === 'wechat' ? [['merchantPrivateKey','商户私钥（PEM）','hasMerchantPrivateKey'],['apiV3Key','API v3 密钥','hasApiV3Key'],['wechatPublicKey','微信支付公钥（PEM）','hasWechatPublicKey']] : props.channel === 'alipay' ? [['appPrivateKey','应用私钥（PKCS#8）','hasAppPrivateKey'],['alipayPublicKey','支付宝公钥（PEM）','hasAlipayPublicKey']] : [['merchantKey','ZPAY 商户密钥','hasMerchantKey']])
let controller: AbortController | undefined
async function save() {
  if (busy.value) return
  busy.value = true; error.value = ''; const request = new AbortController(); controller = request
  const keys = props.channel === 'wechat' ? ['mchId','appId','merchantSerial','wechatPublicKeyId','notifyUrl'] : props.channel === 'alipay' ? ['appId','sellerId','gatewayUrl','notifyUrl','returnUrl'] : ['pid','paymentType','gatewayUrl','queryUrl','notifyUrl','returnUrl','cid']
  const body: Record<string, unknown> = { version: props.config.version, enabled: draft.value.enabled }
  keys.forEach(key => { body[key] = draft.value[key] })
  secretFields.value.forEach(([key]) => { body[key] = secrets.value[key] || '' })
  try {
    if (props.channel === 'wechat') await props.api.request('/admin/payment-config', paymentConfigSchema, { method:'PUT', body, signal:request.signal })
    else if (props.channel === 'alipay') await props.api.request('/admin/payment-config/alipay', alipayConfigSchema, { method:'PUT', body, signal:request.signal })
    else await props.api.request('/admin/payment-config/zpay', zpayConfigSchema, { method:'PUT', body, signal:request.signal })
    if (!request.signal.aborted) { secrets.value = {}; emit('saved') }
  } catch (reason) { if (!request.signal.aborted) error.value = message(reason) } finally { if (!request.signal.aborted) busy.value = false }
}
onBeforeUnmount(() => { controller?.abort(); secrets.value = {} })
const environment = [{ value:'https://openapi.alipay.com/gateway.do',label:'正式环境' },{ value:'https://openapi-sandbox.dl.alipaydev.com/gateway.do',label:'沙箱环境（测试）' }]
</script>
<template><form class="stack" aria-label="编辑支付配置" @submit.prevent="save"><p class="field-hint">当前版本 {{ config.version }}。保存仅校验配置，不会发起真实扣款。</p><fieldset class="form-grid" :disabled="busy"><Switch :model-value="Boolean(draft.enabled)" :label="channel === 'wechat' ? '开放套餐支付' : channel === 'alipay' ? '开放支付宝支付' : '开放 ZPAY 支付'" @update:model-value="draft.enabled = $event" /><Field v-if="channel === 'alipay'" label="支付环境"><Select :model-value="String(draft.gatewayUrl)" :options="environment" @update:model-value="draft.gatewayUrl = $event" /></Field><Field v-if="channel === 'zpay'" label="ZPAY 收款方式"><Select :model-value="String(draft.paymentType)" :options="[{value:'alipay',label:'支付宝'},{value:'wxpay',label:'微信支付'}]" @update:model-value="draft.paymentType = $event" /></Field><FormField v-for="[key,label] in fields" :key="key" :model-value="String(draft[key] || '')" :label="label" :type="key.toLowerCase().includes('url') ? 'url' : 'text'" :required="Boolean(draft.enabled) && key !== 'cid'" maxlength="1000" autocomplete="off" @update:model-value="draft[key] = $event" /><FormField v-for="[key,label,flag] in secretFields" :key="key" v-model="secrets[key]" :label="label" :multiline="!['apiV3Key','merchantKey'].includes(key)" :type="['apiV3Key','merchantKey'].includes(key) ? 'password' : 'text'" :required="Boolean(draft.enabled) && !draft[flag]" autocomplete="new-password" :placeholder="draft[flag] ? '已保存，留空保留已有内容' : '填写密钥'" /></fieldset><p v-if="channel === 'alipay' && String(draft.gatewayUrl).includes('sandbox')" class="field-error">沙箱环境仅用于测试，不会产生真实收款。</p><p class="field-hint">密钥仅在当前表单内存中保留，保存成功或切换渠道后清除。关闭渠道只阻止新订单，已创建订单继续处理通知与到账。</p><ServiceFeedback :error="error" /><div class="page-actions"><Button :disabled="busy" @click="emit('cancel')">取消编辑</Button><Button variant="primary" type="submit" :loading="busy">{{ channel === 'wechat' ? '保存支付设置' : channel === 'alipay' ? '保存支付宝设置' : '保存 ZPAY 设置' }}</Button></div></form></template>

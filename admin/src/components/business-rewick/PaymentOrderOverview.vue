<script setup lang="ts">
import type { PaymentOrder } from '../../payments'
import { money, paymentMethodName, paymentStatus } from '../../payments'
import { dateTime } from '../../types'
import { duration } from '../../duration'
import Drawer from '../ui/Drawer.vue'
import Button from '../ui/Button.vue'
import Tag from '../ui/Tag.vue'
defineProps<{ order: PaymentOrder; busy: boolean }>()
const emit = defineEmits<{ close: []; refresh: []; refund: [] }>()
</script>
<template><Drawer :open="true" title="订单详情" origin-from="tr" @close="emit('close')"><div class="stack"><p class="business-code">{{ order.id }}</p><Tag>{{ paymentStatus(order) }}</Tag><ol class="stack"><li><strong>创建订单</strong><p class="muted">{{ dateTime(order.createdAt) }}</p></li><li><strong>{{ order.status === 'paid' ? '支付成功' : order.status === 'closed' ? '订单已关闭' : '等待支付确认' }}</strong><p class="muted">{{ order.paidAt ? dateTime(order.paidAt) : '尚无支付成功记录' }}</p></li><li><strong>{{ order.credited ? '时长已到账' : '时长未到账' }}</strong><p class="muted">{{ order.credited ? duration(order.durationSeconds) : order.status === 'paid' ? '可重试时长到账' : order.status === 'closed' ? '未支付，未发放时长' : '支付成功后到账' }}</p></li></ol><dl class="kv-grid"><div class="kv"><dt class="kv-label">用户</dt><dd class="kv-value">{{ order.displayName }} · ID {{ order.userId }}</dd></div><div class="kv"><dt class="kv-label">套餐</dt><dd class="kv-value">{{ order.packageName }}</dd></div><div class="kv"><dt class="kv-label">支付金额</dt><dd class="kv-value">{{ money(order.totalCents) }}</dd></div><div class="kv"><dt class="kv-label">支付渠道</dt><dd class="kv-value">{{ paymentMethodName(order.paymentMethod) }}</dd></div><div class="kv"><dt class="kv-label">到期时间</dt><dd class="kv-value">{{ dateTime(order.expiresAt) }}</dd></div><div class="kv"><dt class="kv-label">已登记退款 / 扣回时长</dt><dd class="kv-value">{{ money(order.refundedCents) }} / {{ duration(order.deductedSeconds) }}</dd></div></dl><Button :loading="busy" @click="emit('refresh')">{{ order.status === 'paid' && !order.credited ? '重试时长到账' : '查询支付结果' }}</Button><Button v-if="order.status === 'paid' && order.credited && order.refundedCents < order.totalCents" danger :disabled="busy" @click="emit('refund')">登记人工退款</Button></div></Drawer></template>

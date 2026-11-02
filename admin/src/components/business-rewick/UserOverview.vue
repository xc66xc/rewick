<script setup lang="ts">
import type { User } from '../../types'
import { dateTime } from '../../types'
import Drawer from '../ui/Drawer.vue'
import Button from '../ui/Button.vue'
import StatusTag from '../ui/StatusTag.vue'
import Avatar from '../ui/Avatar.vue'
import SpecPlate from '../ui/SpecPlate.vue'
const props = defineProps<{ user: User }>()
const emit = defineEmits<{ close: []; action: [kind: 'edit' | 'password' | 'revoke' | 'wallet' | 'history'] }>()
function clock(seconds: number) { return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':') }
</script>
<template><Drawer :open="true" title="用户概览" origin-from="tr" @close="emit('close')"><div class="stack"><div class="cell-main"><Avatar :name="user.displayName" :size="56" /><div><h3>{{ user.displayName }}</h3><p class="muted">{{ user.role === 'ADMIN' ? '管理员' : '普通用户' }} · ID {{ user.id }}</p></div></div><dl class="kv-grid"><div class="kv"><dt class="kv-label">账号状态</dt><dd class="kv-value"><StatusTag :status="user.enabled" on="已启用" off="已停用" /></dd></div><div class="kv"><dt class="kv-label">创建时间</dt><dd class="kv-value">{{ dateTime(user.createdAt) }}</dd></div></dl><SpecPlate title="可用时长" :rows="[{ label: '辅助余额', value: clock(user.availableSeconds), tone: 'lime' }]" /><Button variant="primary" @click="emit('action', 'wallet')">调整时长</Button><Button @click="emit('action', 'history')">查看时长记录</Button><h3>账号与安全</h3><Button @click="emit('action', 'edit')">管理账号状态</Button><Button @click="emit('action', 'password')">重置密码</Button><Button danger @click="emit('action', 'revoke')">撤销登录</Button></div></Drawer></template>

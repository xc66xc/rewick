<script setup lang="ts">
import { ref } from 'vue'
import { message, type ApiClient } from '../../api'
import { passwordError, type User } from '../../types'
import Modal from '../ui/Modal.vue'
import Button from '../ui/Button.vue'
import Field from '../ui/Field.vue'
import TextInput from '../ui/TextInput.vue'
const props = defineProps<{ api: ApiClient; user: User; mode: 'password' | 'revoke' }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const password = ref(''), error = ref(''), busy = ref(false)
async function submit() {
 if (busy.value) return
 if (props.mode === 'password' && passwordError(password.value)) { error.value = passwordError(password.value); return }
 busy.value = true; error.value = ''
 try { await props.api.empty(`/admin/users/${encodeURIComponent(props.user.id)}/${props.mode === 'password' ? 'password' : 'revoke-tokens'}`, props.mode === 'password' ? { password: password.value } : {}); emit('saved') }
 catch (reason) { error.value = message(reason) }
 finally { password.value = ''; busy.value = false }
}
</script>
<template><Modal :open="true" :busy="busy" :title="`${mode === 'password' ? '重置密码' : '撤销登录'} · ${user.displayName}`" @close="!busy && emit('close')"><form class="stack" @submit.prevent="submit"><p>这会撤销 {{ user.displayName }} 的全部登录，需要重新登录后才能发起新请求。正在进行的面试也会结束。</p><Field v-if="mode === 'password'" label="新密码" hint="至少 12 个字符，不超过 72 个 UTF-8 字节。提交后清空。"><TextInput v-model="password" type="password" autocomplete="new-password" :disabled="busy" /></Field><p v-if="error" class="field-error" role="alert">{{ error }}</p></form><template #footer><Button :disabled="busy" @click="emit('close')">取消</Button><Button variant="danger" :loading="busy" @click="submit">{{ mode === 'password' ? '重置密码并撤销登录' : '撤销全部登录' }}</Button></template></Modal></template>

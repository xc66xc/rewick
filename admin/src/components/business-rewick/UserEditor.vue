<script setup lang="ts">
import { ref } from 'vue'
import { message, type ApiClient } from '../../api'
import { passwordError, userSchema, type User } from '../../types'
import Modal from '../ui/Modal.vue'
import Button from '../ui/Button.vue'
import Field from '../ui/Field.vue'
import TextInput from '../ui/TextInput.vue'
import Switch from '../ui/Switch.vue'
import DurationFields from './DurationFields.vue'
import ActionConfirm from './ActionConfirm.vue'
const props = defineProps<{ api: ApiClient; user?: User }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const identifier = ref(''), password = ref(''), enabled = ref(props.user?.enabled ?? true), availableSeconds = ref(0), busy = ref(false), error = ref(''), confirm = ref(false)
const form = ref<HTMLFormElement | null>(null)
async function save() {
 if (busy.value) return
 busy.value = true; error.value = ''
 try { await props.api.request(props.user ? `/admin/users/${encodeURIComponent(props.user.id)}` : '/admin/users', userSchema, { method: props.user ? 'PUT' : 'POST', body: props.user ? { enabled: enabled.value } : { identifier: identifier.value.trim(), password: password.value, availableSeconds: availableSeconds.value } }); emit('saved') }
 catch (reason) { error.value = message(reason); confirm.value = false }
 finally { password.value = ''; busy.value = false }
}
function submit() {
 if (!form.value?.reportValidity()) return
 if (!props.user && (!/^[A-Za-z0-9_.@-]{3,64}$/.test(identifier.value.trim()) || passwordError(password.value) || !Number.isSafeInteger(availableSeconds.value) || availableSeconds.value < 0 || availableSeconds.value > 315360000)) { error.value = passwordError(password.value) || '请填写有效账号和初始时长。'; return }
 if (props.user?.enabled && !enabled.value) confirm.value = true
 else void save()
}
</script>
<template><Modal :open="true" :busy="busy" :title="user ? `编辑用户 · ${user.displayName}` : '创建用户'" @close="!busy && emit('close')"><form ref="form" class="stack" @submit.prevent="submit"><fieldset class="stack" :disabled="busy"><Field v-if="user" label="显示名称"><TextInput :model-value="user.displayName" readonly /></Field><template v-else><Field label="登录账号" required><TextInput v-model="identifier" autocomplete="username" :maxlength="64" /></Field><Field label="初始密码" required hint="至少 12 个字符，不超过 72 个 UTF-8 字节。提交后清空，不会回显。"><TextInput v-model="password" type="password" autocomplete="new-password" /></Field><DurationFields v-model="availableSeconds" label="初始可用时长" /><p class="muted">默认 0 秒。可用时长为 0 时无法开始面试，仍可登录和准备资料。</p></template><Switch v-if="user" v-model="enabled" label="启用账号" /><p v-if="error" class="field-error" role="alert">{{ error }}</p></fieldset></form><template #footer><Button :disabled="busy" @click="emit('close')">取消</Button><Button variant="primary" :loading="busy" @click="submit">{{ user ? '保存用户' : '创建用户' }}</Button></template></Modal><ActionConfirm v-if="confirm" :title="`停用 ${user?.displayName}`" action="确认停用" :busy="busy" @close="confirm = false" @confirm="save"><p>停用后会撤销 {{ user?.displayName }} 的全部登录，并结束正在进行的面试。</p></ActionConfirm></template>

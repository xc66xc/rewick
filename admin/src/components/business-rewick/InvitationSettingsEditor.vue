<script setup lang="ts">
import { reactive, ref } from 'vue'
import { message, type ApiClient } from '../../api'
import { invitationSettingsSchema, type InvitationSettings } from './invitations'
import Modal from '../ui/Modal.vue'
import Button from '../ui/Button.vue'
import Switch from '../ui/Switch.vue'
import DurationFields from './DurationFields.vue'
const props = defineProps<{ api: ApiClient; initial: InvitationSettings }>()
const emit = defineEmits<{ close: []; reload: []; saved: [value: InvitationSettings] }>()
const draft = reactive({ ...props.initial }), busy = ref(false), error = ref(''), form = ref<HTMLFormElement | null>(null)
async function save() { if (busy.value || !form.value?.reportValidity()) return; if (!Number.isSafeInteger(draft.rewardSeconds) || draft.rewardSeconds < 0 || draft.rewardSeconds > 315360000) { error.value = '请输入有效奖励时长。'; return }; busy.value = true; error.value = ''; try { emit('saved', await props.api.request('/admin/invitation-settings', invitationSettingsSchema, { method: 'PUT', body: { ...draft } })) } catch (reason) { error.value = message(reason) } finally { busy.value = false } }
</script>
<template><Modal :open="true" title="修改邀请奖励规则" :busy="busy" @close="!busy && emit('close')"><form ref="form" class="stack" @submit.prevent="save"><fieldset class="stack" :disabled="busy"><legend>邀请奖励规则</legend><Switch v-model="draft.enabled" label="启用邀请奖励" /><DurationFields v-model="draft.rewardSeconds" label="每成功邀请一人奖励邀请人的时长" /><p class="muted">注册时邀请码选填。仅邮箱验证并注册成功后发奖；修改规则不影响已获得的时长。</p><p v-if="error" class="field-error" role="alert">{{ error }}</p></fieldset></form><template #footer><Button variant="text" :disabled="busy" @click="emit('reload')">重新加载配置</Button><Button :disabled="busy" @click="emit('close')">取消</Button><Button variant="primary" :loading="busy" @click="save">保存奖励配置</Button></template></Modal></template>

<script setup lang="ts">
import { onBeforeUnmount,ref } from 'vue'
import { z } from 'zod'
import { type ApiClient,message } from '../../api'
import { authorizedUsersSchema } from '../../desktop-settings'
import { pageSchema,userSchema } from '../../types'
import { useResource } from '../../composables/useResource'
import Button from '../ui/Button.vue'
import Panel from './ServicesPanel.vue'
import DataTable from '../ui/DataTable.vue'
import FormField from './FormField.vue'
import ServiceFeedback from './ServiceFeedback.vue'
const props=defineProps<{api:ApiClient}>(),users=useResource(props.api,'/admin/desktop-settings/users',authorizedUsersSchema)
const schema=pageSchema(userSchema.extend({email:z.string().nullable()})),query=ref(''),results=ref<z.infer<typeof schema>['items']|null>(null),total=ref(0),searching=ref(false),busy=ref(false),error=ref(''),notice=ref('')
let controller:AbortController|undefined,operation:AbortController|undefined
async function search(){if(!query.value.trim())return;controller?.abort();const c=new AbortController();controller=c;searching.value=true;error.value='';results.value=null;try{const value=await props.api.request(`/admin/users?${new URLSearchParams({query:query.value.trim(),page:'1',size:'20'})}`,schema,{signal:c.signal});if(!c.signal.aborted){results.value=value.items;total.value=value.total}}catch(reason){if(!c.signal.aborted)error.value=message(reason)}finally{if(!c.signal.aborted)searching.value=false}}
function granted(id:string){return users.state.value.kind==='ready'&&users.state.value.data.some(item=>item.id===id)}
async function change(id:string,enabled:boolean){if(busy.value)return;busy.value=true;error.value='';notice.value='';const c=new AbortController();operation=c;try{await props.api.request(`/admin/desktop-settings/users/${encodeURIComponent(id)}`,z.undefined(),{method:'PUT',body:{enabled},signal:c.signal});if(!c.signal.aborted){notice.value=enabled?'已添加高级设置权限。':'已移除高级设置权限。';users.reload()}}catch(reason){if(!c.signal.aborted)error.value=message(reason)}finally{if(!c.signal.aborted)busy.value=false}}
onBeforeUnmount(()=>{controller?.abort();operation?.abort()})
const columns=[{key:'displayName',title:'显示名称'},{key:'email',title:'邮箱'},{key:'actions',title:'操作',className:'col-actions'}]
</script>
<template><Panel title="高级设置授权用户"><div class="stack"><p class="field-hint">添加已有用户后可调整回答模型、生成温度和语音转写服务。新用户默认不开放；移除权限不会删除其自定义配置。</p><ServiceFeedback :error="error" :notice="notice"/><form class="search-form m-surface" @submit.prevent="search"><FormField v-model="query" label="搜索授权用户" placeholder="输入邮箱或显示名称" maxlength="254" required/><Button type="submit" :loading="searching" :disabled="!query.trim()">搜索已有用户</Button></form><section v-if="results" aria-label="用户搜索结果"><p v-if="total>20" class="field-hint">仅显示前20位匹配用户，请缩小搜索范围。</p><p v-if="!results.length">没有匹配的用户，请检查邮箱或显示名称。</p><DataTable v-else :columns="columns" :data="results"><template #cell-actions="{row}"><Button variant="text" :disabled="busy||users.state.value.kind!=='ready'||granted(row.id)" :aria-label="`添加权限 ${row.displayName}`" @click="change(row.id,true)">{{granted(row.id)?'已授权':'添加权限'}}</Button></template></DataTable></section><h4>已授权用户</h4><p v-if="users.state.value.kind==='loading'" role="status">正在加载…</p><template v-else-if="users.state.value.kind==='error'"><p role="alert">{{users.state.value.error}}</p><Button @click="users.reload">重新加载</Button></template><DataTable v-else :columns="columns" :data="users.state.value.data" empty-text="暂未添加授权用户。"><template #cell-email="{row}">{{row.email||'未绑定邮箱'}}</template><template #cell-actions="{row}"><Button variant="text" danger :disabled="busy" :aria-label="`移除权限 ${row.displayName}`" @click="change(row.id,false)">移除权限</Button></template></DataTable></div></Panel></template>

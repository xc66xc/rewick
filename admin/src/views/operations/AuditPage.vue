<script setup lang="ts">
import {onDeactivated,computed,ref} from 'vue'
import type {ApiClient} from '../../api'
import {auditPageSchema,dateTime} from '../../types'
import {useResource} from '../../composables/useResource'
import PageHeader from '../../components/ui/PageHeader.vue'
import Panel from '../../components/ui/Panel.vue'
import Field from '../../components/ui/Field.vue'
import TextInput from '../../components/ui/TextInput.vue'
import Select from '../../components/ui/Select.vue'
import Button from '../../components/ui/Button.vue'
import DataTable from '../../components/ui/DataTable.vue'
import Pagination from '../../components/ui/Pagination.vue'
import Drawer from '../../components/ui/Drawer.vue'
const props=defineProps<{api:ApiClient}>()
const actionNames:Record<string,string>={'user.create':'创建用户','user.update':'更新用户','user.password_reset':'重置用户密码','user.tokens_revoke':'撤销登录凭证','payment.package.save':'保存套餐','payment.package.archive':'归档套餐','payment.config.save':'保存微信支付配置','payment.alipay.config.save':'保存支付宝配置','payment.zpay.config.save':'保存 ZPAY 配置','platform.config.publish':'发布模型与服务配置','platform.config.test.success':'服务连接测试成功','platform.config.test.failed':'服务连接测试失败','email.config.publish':'发布邮件配置','email.config.test':'测试邮件服务','desktop.defaults.update':'更新客户端默认设置','desktop.permission.update':'更新客户端权限','client_download_upload':'上传客户端','client_download_save':'保存客户端下载配置','invitation_settings_update':'更新邀请奖励'}
const page=ref(1),query=ref(''),action=ref(''),actor=ref(''),selectedId=ref<string|null>(null)
const {state,reload}=useResource(props.api,()=>`/admin/audit?page=${page.value}&size=20`,auditPageSchema)
const items=computed(()=>state.value.kind==='ready'?state.value.data.items:[])
const visible=computed(()=>items.value.filter(item=>(!action.value||item.action===action.value)&&(!actor.value||item.actorId===actor.value)&&[item.actorDisplayName,item.actorId,item.action,actionNames[item.action]??'',item.target].some(v=>v.toLowerCase().includes(query.value.trim().toLowerCase()))))
const selected=computed(()=>visible.value.find(v=>v.id===selectedId.value))
const actions=computed(()=>[{value:'',label:'全部操作'},...Array.from(new Set(items.value.map(v=>v.action))).map(value=>({value,label:actionNames[value]??value}))])
const actors=computed(()=>[{value:'',label:'全部操作者'},...Array.from(new Map(items.value.map(v=>[v.actorId,v.actorDisplayName]))).map(([value,name])=>({value,label:`${name} · ${value}`}))])
const columns=[{key:'createdAt',title:'时间',minWidth:180},{key:'action',title:'操作内容',minWidth:210},{key:'actor',title:'操作者',minWidth:140},{key:'target',title:'目标对象',minWidth:150},{key:'actions',title:'操作',className:'col-actions'}]
const facts=computed(()=>{const v=selected.value;return v?[['操作者',v.actorDisplayName],['操作者 ID',v.actorId],['操作时间',dateTime(v.createdAt)],['操作代码',v.action],['目标对象',v.target],['日志 ID',v.id]]:[]})
function reset(){query.value='';action.value='';actor.value='';selectedId.value=null}
onDeactivated(() => { selectedId.value = null })
</script>
<template><div class="page stack"><PageHeader title="操作日志" desc="追溯管理操作与配置变更"><Button icon="refresh" @click="selectedId=null;reload()">刷新日志</Button></PageHeader><div class="search-form m-surface reveal"><Field label="搜索当前页"><TextInput v-model="query" icon="search" placeholder="操作、目标或操作者" @update:model-value="selectedId=null" /></Field><Field label="操作类型"><Select v-model="action" :options="actions" @update:model-value="selectedId=null" /></Field><Field label="操作者"><Select v-model="actor" :options="actors" @update:model-value="selectedId=null" /></Field><div class="search-actions"><Button @click="reset">重置</Button></div></div><p class="business-caption">筛选仅针对当前页 · 当前显示 {{visible.length}} 条</p><p v-if="state.kind==='error'" class="business-error" role="alert">{{state.error}}<Button @click="reload">重试</Button></p><Panel title="操作日志列表" class="reveal"><DataTable :data="visible" :columns="columns" :loading="state.kind==='loading'" :min-width="800" :empty-text="items.length?'当前页没有匹配的操作记录。':'尚无管理操作记录。'"><template #cell-createdAt="{row}"><span class="tnum">{{dateTime(row.createdAt)}}</span></template><template #cell-action="{row}"><Button variant="text" :aria-label="`${actionNames[row.action]??row.action} ${row.action}`" @click="selectedId=row.id">{{actionNames[row.action]??row.action}}</Button><p class="business-code">{{row.action}}</p></template><template #cell-actor="{row}">{{row.actorDisplayName}}<p class="business-caption">ID {{row.actorId}}</p></template><template #cell-target="{row}"><span class="business-code">{{row.target}}</span></template><template #cell-actions="{row}"><Button variant="text" @click="selectedId=row.id">查看详情</Button></template></DataTable><Pagination v-if="state.kind==='ready'" :page="state.data.page" :page-size="state.data.size" :total="state.data.total" :sizes="[20]" @update:page="page=$event;reset()" /></Panel><Drawer :open="!!selected" title="操作详情" origin-from="tr" @close="selectedId=null"><dl class="business-facts"><div v-for="[label,value] in facts" :key="label"><dt>{{label}}</dt><dd>{{value}}</dd></div></dl></Drawer></div></template>

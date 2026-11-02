<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ApiClient } from '../../api'
import { downloadsSchema,type ClientDownload,downloadNames,fileSize } from '../../downloads'
import { dateTime } from '../../types'
import { useResource } from '../../composables/useResource'
import PageHeader from '../../components/ui/PageHeader.vue'
import Panel from '../../components/services-rewick/ServicesPanel.vue'
import Button from '../../components/ui/Button.vue'
import ClientDownloadEditor from '../../components/services-rewick/ClientDownloadEditor.vue'
const props=defineProps<{api:ApiClient}>(),resource=useResource(props.api,'/admin/client-downloads',downloadsSchema)
const items=ref<ClientDownload[]>([]),selectedId=ref(''),editing=ref(false),busy=ref(false),notice=ref('')
const selected=computed(()=>items.value.find(item=>item.id===selectedId.value))
watch(resource.state,state=>{if(state.kind==='ready'){items.value=state.data;selectedId.value=state.data[0]?.id||''}},{immediate:true})
async function copy(item:ClientDownload){try{await navigator.clipboard.writeText(`/downloads/${item.platform}/${item.architecture}`);notice.value='下载路径已复制。'}catch{notice.value='复制失败，请手动复制下载路径。'}}
function saved(value:ClientDownload){items.value=items.value.map(item=>item.id===value.id?value:item)}
</script>
<template><div class="page stack"><PageHeader title="客户端下载" desc="管理各平台的最新安装包"/><p v-if="resource.state.value.kind==='loading'" role="status">正在加载…</p><template v-else-if="resource.state.value.kind==='error'"><p role="alert">{{resource.state.value.error}}</p><Button @click="resource.reload">重新加载</Button></template><div v-else class="form-grid reveal"><Panel v-for="item in items" :key="item.id" :title="downloadNames[item.id]||item.id"><div class="kv-grid"><div class="kv"><div class="kv-label">版本号</div><div class="kv-value">{{item.version||'未填写'}}</div></div><div class="kv"><div class="kv-label">状态</div><div class="kv-value">{{!item.filename?'未上传':item.enabled?'已发布':'未启用'}}</div></div><div class="kv"><div class="kv-label">文件名</div><div class="kv-value">{{item.filename||'尚未上传安装包'}}</div></div><div class="kv"><div class="kv-label">文件大小</div><div class="kv-value">{{fileSize(item.fileSize)}}</div></div></div><div class="page-actions"><Button variant="primary" :disabled="busy" :aria-label="`编辑 ${downloadNames[item.id]||item.id}`" @click="selectedId=item.id;editing=true">{{item.filename?'更新版本 / 配置':'上传安装包'}}</Button><Button :disabled="busy" :aria-label="`查看详情 ${downloadNames[item.id]||item.id}`" @click="selectedId=item.id;editing=false">发布详情</Button><Button v-if="item.filename" :aria-label="`复制下载路径 ${downloadNames[item.id]||item.id}`" @click="copy(item)">复制路径</Button></div></Panel></div><p v-if="notice" role="status">{{notice}}</p><Panel v-if="selected" :title="editing?'编辑客户端发布':'发布信息'" class="reveal"><ClientDownloadEditor v-if="editing" :key="selected.id" :api="api" :initial="selected" @saved="saved" @cancel="editing=false" @busy="busy=$event"/><template v-else><div class="kv-grid"><div class="kv" v-for="[label,value] in [['版本号',selected.version],['架构',selected.architecture],['最低系统版本',selected.minimumOsVersion],['文件名',selected.filename],['SHA-256',selected.sha256],['更新说明',selected.releaseNotes],['更新时间',dateTime(selected.updatedAt)]]" :key="label"><div class="kv-label">{{label}}</div><div class="kv-value">{{value||'未填写'}}</div></div></div><Button @click="editing=true">编辑发布信息</Button></template></Panel><p v-if="!items.length&&resource.state.value.kind==='ready'">暂无客户端发布配置。</p></div></template>

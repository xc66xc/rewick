<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { type ApiClient,message } from '../../api'
import { type ClientDownload,downloadSchema,uploadSchema,downloadNames,fileSize } from '../../downloads'
import Button from '../ui/Button.vue'
import Switch from '../ui/Switch.vue'
import FormField from './FormField.vue'
import ServiceFeedback from './ServiceFeedback.vue'
const props=defineProps<{api:ApiClient;initial:ClientDownload}>(),emit=defineEmits<{saved:[value:ClientDownload];cancel:[];busy:[value:boolean]}>()
const draft=ref({...props.initial}),uploadId=ref<string>(),busy=ref<'upload'|'save'|null>(null),progress=ref(0),error=ref(''),notice=ref('')
let controller:AbortController|undefined
async function upload(event:Event){
 const input=event.target as HTMLInputElement,file=input.files?.[0];input.value=''
 if(!file||busy.value)return
 if(file.size===0||file.size>500*1024*1024){error.value='安装包必须大于 0 字节，且不超过 500 MB。';return}
 const request=new AbortController();controller=request;busy.value='upload';emit('busy',true);progress.value=0;error.value='';notice.value=''
 try{const result=await props.api.upload(`/admin/client-downloads/${draft.value.id}/upload`,file,uploadSchema,value=>progress.value=value,request.signal);if(!request.signal.aborted){uploadId.value=result.uploadId;Object.assign(draft.value,{filename:result.filename,fileSize:result.fileSize,sha256:result.sha256});notice.value='上传完成，点击保存后生效。'}}catch(reason){if(!request.signal.aborted)error.value=message(reason)}finally{if(!request.signal.aborted){busy.value=null;emit('busy',false)}}
}
function cancelUpload(){controller?.abort();busy.value=null;emit('busy',false);notice.value='上传已取消。'}
async function save(){
 if(busy.value)return
 const request=new AbortController();controller=request;busy.value='save';emit('busy',true);error.value='';notice.value=''
 try{const value=await props.api.request(`/admin/client-downloads/${draft.value.id}`,downloadSchema,{method:'PUT',signal:request.signal,body:{version:draft.value.version.trim(),minimumOsVersion:draft.value.minimumOsVersion.trim(),releaseNotes:draft.value.releaseNotes,enabled:draft.value.enabled,...(uploadId.value?{uploadId:uploadId.value}:{})}});if(!request.signal.aborted){draft.value=value;uploadId.value=undefined;emit('saved',value);notice.value='已保存，落地页将使用当前配置。'}}catch(reason){if(!request.signal.aborted)error.value=message(reason)}finally{if(!request.signal.aborted){busy.value=null;emit('busy',false)}}
}
onBeforeUnmount(()=>{controller?.abort();emit('busy',false)})
</script>
<template><form class="stack" :aria-label="downloadNames[draft.id]" @submit.prevent="save"><fieldset class="form-grid" :disabled="busy!==null"><FormField v-model="draft.version" label="版本号" :required="draft.enabled" maxlength="64"/><FormField v-model="draft.minimumOsVersion" label="最低系统版本" :required="draft.enabled" maxlength="100"/><label class="field span-2"><span class="field-label">安装包（最大 500 MB）</span><span class="input-shell"><input type="file" :accept="draft.platform==='macos'?'.dmg':'.exe'" @change="upload"/></span></label><p class="field-hint span-2">{{draft.filename?`${draft.filename} · ${fileSize(draft.fileSize)}`:'尚未上传安装包'}}{{uploadId?' · 待保存':''}}</p><FormField v-model="draft.releaseNotes" class="span-2" label="更新说明" multiline :rows="3" maxlength="4000"/><Switch v-model="draft.enabled" label="启用下载"/></fieldset><p class="field-hint">保存新安装包后删除旧包，仅保留最新版本。</p><div v-if="busy==='upload'" role="status"><progress aria-label="安装包上传进度" :value="progress" max="100"/>{{progress}}%{{progress===100?'，服务器正在校验文件…':''}}<Button @click="cancelUpload">取消上传</Button></div><ServiceFeedback :error="error" :notice="notice"/><div class="page-actions"><Button :disabled="busy==='save'" @click="busy==='upload'?cancelUpload():emit('cancel')">取消编辑</Button><Button variant="primary" type="submit" :disabled="busy!==null">保存</Button></div></form></template>

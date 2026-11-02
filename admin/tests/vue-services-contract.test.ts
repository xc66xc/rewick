import { describe,expect,it,vi } from 'vitest'
import { render,screen,waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import EmailConfigPage from '../src/views/services/EmailConfigPage.vue'
import ConfigPage from '../src/views/services/ConfigPage.vue'
import PaymentChannelEditor from '../src/components/services-rewick/PaymentChannelEditor.vue'
import AdvancedSettingsUsers from '../src/components/services-rewick/AdvancedSettingsUsers.vue'
import ReferencePolicy from '../src/components/services-rewick/ReferencePolicy.vue'
import ClientDownloadEditor from '../src/components/services-rewick/ClientDownloadEditor.vue'
import MockInterviewConfigPage from '../src/views/services/MockInterviewConfigPage.vue'
import { config,data,response } from './fixtures'
const email={version:3,enabled:true,host:'smtp.example.invalid',port:587,username:'mailer@example.invalid',hasPassword:true,from:'noreply@example.invalid',startTls:true,ssl:false}
const download={id:'macos-arm64',platform:'macos',architecture:'arm64',version:'2.3.0',filename:'old.dmg',fileSize:10,sha256:'old',minimumOsVersion:'14.2',releaseNotes:'',enabled:true,updatedAt:'2026-11-03T08:00:00+08:00'}
const policy={maxFiles:20,maxTotalBytes:104857600,maxChunks:10000,childTarget:600,childOverlap:100,parentTarget:1400,bm25K1:1.2,bm25B:.75,vectorMinScore:.55,questionVectorMinScore:0,rrfConstant:60,bm25TimeoutMs:300,maxTermRows:2000000,cacheEnabled:false,cacheWeightBytes:8388608,hybridEnabled:true,version:0}
describe('Vue service migration keeps existing API contracts',()=>{
 it('tests SMTP without saving or emailing, keeps failed draft and requires a fresh password after identity changes',async()=>{
  const calls:{url:string;body:Record<string,unknown>}[]=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{if(options.method==='POST'){calls.push({url,body:data(options)});return response({success:false,message:'连接失败',latencyMs:8})}return response(email)}))
  render(EmailConfigPage,{props:{api:new ApiClient('test')}});const actor=userEvent.setup()
  await actor.click(await screen.findByRole('button',{name:'编辑配置'}));const host=screen.getByLabelText('SMTP 主机')
  await actor.clear(host);await actor.type(host,'new.example.invalid');expect(screen.getByLabelText('SMTP 密码')).toHaveProperty('required',true)
  await actor.click(screen.getByRole('button',{name:'测试连接'}));expect(calls).toHaveLength(0)
  await actor.type(screen.getByLabelText('SMTP 密码'),'fresh-password');await actor.click(screen.getByRole('button',{name:'测试连接'}));await screen.findByRole('alert')
  expect(host).toHaveProperty('value','new.example.invalid');expect(calls[0].url).toBe('/api/v1/admin/email-config/test');expect(calls[0].body).toHaveProperty('config');expect(JSON.stringify(calls[0].body)).not.toContain('hasPassword')
 })
 it('clears SMTP password when cached page becomes inactive and keeps mutually exclusive TLS settings',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response(email)));const view=render(EmailConfigPage,{props:{api:new ApiClient('test'),active:true}});const actor=userEvent.setup()
  await actor.click(await screen.findByRole('button',{name:'编辑配置'}));await actor.type(screen.getByLabelText('SMTP 密码'),'temporary-secret');await actor.click(screen.getByRole('switch',{name:'启用 SSL'}))
  expect(screen.getByRole('switch',{name:'启用 STARTTLS'})).toHaveProperty('checked',false)
  await view.rerender({active:false});expect(screen.getByLabelText('SMTP 密码')).toHaveProperty('value','')
 })
 it('retains SMTP draft and version after conflict',async()=>{
  const writes:unknown[]=[]
  vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{if(options.method==='PUT'){writes.push(data(options));return response({message:'conflict'},409)}return response(email)}))
  render(EmailConfigPage,{props:{api:new ApiClient('test')}});const actor=userEvent.setup();await actor.click(await screen.findByRole('button',{name:'编辑配置'}));await actor.click(screen.getByRole('button',{name:'保存邮件配置'}));await screen.findByText(/配置已被其他管理员修改/)
  expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({version:3,host:email.host})
 })
 it('saves a model through the exact existing config PUT rather than cloning a Vue proxy',async()=>{
  const writes:Record<string,unknown>[]=[]
  vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{if(options.method==='PUT'){writes.push(data(options));return response({...data(options),version:2})}return response(config)}))
  render(ConfigPage,{props:{api:new ApiClient('test')}});const actor=userEvent.setup();await actor.click(await screen.findByRole('button',{name:'编辑配置'}));const token=screen.getByLabelText('最大输出 Token');await actor.clear(token);await actor.type(token,'2048');await actor.click(screen.getByRole('button',{name:'保存'}))
  await waitFor(()=>expect(writes).toHaveLength(1));expect(writes[0]).toHaveProperty('version',1);expect((writes[0].models as Record<string,unknown>[])[0]).toMatchObject({maxOutputTokens:2048})
 })
 it('keeps all WeChat configuration fields and empty secret placeholders on the original endpoint',async()=>{
  let body:Record<string,unknown>|undefined,path=''
  const payment={version:2,enabled:false,configured:true,mchId:'merchant',appId:'app',merchantSerial:'serial',wechatPublicKeyId:'key-id',notifyUrl:'https://example.invalid/notify',hasMerchantPrivateKey:true,hasApiV3Key:true,hasWechatPublicKey:true}
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{path=url;body=data(options);return response({...payment,version:3})}))
  render(PaymentChannelEditor,{props:{api:new ApiClient('test'),channel:'wechat',config:payment}});await userEvent.setup().click(screen.getByRole('button',{name:'保存支付设置'}));await waitFor(()=>expect(body).toBeTruthy())
  expect(path).toBe('/api/v1/admin/payment-config');expect(body).toEqual({version:2,enabled:false,mchId:'merchant',appId:'app',merchantSerial:'serial',wechatPublicKeyId:'key-id',notifyUrl:'https://example.invalid/notify',merchantPrivateKey:'',apiV3Key:'',wechatPublicKey:''})
 })
 it('preserves ZPAY body and clears the one-time secret after successful save',async()=>{
  const payment={version:2,enabled:false,configured:true,pid:'merchant',paymentType:'alipay' as const,gatewayUrl:'https://example.invalid/mapi.php',queryUrl:'https://example.invalid/api.php',notifyUrl:'https://example.invalid/notify',returnUrl:'https://example.invalid/result',cid:'',hasMerchantKey:true}
  let path='',body:Record<string,unknown>|undefined
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{path=url;body=data(options);return response({...payment,version:3})}))
  render(PaymentChannelEditor,{props:{api:new ApiClient('test'),channel:'zpay',config:payment}});const actor=userEvent.setup();await actor.type(screen.getByLabelText('ZPAY 商户密钥'),'one-time-secret');await actor.click(screen.getByRole('button',{name:'保存 ZPAY 设置'}));await waitFor(()=>expect(body).toBeTruthy());expect(path).toBe('/api/v1/admin/payment-config/zpay');expect(body).toMatchObject({version:2,merchantKey:'one-time-secret',paymentType:'alipay'});await waitFor(()=>expect(screen.getByLabelText('ZPAY 商户密钥')).toHaveProperty('value',''))
 })
 it('keeps reference capacity conversion and empty response PUT contract',async()=>{
  let body:Record<string,unknown>|undefined
  vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{if(options.method==='PUT'){body=data(options);return new Response(null,{status:204})}return response(policy)}))
  render(ReferencePolicy,{props:{api:new ApiClient('test')}});const actor=userEvent.setup(),capacity=await screen.findByLabelText('每用户资料总容量（MB）');await actor.clear(capacity);await actor.type(capacity,'25');await actor.click(screen.getByRole('button',{name:'保存资料策略'}));await waitFor(()=>expect(body?.maxTotalBytes).toBe(25*1048576));expect(body).toHaveProperty('questionVectorMinScore',0)
 })
 it('uploads without publishing and reuses the upload ID after a save failure',async()=>{
  const bodies:Record<string,unknown>[]=[];vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{bodies.push(data(options));return bodies.length===1?response({message:'保存失败'},500):response({...download,filename:'new.dmg'})}))
  const api=new ApiClient('test');vi.spyOn(api,'upload').mockResolvedValue({uploadId:'upload-fixture',filename:'new.dmg',fileSize:20,sha256:'new-hash'})
  render(ClientDownloadEditor,{props:{api,initial:download}});const actor=userEvent.setup();await actor.upload(screen.getByLabelText('安装包（最大 500 MB）'),new File(['package'],'new.dmg'));await screen.findByText('上传完成，点击保存后生效。');expect(bodies).toHaveLength(0);await actor.click(screen.getByRole('button',{name:'保存'}));await screen.findByRole('alert');await actor.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('已保存，落地页将使用当前配置。');expect(bodies.map(value=>value.uploadId)).toEqual(['upload-fixture','upload-fixture'])
 })
 it('keeps independent mock settings payload and a typed TTS test body',async()=>{
  const settings={version:1,enabled:false,allowedUserIds:[2],llmModelId:'model-1',reportModelId:'model-1',asrServiceId:'asr-1',tts:{endpoint:'wss://tts.example.invalid/ws',model:'cosyvoice-v3-flash',hasApiKey:true,voiceId:'voice',sampleRate:24000},maxConcurrent:2,maxFollowUps:1,pauseMs:1800,maxTtsCharacters:4000,maxOutputTokens:512,dailySessionLimit:5}
  const calls:{url:string;body:Record<string,unknown>}[]=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{if(options.method==='POST'){calls.push({url,body:data(options)});return response({success:true,message:'测试成功',latencyMs:2})}return response(url.endsWith('/admin/config')?config:settings)}))
  render(MockInterviewConfigPage,{props:{api:new ApiClient('test')}});const actor=userEvent.setup();await actor.click(await screen.findByRole('button',{name:'测试 TTS 连接'}));await waitFor(()=>expect(calls).toHaveLength(1));expect(calls[0].url).toBe('/api/v1/admin/mock-interviews/settings/test');expect(calls[0].body).toHaveProperty('reportModelId','model-1');expect(calls[0].body).not.toHaveProperty('config');expect(JSON.stringify(calls[0].body)).not.toContain('hasApiKey')
 })
 it('retains authorized users when revoke fails and preserves the existing grant endpoint',async()=>{
  const writes:{url:string;body:Record<string,unknown>}[]=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{if(options.method==='PUT'){writes.push({url,body:data(options)});return response({message:'移除失败'},500)}return response([{id:'2',displayName:'candidate',email:null}])}))
  render(AdvancedSettingsUsers,{props:{api:new ApiClient('test')}});const actor=userEvent.setup();await actor.click(await screen.findByRole('button',{name:'移除权限 candidate'}));await screen.findByRole('alert');expect(screen.getByText('candidate')).toBeTruthy();expect(writes).toEqual([{url:'/api/v1/admin/desktop-settings/users/2',body:{enabled:false}}])
 })
 it('aborts a pending upload on unmount without publishing the package',async()=>{
  const api=new ApiClient('test');let signal:AbortSignal|undefined
  vi.spyOn(api,'upload').mockImplementation((_path,_file,_schema,_progress,value)=>{signal=value;return new Promise(()=>{})});const request=vi.spyOn(api,'request');const view=render(ClientDownloadEditor,{props:{api,initial:download}})
  await userEvent.setup().upload(screen.getByLabelText('安装包（最大 500 MB）'),new File(['package'],'pending.dmg'));expect(signal?.aborted).toBe(false);view.unmount();expect(signal?.aborted).toBe(true);expect(request).not.toHaveBeenCalled()
 })
 it('blocks invalid enabled TTS settings before any supplier call',async()=>{
  const settings={version:1,enabled:true,allowedUserIds:[],llmModelId:'model-1',reportModelId:'model-1',asrServiceId:'asr-1',tts:{endpoint:'https://tts.example.invalid/speech',model:'cosyvoice-v3-flash',hasApiKey:false,voiceId:'voice',sampleRate:24000},maxConcurrent:2,maxFollowUps:1,pauseMs:1800,maxTtsCharacters:4000,maxOutputTokens:512,dailySessionLimit:5}
  const fetcher=vi.fn(async(url:string)=>response(url.endsWith('/admin/config')?{...config,providers:[...config.providers,{id:'asr-1',name:'ASR',kind:'asr',enabled:true,url:'wss://asr.example.invalid/ws',hasApiKey:true}]}:settings));vi.stubGlobal('fetch',fetcher)
  render(MockInterviewConfigPage,{props:{api:new ApiClient('test')}});await userEvent.setup().click(await screen.findByRole('button',{name:'测试 TTS 连接'}));expect(screen.getByLabelText('TTS API Key')).toHaveProperty('required',true);expect(fetcher).toHaveBeenCalledTimes(2)
 })
 it('keeps the mock draft after a conflict and prevents further writes until reload',async()=>{
  const settings={version:1,enabled:false,allowedUserIds:[],llmModelId:'model-1',reportModelId:'model-1',asrServiceId:'',tts:{endpoint:'https://tts.example.invalid/speech',model:'cosyvoice-v3-flash',hasApiKey:true,voiceId:'voice',sampleRate:24000},maxConcurrent:2,maxFollowUps:1,pauseMs:1800,maxTtsCharacters:4000,maxOutputTokens:512,dailySessionLimit:5};const writes:unknown[]=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{if(options.method==='PUT'){writes.push(data(options));return response({message:'conflict'},409)}return response(url.endsWith('/admin/config')?config:settings)}));render(MockInterviewConfigPage,{props:{api:new ApiClient('test')}});const actor=userEvent.setup();await actor.click(await screen.findByRole('button',{name:'保存模拟配置'}));await screen.findByText(/配置已被其他管理员修改/);expect(screen.getByRole('button',{name:'测试 TTS 连接'})).toHaveProperty('disabled',true);expect(screen.getByRole('button',{name:'保存模拟配置'})).toHaveProperty('disabled',true);expect(writes).toHaveLength(1)
 })

})

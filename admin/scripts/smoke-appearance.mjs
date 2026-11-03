import { chromium, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { user, config } from '../tests/fixtures.ts'
import { overview, performance, health, traces, trace, settings } from '../tests/operations-fixtures.ts'
const output = resolve(process.env.ADMIN_APPEARANCE_OUTPUT || 'test-results/appearance')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' })
const page = await context.newPage(), errors = [], calls = [], frames = {}, screenshots = [], visited = [], unhandled = []
const users = Array.from({ length: 8 }, (_, i) => ({ ...user, id: String(i + 2), displayName: ['林知远', '陈雨晴', '许景然', '周予安', '孟嘉宁', '苏亦辰', '方明熙', '沈书言'][i], enabled: i !== 5, availableSeconds: 1823 + i * 1317, createdAt: `2026-11-0${i % 3 + 1}T10:20:00+08:00` }))
let email = { version: 3, enabled: true, host: 'smtp.example.invalid', port: 587, username: 'mailer@example.invalid', hasPassword: true, from: 'noreply@example.invalid', startTls: true, ssl: false }
const policy = { maxFiles:20,maxTotalBytes:104857600,maxChunks:10000,childTarget:600,childOverlap:100,parentTarget:1400,bm25K1:1.2,bm25B:.75,vectorMinScore:.55,questionVectorMinScore:0,rrfConstant:60,bm25TimeoutMs:300,maxTermRows:2000000,cacheEnabled:false,cacheWeightBytes:8388608,hybridEnabled:true,version:0 }
const mock = { version:1,enabled:false,allowedUserIds:[],llmModelId:'model-1',reportModelId:'model-1',asrServiceId:'',tts:{endpoint:'wss://tts.example.invalid/ws',model:'cosyvoice-v3-flash',hasApiKey:true,voiceId:'voice',sampleRate:24000},maxConcurrent:2,maxFollowUps:1,pauseMs:1800,maxTtsCharacters:4000,maxOutputTokens:512,dailySessionLimit:5 }
const payment = { version:1,enabled:false,configured:false,mchId:'',appId:'',merchantSerial:'',wechatPublicKeyId:'',notifyUrl:'',hasMerchantPrivateKey:false,hasApiV3Key:false,hasWechatPublicKey:false }
const alipay = { version:1,enabled:false,configured:false,appId:'',sellerId:'',gatewayUrl:'https://openapi.alipay.com/gateway.do',notifyUrl:'',returnUrl:'',hasAppPrivateKey:false,hasAlipayPublicKey:false }
const zpay = { version:1,enabled:false,configured:false,pid:'',paymentType:'alipay',gatewayUrl:'https://example.invalid/mapi.php',queryUrl:'https://example.invalid/api.php',notifyUrl:'',returnUrl:'',cid:'',hasMerchantKey:false }
const packages = [{ id:1,version:1,name:'标准练习',description:'适合日常面试练习与问题准备',durationSeconds:3600,originalPriceCents:1000,discountBps:8000,priceCents:800,sortOrder:0,enabled:true }]
const empty = { items:[], total:0, page:1, size:20 }
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
await page.route('**/api/v1/**', async route => {
 const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1',''), method = request.method()
 calls.push({ path, method, body: request.postData() ? JSON.parse(request.postData()) : null })
 let payload
 if (path === '/auth/login') payload = {accessToken:'synthetic-preview-only',expiresAt:'2099-01-01T00:00:00Z',user:{id:'1',displayName:'预览管理员'}}
 else if (path === '/admin/me') payload = {id:'1',displayName:'预览管理员',role:'ADMIN'}
 else if (path === '/admin/users') payload = {...empty,items:users,total:users.length}
 else if (/^\/admin\/users\/\d+\/mock-wallet$/.test(path)) payload = {availableSeconds:3600,version:1}
 else if (path === '/admin/config') payload = config
 else if (path === '/admin/reference-policy') payload = policy
 else if (path === '/admin/desktop-settings') payload = {version:1,llmModelId:'model-1',temperature:.7,asrServiceId:''}
 else if (path === '/admin/desktop-settings/users') payload = []
 else if (path === '/admin/packages') payload = packages
 else if (path === '/admin/payment-orders') payload = []
 else if (path === '/admin/invitation-settings') payload = {enabled:true,rewardSeconds:1800,version:1}
 else if (path === '/admin/invitations' || path === '/admin/audit' || path === '/admin/usage') payload = empty
 else if (path === '/admin/email-config') { if (method === 'PUT') email = {...JSON.parse(request.postData()),hasPassword:true,version:email.version+1}; payload = email }
 else if (path === '/admin/payment-config') payload = payment
 else if (path === '/admin/payment-config/alipay') payload = alipay
 else if (path === '/admin/payment-config/zpay') payload = zpay
 else if (path === '/admin/mock-interviews/settings') payload = mock
 else if (path === '/admin/client-downloads') payload = ['macos-arm64','macos-x64','windows-x64'].map(id => ({id,platform:id.startsWith('macos')?'macos':'windows',architecture:id.split('-')[1],version:'',filename:'',fileSize:0,sha256:'',minimumOsVersion:'',releaseNotes:'',enabled:false,updatedAt:'2026-11-03T00:00:00Z'}))
 else if (path === '/admin/operations/overview') payload = overview
 else if (path === '/admin/operations/performance') payload = performance
 else if (path === '/admin/operations/health') payload = health
 else if (path === '/admin/operations/traces') payload = traces
 else if (path.startsWith('/admin/operations/traces/')) payload = trace
 else if (path === '/admin/operations/settings') payload = settings
 else { unhandled.push({path,method}); await route.fulfill({status:500,json:{message:'Unmocked synthetic API'}}); return }
 await route.fulfill({json:payload})
})
async function screenshot(name) { await page.screenshot({path:resolve(output,name)}); screenshots.push(name) }
async function sample(selector, count=36) {
 return page.evaluate(async ({selector,count}) => { const samples=[]; for(let i=0;i<count;i++){await new Promise(requestAnimationFrame);const el=document.querySelector(selector);samples.push(el?{opacity:Number(getComputedStyle(el).opacity),transform:getComputedStyle(el).transform,x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y}:null)}return samples },{selector,count})
}
function moving(samples, property='transform') { return new Set(samples.filter(Boolean).map(value=>value[property])).size>2 }
async function navigate(name) { await page.getByRole('navigation',{name:'管理导航',exact:true}).getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{name,level:1,exact:true}).waitFor();await page.waitForTimeout(750);visited.push(name);if(await page.getByText('服务响应格式不兼容，请联系管理员。',{exact:true}).count())throw Error(`Schema failure on ${name}`) }
try {
 await page.goto(process.env.ADMIN_PREVIEW_URL || 'http://127.0.0.1:5189')
 await page.getByRole('heading',{name:'登录管理后台',exact:true}).waitFor();await page.waitForTimeout(2600);if(Number(await page.locator('.login-card').evaluate(el=>getComputedStyle(el).opacity))<.99)throw Error('Login form became transparent after entrance');await screenshot('login.png')
 await page.getByRole('textbox',{name:'管理员账号',exact:true}).fill('preview-admin');await page.getByLabel(/^登录密码/).fill('synthetic-only');await page.getByRole('button',{name:'登录管理后台',exact:true}).click()
 await page.getByRole('heading',{name:'用户管理',level:1,exact:true}).waitFor();await page.getByText('沈书言',{exact:true}).waitFor();await page.waitForTimeout(1000);await screenshot('users-light.png')
 // Reference nav-thumb is a moving shared element, not a CSS-only active row.
 await page.getByRole('navigation',{name:'管理导航'}).getByRole('button',{name:'套餐管理',exact:true}).click();frames.navigation=await sample('.nav-thumb');if(!moving(frames.navigation))throw Error('Navigation thumb has no intermediate frames')
 await navigate('用户管理')
 const rowHeight=()=>page.locator('tbody tr.data-row').first().evaluate(el=>el.getBoundingClientRect().height), sizes=[['regular',await rowHeight()]]
 await page.getByLabel('邮箱或显示名称',{exact:true}).fill('保留的搜索草稿');await page.getByRole('button',{name:'搜索',exact:true}).click();frames.rows=await sample('tbody tr.data-row',36);if(!moving(frames.rows))throw Error('DataTable row entrance has no intermediate transform');const before=calls.length
 await page.getByRole('button',{name:'外观设置',exact:true}).click();frames.modalEnter=await sample('.modal',32);if(!moving(frames.modalEnter))throw Error('Modal enter lacks intermediate reference transform')
 await page.getByRole('radio',{name:'深色',exact:true}).click();frames.segmented=await sample('[aria-label="主题"] .seg-thumb');if(!moving(frames.segmented))throw Error('Segmented thumb does not animate')
 await page.getByRole('radio',{name:'紧凑',exact:true}).click();await screenshot('appearance-dark.png');await page.getByRole('button',{name:'完成',exact:true}).click();frames.modalLeave=await sample('.modal',20)
 if(!frames.modalLeave.some(value=>value&&value.opacity<1)||frames.modalLeave.at(-1)!==null)throw Error('Modal exit does not animate then remove')
 await expect(page.getByLabel('邮箱或显示名称',{exact:true})).toHaveValue('保留的搜索草稿');if(calls.length!==before)throw Error('Appearance controls request business data');sizes.push(['compact',await rowHeight()])
 await page.getByRole('button',{name:'外观设置',exact:true}).click();await page.getByRole('radio',{name:'宽松',exact:true}).click();await page.getByRole('button',{name:'完成',exact:true}).click();await page.waitForTimeout(300);sizes.push(['comfy',await rowHeight()]);if(!(sizes[1][1]<sizes[0][1]&&sizes[0][1]<sizes[2][1]))throw Error('Density fails to change real row height '+JSON.stringify(sizes))
 await page.getByRole('button',{name:'创建用户',exact:true}).click();await page.getByRole('dialog',{name:'创建用户',exact:true}).waitFor();await screenshot('create-user-dark.png');await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'创建用户',exact:true})).toBeFocused()
 for(const name of ['套餐管理','支付订单','邀请奖励','模型与服务','支付设置','邮件服务','模拟面试','客户端下载','调用记录','操作日志']){await navigate(name);await screenshot(name+'.png')}
 // Cached page edit state survives navigation; this write remains inside the synthetic route.
 await navigate('邮件服务');await page.getByRole('button',{name:'编辑配置',exact:true}).click();await page.getByLabel('SMTP 主机',{exact:true}).fill('draft.example.invalid');await page.getByLabel('SMTP 密码',{exact:true}).fill('temporary-secret')
 await navigate('用户管理');await navigate('邮件服务');await expect(page.getByLabel('SMTP 主机',{exact:true})).toHaveValue('draft.example.invalid');await expect(page.getByLabel('SMTP 密码',{exact:true})).toHaveValue('')
 await page.getByLabel('SMTP 密码',{exact:true}).fill('synthetic-new-key');await page.getByRole('button',{name:'保存邮件配置',exact:true}).click();await expect(page.getByText(/邮件配置版本 .*已保存/)).toBeVisible()
 const writes=calls.filter(call=>call.method==='PUT');if(writes.length!==1||writes[0].path!=='/admin/email-config'||writes[0].body.host!=='draft.example.invalid')throw Error('Unexpected save body or mutation')
 await page.getByRole('navigation',{name:'管理导航'}).getByRole('button',{name:'运营观测',exact:true}).click();await page.getByRole('heading',{name:'运营观测',level:1,exact:true}).waitFor();frames.odometer=await sample('.odo-strip',45);if(!moving(frames.odometer))throw Error('Odometer digits show no computed intermediate frame');visited.push('运营观测');await page.getByRole('region',{name:'业务概览',exact:true}).waitFor();await screenshot('operations-dark.png')
 await page.getByRole('radio',{name:'性能',exact:true}).click();frames.operationalTab=await sample('[aria-label="观测页签"] .seg-thumb');if(!moving(frames.operationalTab))throw Error('Operations Segmented does not animate');await screenshot('performance-dark.png')
 // A rapid sequence must settle at its final navigation target, without ghost pages.
 await page.getByRole('navigation',{name:'管理导航'}).evaluate(nav=>{for(const text of ['套餐管理','模型与服务','用户管理'])nav.querySelector(`[aria-label="${text}"]`).click()})
 await page.getByRole('heading',{name:'用户管理',level:1,exact:true}).waitFor();await page.waitForTimeout(1000);await expect(page.locator('main h1')).toHaveCount(1)
 await page.getByRole('button',{name:'外观设置',exact:true}).click()
 frames.hiddenFinish=await page.evaluate(async()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));await new Promise(requestAnimationFrame);const el=document.querySelector('.modal'),result={opacity:el?Number(getComputedStyle(el).opacity):null,transform:el?getComputedStyle(el).transform:null};delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));return result})
 if(frames.hiddenFinish.opacity!==1)throw Error('Hidden-page transition left the modal translucent');await page.getByRole('button',{name:'完成',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await page.getByRole('button',{name:'外观设置',exact:true}).click();await page.getByRole('radio',{name:'跟随系统',exact:true}).click();await page.getByRole('button',{name:'完成',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-motion','reduced');await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
 await navigate('模型与服务');await expect(page.locator('main')).toBeVisible();const hiddenNodes=await page.locator('main .reveal').evaluateAll(nodes=>nodes.filter(node=>getComputedStyle(node).opacity==='0').length);if(hiddenNodes)throw Error('Reduced motion leaves hidden content')
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile document overflow')
 await page.getByRole('button',{name:'切换导航',exact:true}).click();await expect(page.getByRole('navigation',{name:'管理导航'}).getByRole('button',{name:'用户管理',exact:true})).toBeVisible();await screenshot('mobile-navigation.png');await page.keyboard.press('Shift+Tab');if(!await page.evaluate(()=>document.querySelector('.rail').contains(document.activeElement)))throw Error('Mobile navigation escaped focus trap');await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'切换导航',exact:true})).toBeFocused();await page.getByRole('button',{name:'切换导航',exact:true}).click();await page.getByRole('navigation',{name:'管理导航'}).getByRole('button',{name:'用户管理',exact:true}).click();await page.getByRole('heading',{name:'用户管理',level:1,exact:true}).waitFor();await screenshot('mobile-users.png')
 await page.reload();await page.getByRole('heading',{name:'用户管理',level:1,exact:true}).waitFor();await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
 if(errors.length||unhandled.length)throw Error(JSON.stringify({errors,unhandled}))
 const report={passed:true,data:'isolated synthetic APIs; no production or supplier calls',visited:[...new Set(['用户管理',...visited])],screenshots,sizes,frames,noExtraAppearanceRequests:true,mutations:writes,errors,unhandled,limits:'Hidden page polling and reduced state verified in Vue lifecycle tests; native GSAP visual frames sampled here. Not a pixel-diff assertion against reference.'}
 await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,pages:report.visited.length,screenshots:screenshots.length,sizes}))
} catch(error){await screenshot('failure.png');await writeFile(resolve(output,'failure.json'),JSON.stringify({error:String(error),errors,unhandled,calls,frames},null,2));throw error} finally{await browser.close()}

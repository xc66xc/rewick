import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, ref, type Component } from 'vue'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import UsagePage from '../src/views/operations/UsagePage.vue'
import AuditPage from '../src/views/operations/AuditPage.vue'
import OperationsPage from '../src/views/operations/OperationsPage.vue'
import Modal from '../src/components/ui/Modal.vue'
import { overview, settings } from './operations-fixtures'
import { page, response } from './fixtures'

const usage = { id:'call-1',userId:'7',displayName:'合成用户',requestId:'request-1',capability:'llm',model:'synthetic-model',status:'complete',createdAt:'2026-11-03T00:00:00Z',finishedAt:'2026-11-03T00:00:01Z' }
const audit = { id:'audit-1',actorId:'1',actorDisplayName:'合成管理员',action:'user.create',target:'user:7',createdAt:'2026-11-03T00:00:00Z' }
const TargetPage = defineComponent({ setup() { const open = ref(false); return () => h('section', [h('h2','新页面'),h('button',{onClick:()=>{open.value=true}},'打开新页面弹窗'),h(Modal,{open:open.value,title:'新页面弹窗',onClose:()=>{open.value=false}},{default:()=>h('input',{'aria-label':'新页面输入'})})]) } })
function consumer(original: Component) {
  return defineComponent({ setup() { const target = ref(false), api = new ApiClient('synthetic'); return () => h('div', [h('button',{onClick:()=>{target.value=true}},'切换到新页面'),h('button',{onClick:()=>{target.value=false}},'返回原页面'),h(KeepAlive,null,{default:()=>h(target.value?TargetPage:original,{api,key:target.value?'target':'original',active:true})})]) } })
}
function mockApi() {
  // jsdom has no viewport hit testing; real drawer morphing is tested in Chromium.
  Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>null})
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>response(url.includes('/admin/usage?')?page([usage]):url.includes('/admin/audit?')?page([audit]):url.endsWith('/settings')?settings:overview)))
}
describe('cached Vue business page overlay lifecycle',()=>{
  for(const scenario of [{name:'Usage details drawer',component:UsagePage,trigger:'查看详情',dialog:'请求详情'},{name:'Audit details drawer',component:AuditPage,trigger:'查看详情',dialog:'操作详情'},{name:'Operations collection settings',component:OperationsPage,trigger:'观测设置',dialog:'运营观测设置'}]) {
    it(`dismisses ${scenario.name} on actual KeepAlive deactivation without reopening or trapping the next page`,async()=>{
      mockApi();render(consumer(scenario.component));const actor=userEvent.setup()
      await actor.click(await screen.findByRole('button',{name:scenario.trigger}));await screen.findByRole('dialog',{name:scenario.dialog})
      await actor.click(screen.getByRole('button',{name:'切换到新页面'}));await screen.findByRole('heading',{name:'新页面'})
      await waitFor(()=>expect(screen.queryByRole('dialog',{name:scenario.dialog})).toBeNull())
      await actor.click(screen.getByRole('button',{name:'打开新页面弹窗'}));await screen.findByRole('dialog',{name:'新页面弹窗'})
      await actor.keyboard('{Escape}');await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
      await actor.click(screen.getByRole('button',{name:'返回原页面'}));await screen.findByRole('button',{name:scenario.trigger})
      expect(screen.queryByRole('dialog',{name:scenario.dialog})).toBeNull()
      await actor.click(screen.getByRole('button',{name:scenario.trigger}));await screen.findByRole('dialog',{name:scenario.dialog})
      await actor.keyboard('{Escape}');await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
    })
  }
  it('closes a cached page Select popup, removes stale options and preserves Escape on the next page',async()=>{
    mockApi();render(consumer(UsagePage));const actor=userEvent.setup()
    await actor.click(await screen.findByRole('combobox',{name:'服务能力'}));await screen.findByRole('listbox')
    await actor.click(screen.getByRole('button',{name:'切换到新页面'}));await screen.findByRole('heading',{name:'新页面'})
    await waitFor(()=>expect(screen.queryByRole('listbox')).toBeNull())
    await actor.click(screen.getByRole('button',{name:'打开新页面弹窗'}));await screen.findByRole('dialog',{name:'新页面弹窗'});await actor.keyboard('{Escape}');await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
    await actor.click(screen.getByRole('button',{name:'返回原页面'}));expect(screen.queryByRole('listbox')).toBeNull()
    await actor.click(screen.getByRole('combobox',{name:'服务能力'}));await screen.findByRole('listbox');await actor.keyboard('{Escape}');await waitFor(()=>expect(screen.queryByRole('listbox')).toBeNull())
  })
})

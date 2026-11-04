import { describe,expect,it,vi } from 'vitest'
import { render,screen,waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { ApiClient } from '../src/api'
import ScreenshotModelPolicy from '../src/components/services-rewick/ScreenshotModelPolicy.vue'
import { config,data,response } from './fixtures'

describe('Screenshot recognition model configuration',()=>{
 it('selects a separate vision model and saves through versioned config without exposing keys',async()=>{
  const writes:Record<string,unknown>[]=[]
  vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{writes.push(data(options));return response({...data(options),version:2})}))
  const view=render(ScreenshotModelPolicy,{props:{api:new ApiClient('test'),config}}),actor=userEvent.setup()
  await actor.click(screen.getByRole('combobox',{name:'截图识别模型'}));await actor.click(await screen.findByRole('option',{name:'快速模型'}))
  await actor.click(screen.getByRole('button',{name:'保存截图识别配置'}))
  await waitFor(()=>expect(view.emitted().saved).toHaveLength(1))
  expect(writes[0]).toMatchObject({version:1,screenshotModelId:'model-1',defaultModelId:'model-1'})
  expect(JSON.stringify(writes[0])).not.toContain('hasApiKey')
 })
 it('tests an image instead of text and retains the draft on unsupported models',async()=>{
  const calls:Record<string,unknown>[]=[]
  vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{calls.push(data(options));return response({success:false,message:'模型不支持图片',latencyMs:3})}))
  render(ScreenshotModelPolicy,{props:{api:new ApiClient('test'),config:{...config,screenshotModelId:'model-1'}}});const actor=userEvent.setup()
  await actor.click(screen.getByRole('button',{name:'测试图片识别'}));await screen.findByText('模型不支持图片')
  expect(calls[0]).toMatchObject({capability:'screenshot',config:{screenshotModelId:'model-1',version:1}})
  expect(screen.getByRole('combobox',{name:'截图识别模型'}).textContent).toContain('快速模型')
 })
})

import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { chromium, expect } from '@playwright/test'

// Actual AnswerPanel, hooks and styles with isolated synthetic props, no Electron
// account, audio, API or model provider. Wheel input verifies native scroll limits.
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const output = join(root, 'test-results/compact-scroll')
await mkdir(output, { recursive: true })
const server = await createServer({ configFile: false, root, plugins: [react(), tailwindcss()], resolve: { alias: { '@': join(root,'src/renderer/src') } }, optimizeDeps: { entries: ['tests/e2e/compact-scroll.html'] }, server: { host:'127.0.0.1', port:0 } })
await server.listen()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport:{width:480,height:640} }), errors = [], checks = []
page.on('pageerror', error => errors.push(error.message))
const base = `http://127.0.0.1:${server.httpServer.address().port}`
const answer = (id, text) => ({ id, question:`合成问题 ${id}`, text, status:'complete', createdAt:'2026-11-03T10:00:00+08:00' })
const longText = Array.from({length:18},(_,i)=>`第${i+1}段合成内容。先明确约束，再结合实际请求验证方案，记录失败边界和后续处理。`).join('\n\n')
const viewport = page.getByRole('region',{name:'回答与面试信息',exact:true})
async function scenario(value) { await page.evaluate(value=>window.compactScrollFixture.set(value),value); await page.waitForTimeout(80) }
async function wheel(delta) { const r=await viewport.boundingBox();assert.ok(r);await page.mouse.move(r.x+r.width*.45,r.y+r.height*.6);await page.mouse.wheel(0,delta);await page.waitForTimeout(160) }
async function lastQuestionAtTop(label) {
  const composer=await page.getByRole('textbox',{name:'当前问题',exact:true}).boundingBox()
  await wheel(100000)
  const offset=()=>viewport.evaluate(el=>{const q=el.querySelectorAll('.compact-answer__question');return q[q.length-1].getBoundingClientRect().top-el.getBoundingClientRect().top})
  // A long debug footer can already extend beyond the viewport: scroll back to
  // the question using the wheel rather than requiring more artificial blank space.
  const initial=await offset();if(initial< -2)await wheel(initial)
  await expect.poll(async()=>Math.abs(await offset())).toBeLessThanOrEqual(2)
  const after=await page.getByRole('textbox',{name:'当前问题',exact:true}).boundingBox()
  assert.ok(composer&&after&&Math.abs(composer.y-after.y)<1,'composer stays fixed')
  checks.push({label,offset:await offset(),scrollTop:await viewport.evaluate(el=>el.scrollTop)})
}
try {
  await page.goto(`${base}/tests/e2e/compact-scroll.html`)
  await page.waitForFunction(()=>Boolean(window.compactScrollFixture))
  const old=answer('old',longText), recent=answer('recent','新回答。')
  await scenario({answers:[answer('short','简短回答。')]})
  await lastQuestionAtTop('single short answer')
  await scenario({answers:[old,recent]})
  await lastQuestionAtTop('multiple answers')
  await page.screenshot({path:join(output,'last-question-at-top.png')})
  for(const [width,height,fontSize] of [[360,520,28],[700,900,10],[480,640,19]]){
    await page.setViewportSize({width,height});await scenario({answers:[old,recent],fontSize});await lastQuestionAtTop(`resize ${width}x${height} font ${fontSize}`)
  }
  await page.locator('main').evaluate(el=>el.style.setProperty('--compact-font-size','26px'))
  await page.waitForTimeout(100)
  await lastQuestionAtTop('font change without React render')
  await page.setViewportSize({width:530,height:780})
  await page.waitForTimeout(100)
  await lastQuestionAtTop('resize without React render')
  await page.getByRole('button',{name:'查看最新回答',exact:true}).click()
  await expect.poll(()=>viewport.evaluate(el=>el.scrollTop)).toBe(0)
  await wheel(250)
  const anchor=await viewport.evaluate(el=>{const top=el.getBoundingClientRect().top;const turn=[...el.querySelectorAll('[data-answer-id]')].find(n=>n.getBoundingClientRect().bottom>top);return{id:turn.dataset.answerId,offset:turn.getBoundingClientRect().top-top}})
  await scenario({answers:[old,recent,answer('prepended','新插入的流式回答。'.repeat(12))]})
  const moved=await viewport.evaluate((el,anchor)=>el.querySelector(`[data-answer-id="${anchor.id}"]`).getBoundingClientRect().top-el.getBoundingClientRect().top-anchor.offset,anchor)
  assert.ok(Math.abs(moved)<2,`prepend preserves old reading anchor: ${moved}`)
  checks.push({label:'prepend reading anchor',movement:moved})
  const streamAnchor=await viewport.evaluate(el=>{const top=el.getBoundingClientRect().top;const turn=[...el.querySelectorAll('[data-answer-id]')].find(n=>n.getBoundingClientRect().bottom>top);return{id:turn.dataset.answerId,offset:turn.getBoundingClientRect().top-top}})
  await scenario({answers:[old,recent,{...answer('prepended',longText),status:'streaming'}]})
  const streamMovement=await viewport.evaluate((el,anchor)=>el.querySelector(`[data-answer-id="${anchor.id}"]`).getBoundingClientRect().top-el.getBoundingClientRect().top-anchor.offset,streamAnchor)
  assert.ok(Math.abs(streamMovement)<2,`stream preserves old reading anchor: ${streamMovement}`)
  checks.push({label:'streaming reading anchor',movement:streamMovement})

  await lastQuestionAtTop('after prepend')
  await scenario({answers:[],segments:[{id:'live',text:'尚未提交的语音问题',startMs:0,isFinal:false}],id:'live-record'})
  await lastQuestionAtTop('only pending transcript')
  await scenario({answers:[],id:'empty'})
  await expect(page.getByText('准备好，听下一个问题。',{exact:true})).toBeVisible()
  assert.equal(await viewport.evaluate(el=>el.scrollHeight>el.clientHeight+1),false,'empty state adds no artificial scroll')
  await scenario({answers:[answer('normal','普通窗口回答')],compact:false,id:'normal'})
  assert.equal(await viewport.locator(':scope > div').count(),1,'normal mode has no tail spacer')
  assert.deepEqual(errors,[])
  await writeFile(join(output,'report.json'),JSON.stringify({passed:true,checks,errors},null,2))
  console.log(`PASS ${checks.length} compact scroll geometry and anchor checks; normal/empty unaffected`)
} catch (error) { await page.screenshot({path:join(output,'failure.png')});throw error }
finally { await browser.close();await server.close() }

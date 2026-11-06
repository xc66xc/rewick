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

  await page.setViewportSize({width:530,height:780})
  // Restore the explicit DOM-only font mutation exercised above before this preview.
  await page.locator('main').evaluate(element=>element.style.setProperty('--compact-font-size','19px'))
  const firstSpeech={id:'speech-first',text:'请结合员工助手项目，介绍一下业务背景、你负责的模块，以及为什么采用多 Agent 的架构？',startMs:0,endMs:5200,isFinal:true}
  const nextSpeech={id:'speech-next',text:'在落地过程中，你遇到',startMs:5300,isFinal:false}
  const speechScenario=segments=>scenario({answers:[],segments,id:'live-question-preview',fontSize:19})
  const liveTurn=page.getByRole('region',{name:'当前转写问题',exact:true})
  const liveBubble=liveTurn.getByRole('heading')
  await speechScenario([firstSpeech])
  await expect(liveBubble).toHaveText(firstSpeech.text)
  const originalBubble=await liveBubble.elementHandle()
  assert.ok(originalBubble,'live question bubble exists before another sentence starts')
  try {
    await speechScenario([firstSpeech,nextSpeech])
    await expect(liveBubble).toHaveText(`${firstSpeech.text}\n${nextSpeech.text}`)
    assert.equal(await liveBubble.evaluate((element,original)=>element===original,originalBubble),true,'new sentence keeps the same question bubble DOM')
    await expect(liveTurn).toHaveAttribute('data-transcript-id',firstSpeech.id)
    checks.push({label:'confirmed speech and next partial remain in one stable bubble',segmentId:firstSpeech.id})

    const revisedSpeech={...nextSpeech,text:'在落地过程中，你遇到过哪些难点？请重点讲讲任务编排、状态管理和故障恢复。'}
    await speechScenario([firstSpeech,revisedSpeech])
    await expect(liveBubble).toHaveText(`${firstSpeech.text}\n${revisedSpeech.text}`)
    assert.equal(await liveBubble.evaluate((element,original)=>element===original,originalBubble),true,'partial correction updates the existing bubble')
    await expect(liveTurn).toHaveCount(1)
    checks.push({label:'partial revision replaces its own sentence without duplicates'})
    await page.screenshot({path:join(output,'live-question-preview.png')})

    const longSpeech={...firstSpeech,text:firstSpeech.text+'\n'+Array.from({length:10},(_,i)=>`补充条件${i+1}：请说明项目中的请求如何分发，如何记录任务状态，以及某个工具调用失败后怎样恢复。`).join('\n')+'\n'+ 'ConcurrentRequestConsistencyConstraint'.repeat(5)}
    await speechScenario([longSpeech,revisedSpeech])
    await expect(liveBubble).toHaveText(`${longSpeech.text}\n${revisedSpeech.text}`)
    const wrapping=await liveBubble.evaluate(element=>{const bounds=element.getBoundingClientRect();return{width:element.clientWidth,scrollWidth:element.scrollWidth,height:bounds.height,lineHeight:Number.parseFloat(getComputedStyle(element).lineHeight)}})
    assert.ok(wrapping.height>wrapping.lineHeight*3,'long question wraps across multiple lines')
    assert.ok(wrapping.scrollWidth<=wrapping.width+1,'long question has no horizontal text clipping')
    assert.equal(await viewport.evaluate(element=>element.scrollWidth<=element.clientWidth+1),true,'live question does not introduce horizontal viewport overflow')
    checks.push({label:'long question and unbroken technical words wrap without horizontal clipping',...wrapping})

    await page.getByRole('button',{name:'查看最新回答',exact:true}).click()
    await expect.poll(()=>viewport.evaluate(element=>element.scrollTop)).toBe(0)
    const composerBefore=await page.getByRole('textbox',{name:'当前问题',exact:true}).boundingBox()
    await wheel(230)
    const readingPosition=await viewport.evaluate(element=>element.scrollTop)
    assert.ok(readingPosition>24,'user has manually scrolled away from live question opening')
    const continuedSpeech={...revisedSpeech,text:revisedSpeech.text+'另外，如果同一任务收到重复请求，你会如何处理幂等和资源回收？'}
    await speechScenario([longSpeech,continuedSpeech])
    await expect(liveBubble).toHaveText(`${longSpeech.text}\n${continuedSpeech.text}`)
    const afterGrowth=await viewport.evaluate(element=>element.scrollTop)
    assert.ok(Math.abs(afterGrowth-readingPosition)<=1,`live partial growth must not take over manual reading: ${readingPosition} -> ${afterGrowth}`)
    const composerAfter=await page.getByRole('textbox',{name:'当前问题',exact:true}).boundingBox()
    assert.ok(composerBefore&&composerAfter&&Math.abs(composerBefore.y-composerAfter.y)<1&&Math.abs(composerBefore.height-composerAfter.height)<1,'composer stays fixed while the user reads a growing long question')
    assert.equal(await liveBubble.evaluate((element,original)=>element===original,originalBubble),true,'long question keeps its DOM identity through updates and manual reading')
    checks.push({label:'live partial growth preserves manual reading and fixed composer',before:readingPosition,after:afterGrowth,composerY:composerAfter.y})
  } finally { await originalBubble.dispose() }

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

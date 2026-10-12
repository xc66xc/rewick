import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import type { Answer, SessionRecord } from '../../src/shared/types'
import { createAnswerWorkbook } from '../../src/main/services/answer-excel-export'

function answer(overrides: Partial<Answer> = {}): Answer {
  return { id: 'answer', question: '保存的问题', text: '实际回答', status: 'complete', createdAt: '2026-10-12T12:00:00Z', ...overrides }
}
function session(answers: Answer[]): SessionRecord {
  return { id: 'session', title: '测试会话', createdAt: '2026-10-12T12:00:00Z', segments: [], answers }
}
async function read(answers: Answer[]) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Uint8Array.from(await createAnswerWorkbook(session(answers))).buffer)
  const sheet = workbook.getWorksheet('data')
  if (!sheet) throw new Error('Missing data sheet')
  return sheet
}

describe('answer Excel export', () => {
  it('matches the input columns, preserves actual input and context order, and leaves reference empty', async () => {
    const contexts = ['第二段："引用"\n换行', { text: '第一段', kind: 'personal' }, '第一段']
    const sheet = await read([answer({ modelInput: { model: 'test', messages: [
      { role: 'system', content: '不应导出系统提示词' },
      { role: 'user', content: JSON.stringify({ question: '=实际问题', personalContext: '不应混入检索资料的简历', referenceContext: contexts }) },
    ] } }), answer({ id: 'empty', text: ' ' }), answer({ id: 'next', text: '+实际答案' })])
    expect(sheet.getRow(1).values).toEqual([undefined, 'id', 'user_input', 'response', 'retrieved_contexts', 'reference'])
    expect(sheet.rowCount).toBe(3)
    expect(sheet.getRow(2).values).toEqual([undefined, 1, '=实际问题', '实际回答', JSON.stringify(['第二段："引用"\n换行', '第一段', '第一段']), ''])
    expect(sheet.getCell('B2').type).toBe(ExcelJS.ValueType.String)
    expect(sheet.getCell('C3').type).toBe(ExcelJS.ValueType.String)
    expect(sheet.getCell('A3').value).toBe(2)
    expect(sheet.getCell('D3').value).toBe('[]')
    expect(sheet.getCell('E3').value).toBe('')
  })

  it('uses saved retrieval for old answers and preserves partial response text', async () => {
    const sheet = await read([answer({ status: 'cancelled', text: '已生成的部分答案', retrieval: {
      status: 'ready', excerpts: [{ documentId: 'doc', chunkId: 'chunk', revision: 1, kind: 'technical', name: '文档', text: '原始检索正文' }],
    } })])
    expect(sheet.getCell('C2').value).toBe('已生成的部分答案')
    expect(sheet.getCell('D2').value).toBe('["原始检索正文"]')
  })

  it('keeps empty actual retrieval even when saved metadata contains extra contexts', async () => {
    const sheet = await read([answer({ modelInput: { model: 'test', messages: [
      { role: 'user', content: JSON.stringify({ question: '原始问题', referenceContext: [] }) },
    ] }, retrieval: { status: 'ready', excerpts: [{ documentId: 'doc', chunkId: 'chunk', revision: 1, kind: 'technical', name: '文档', text: '未发送的片段' }] } })])
    expect(sheet.getCell('D2').value).toBe('[]')
  })

  it('rejects invalid snapshots rather than substituting different contexts', async () => {
    await expect(read([answer({ modelInput: { model: 'test', messages: [{ role: 'user', content: 'invalid JSON' }] } })])).rejects.toThrow('快照无效')
  })

  it('rejects oversized cells without truncating content', async () => {
    await expect(read([answer({ text: '字'.repeat(32768) })])).rejects.toThrow('response 超过')
    await expect(read([answer({ modelInput: { model: 'test', messages: [{ role: 'user', content: JSON.stringify({ question: '问题', referenceContext: ['字'.repeat(32767)] }) }] } })])).rejects.toThrow('retrieved_contexts 超过')
  })

  it('rejects a session without response text', async () => {
    await expect(read([answer({ text: '' })])).rejects.toThrow('没有可导出的回答正文')
  })
})

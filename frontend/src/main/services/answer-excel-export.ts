import ExcelJS from 'exceljs'
import { z } from 'zod'
import type { Answer, SessionRecord } from '../../shared/types'

const inputSchema = z.object({
  question: z.string().min(1),
  referenceContext: z.array(z.union([z.string(), z.object({ text: z.string() })])),
})
const columns = ['id', 'user_input', 'response', 'retrieved_contexts', 'reference']

function answerInput(answer: Answer) {
  if (!answer.modelInput) return {
    question: answer.question,
    contexts: (answer.retrieval?.excerpts ?? []).map(excerpt => excerpt.text),
  }
  const message = answer.modelInput.messages.find(value => value.role === 'user')
  try {
    const input = inputSchema.parse(JSON.parse(message?.content ?? ''))
    return { question: input.question, contexts: input.referenceContext.map(value => typeof value === 'string' ? value : value.text) }
  } catch {
    throw new Error(`回答「${answer.question.slice(0, 40)}」的模型输入快照无效，无法准确导出。`)
  }
}

export async function createAnswerWorkbook(record: SessionRecord): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('data')
  sheet.addRow(columns)
  let id = 0
  for (const answer of record.answers) {
    if (!answer.text.trim()) continue
    const input = answerInput(answer)
    if (!input.question.trim()) throw new Error('回答的问题为空，无法导出。')
    const values = [++id, input.question, answer.text, JSON.stringify(input.contexts), '']
    values.forEach((value, index) => {
      if (typeof value === 'string' && value.length > 32767) {
        throw new Error(`第 ${id} 条回答的 ${columns[index]} 超过 Excel 单元格 32,767 字符限制，未导出；请使用其他格式保留完整数据。`)
      }
    })
    sheet.addRow(values)
  }
  if (!id) throw new Error('这场会话没有可导出的回答正文。')
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.columns.forEach((column, index) => { column.width = index === 0 ? 10 : index === 3 ? 80 : 55 })
  sheet.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true } })
  sheet.getRow(1).font = { bold: true }
  sheet.autoFilter = { from: 'A1', to: 'E1' }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

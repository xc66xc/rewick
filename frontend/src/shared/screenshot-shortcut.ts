import { z } from 'zod'
import { normalizeSourceShortcut } from './source-shortcut'

import { algorithmLanguages, type AlgorithmLanguage } from './algorithm-answer'
export const screenshotLanguages = algorithmLanguages
export type ScreenshotLanguage = AlgorithmLanguage
export interface ScreenshotShortcutSettings { accelerator: string; language: ScreenshotLanguage; error?: string }
export const screenshotShortcutSchema = z.object({
  accelerator: z.string().max(80).transform(normalizeSourceShortcut),
  language: z.enum(screenshotLanguages).default('Java')
}).strict()

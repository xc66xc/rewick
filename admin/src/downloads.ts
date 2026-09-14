import { z } from 'zod'
export const downloadSchema = z.object({ id: z.string(), platform: z.string(), architecture: z.string(), version: z.string(), filename: z.string(), fileSize: z.number(), sha256: z.string(), minimumOsVersion: z.string(), releaseNotes: z.string(), enabled: z.boolean(), updatedAt: z.string() })
export const downloadsSchema = z.array(downloadSchema)
export const uploadSchema = z.object({ uploadId: z.string(), filename: z.string(), fileSize: z.number(), sha256: z.string() })
export type ClientDownload = z.infer<typeof downloadSchema>
export const downloadNames: Record<string, string> = { 'macos-arm64': 'macOS · Apple Silicon（M 系列）', 'macos-x64': 'macOS · Intel', 'windows-x64': 'Windows · x64' }
export function fileSize(bytes: number): string { return (bytes / 1024 / 1024).toFixed(1) + ' MB' }

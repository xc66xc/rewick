import { DownloadSimple, Users, SlidersHorizontal, EnvelopeSimple, ListBullets, ClockCounterClockwise, Gift, Receipt, CreditCard, ChatsCircle } from '@phosphor-icons/react'
export const groups = [
  { name: '运营管理', pages: [{ id: 'operations', name: '运营观测', icon: ListBullets }, { id: 'users', name: '用户管理', icon: Users }, { id: 'packages', name: '套餐管理', icon: Gift }, { id: 'payment-orders', name: '支付订单', icon: Receipt }, { id: 'invitations', name: '邀请奖励', icon: Gift }] },
  { name: '服务配置', pages: [{ id: 'mock-interviews', name: '模拟面试', icon: ChatsCircle }, { id: 'config', name: '模型与服务', icon: SlidersHorizontal }, { id: 'payment-config', name: '支付设置', icon: CreditCard }, { id: 'email', name: '邮件服务', icon: EnvelopeSimple }] },
  { name: '系统管理', pages: [{ id: 'downloads', name: '客户端下载', icon: DownloadSimple }, { id: 'usage', name: '调用记录', icon: ListBullets }, { id: 'audit', name: '操作日志', icon: ClockCounterClockwise }] }
] as const
export type PageId = typeof groups[number]['pages'][number]['id']
export const pages = groups.flatMap(group => [...group.pages])

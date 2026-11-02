export const groups = [
  { title: '运营管理', items: [{ key: 'operations', label: '运营观测', icon: 'chart' }, { key: 'users', label: '用户管理', icon: 'users' }, { key: 'packages', label: '套餐管理', icon: 'gift' }, { key: 'payment-orders', label: '支付订单', icon: 'order' }, { key: 'invitations', label: '邀请奖励', icon: 'gift' }] },
  { title: '服务配置', items: [{ key: 'mock-interviews', label: '模拟面试', icon: 'message' }, { key: 'config', label: '模型与服务', icon: 'settings' }, { key: 'payment-config', label: '支付设置', icon: 'wallet' }, { key: 'email', label: '邮件服务', icon: 'mail' }] },
  { title: '系统管理', items: [{ key: 'downloads', label: '客户端下载', icon: 'download' }, { key: 'usage', label: '调用记录', icon: 'list' }, { key: 'audit', label: '操作日志', icon: 'log' }] }
] as const
export type PageId = typeof groups[number]['items'][number]['key']
export const pages = groups.flatMap(group => [...group.items])

# 管理端组件索引

独立入口 `src/main.tsx`，使用 `tokens.css` 暖灰 / 墨绿语义 token 与 `styles.module.css`；不引入桌面 IPC。

| 组件 | 层 | 职责 |
| --- | --- | --- |
| Modal / ConfirmDialog | 复合 | 原生 dialog、具体操作确认、忙碌态及焦点恢复 |
| Pagination / LoadState | 复合 | 服务端分页与加载、空、错误重试状态 |
| UserEditor / UserSecurityDialog | 功能 | 创建、启停、额度、密码重置及登录撤销 |
| ProviderEditor / ModelEditor / ServiceSelectors | 复合 | 受控配置草稿、密钥录入、模型与能力映射 |
| UsersPage / ConfigPage / UsagePage / AuditPage | 功能 | 独立管理流程；全部通过 ApiClient 调用真实后端 |
| LoginPage / App | 功能 | ADMIN 认证、内存会话、导航及工作台布局 |
| ErrorBoundary | 功能 | 各页面渲染异常的重试入口 |

认证与取消由 `useAuth` / `ApiClient` 管理；异步列表使用 `useResource` 的 AbortController；配置草稿由 `useConfig` 保留并处理版本冲突。

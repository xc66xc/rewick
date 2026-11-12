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

## Vue 管理端问题改写（2026-11-12）

当前管理端为 Vue 3，新增组件沿用 `src/components/ui/` 和 `services-rewick/ServicesPanel.vue`，不复用上述历史 React 入口。

| 组件 | 层 | 职责与样式 |
| --- | --- | --- |
| services-rewick/QuestionRewritePolicy.vue | 功能 | 模型与服务页策略、独立模型绑定、关闭保留选择、短超时、草稿测试/版本冲突及页面停用取消；复用 Panel、Field、Switch、Select、FormField、Button、ServiceFeedback、form-grid/stack |
| services-rewick/QuestionRewritePreview.vue | 复合 | 合成样例原文、整理结果、实际模型及测试耗时；复用 business-facts/field-hint，aria-live 更新 |

未新增全局 token、样式、动画或接口导航。`scripts/smoke-question-rewrite.mjs` 基于生产构建和浏览器合成 API 验证桌面/390px、主题、失败、草稿测试不发布并生成 README 预览；不调用生产服务或真实模型。

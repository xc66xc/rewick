# 本地 3D 面试官首版验收（2026-10-17，桌面 1.6.0）

- 真实 Electron / WebGL 已显示本地 VRM 角色与办公室背景；原始证据 `frontend/test-results/mock-interviewer-panel.png`、`mock-interview-active.png`、`mock-interviewer-narrow.png`。
- 已修正初始手臂反向旋转、机位导致头部裁切、CSP 阻挡贴图三个实际画面问题。贴图读取失败也不能宣称加载成功。
- 保留身份/在线提示、状态说明与显式 2D/3D。760px 窄窗口无横向溢出，输入和操作按钮仍可见。Reduced-motion 真实画布两次像素一致；模拟 contextlost 后明确报错并可重试。
- 视觉边界：这是许可明确的长发白衣 anime 示例模型，与原 2D 短发西装形象存在明显差异，仅为本地渲染验证；已在 UI 和交付说明明示。职业定制模型美术尚未完成，不能算最终定制形象验收通过。
- 性能边界：代码限制 42ms 调度/DPR1.25、非活动停止；尚未做 Windows 集显和 30 分钟资源对照，不宣称长时间性能验收完成。
- 不改问答正文、字幕编辑、余额或后端。当前未打包和部署。

---

# 模拟面试官视觉验收

目标：用户选定的第二张效果图，2D女面试官/办公室场景/顶部身份与连接状态/底部倾听提示。仅修改桌面左侧角色区域。

## 第一轮

来源：`/Users/carlwang/.codex/generated_images/01a12e6a-f9f1-7913-93ec-40ab33fced36/exec-93d915c2-b545-42ef-8d69-916d4e478cb3.png`（1003×1568）。Electron面板截图596×978，按组件边界裁去来源外侧展示留白、归一化到同一430px宽比较；原始截图保留。对照 `.local/avatar-design/comparison-before.png`。

- P2：插画头顶留白不足，人物位置较目标偏高。已请求重新生成原生图片帧，禁止用占位图或代码绘图替代。
- P2：顶部信息/底部状态字号、底部占比偏大。按既有产品字号改为顶部12px、底部14/12px，缩小间距及footer；Phosphor波形改为regular线条，去掉填充底块。
- 字体：使用产品既有字体和中文字形；状态文字与目标一致。
- 颜色：沿用产品语义蓝/成功绿/白色面板，插画来自已选择的生成方向。
- 范围：原右侧问答不改；在线只在真实连接时展示。



## 最终复核

- 第二轮：重新生成图集，头顶留白约18%、完整双手和桌面4–5%；顶部身份12px、状态14/12px、footer80px，波形使用Phosphor regular。
- 第三轮：窄屏大图导致问答被挤到下方，已将820px以下改为紧凑横排。重拍760×1000 CSS窗口，画像与状态完整、问答及结束按钮可见、无水平溢出。
- 最终对照：frontend/test-results/mock-interviewer-comparison.png（源稿与实际面板同宽等比放置，不拉伸）。实际面板与源稿均为listening状态。整页证据mock-interview-active.png、窄屏mock-interviewer-narrow.png；Electron deviceScaleFactor2。
- 字体/文案：沿用产品系统字体；Rewick面试官、在线、正在听你回答、保持自然表达均可读，原生DOM支持状态变化。生成稿具体字形不可识别，采用既有产品字体属可接受差异。
- 间距/布局：同一办公室竖幅、顶部身份、底部状态结构成立；P2人物位置/底部占比已修复。窄屏无源稿，以不挡核心问答为验收标准。
- 颜色/token：白色面板/语义蓝/语义绿/次级文字沿用产品token，未添加自定义硬编码色。
- 素材质量：1086×1448本地PNG图集，四个543×724帧。保持同一女面试官、服装与办公室；仅为简易嘴型/眨眼，细节不与生成稿像素相同，无3D或视频流。
- 状态/交互：在线依实际连接，暂停/结束静止，减少动态设置关闭帧动效；22项专项与Electron6场景、生产构建通过。
- P3：帧间存在轻微插画纹理/姿态差异；不是语素级口型。现阶段可接受，后续需更自然表情可另做分层角色素材。

final result: passed

---

## 历史设计验收（保留）

# 管理后台第 1 版设计验收

- Source visual truth: `/Users/carlwang/.codex/generated_images/01a07b11-50ed-7123-bb1d-6e93860da07e/exec-2e7f8580-8949-4963-a88f-4b1bfb7b3cb6.png`
- Implementation: `admin/design-preview/users.png`; additional captures: `admin/design-preview/config.png`, `admin/design-preview/users-mobile.png`.
- Local URL: http://127.0.0.1:5186/ (temporary mock API; synthetic data only).
- Desktop viewport/source/implementation: 1487 × 1058 CSS/pixels, devicePixelRatio 1. Used viewport screenshot; discarded full-page screenshot because this browser capture scaled content incorrectly.
- Mobile viewport: 390 × 844; browser scrollbar leaves 375 CSS pixels of content. No document horizontal overflow; navigation and table independently scroll horizontally.
- State: signed-in administrator, user list with seven synthetic rows and pagination. No production credentials or data used.

## Comparison history
1. Initial desktop capture `/tmp/rewick-admin-viewport.png`: P2—sidebar, heading and table typography smaller than source. Adjusted desktop sidebar to 272px, heading to 36px, navigation to 16px, table to 15px and avatars to 44px. Duration now HH:MM:SS with accessible Chinese duration label.
2. Source and revised `users.png` emitted together in one comparison tool result. Region proportions, grouped navigation, heading, search/table panel, row hierarchy and pagination checked. No remaining P0/P1/P2 discrepancy. Full-resolution table and navigation text readable in this input; no separate crop necessary.
3. Config page check: P2—three administrative buttons consumed separate full-width rows. Grouped them in a wrapping toolbar; recaptured `config.png`, verified normal button widths and reduced empty spacing.

## Required fidelity surfaces
- Typography: existing system Chinese font stack, dark heading and medium-weight user names; secondary IDs readable. 36px page heading, 15px desktop cells. Generated source font cannot be identified exactly; platform font rendering difference accepted.
- Layout: white 272px grouped sidebar; 70px breadcrumb bar; 32px content margins; single white search/table/pagination panel. Table maintains scroll access on narrow screens.
- Colors: cool gray canvas, white surfaces, cobalt primary and pale-blue selected state. Disabled status remains neutral; actual success/error notices retain semantic colors.
- Assets: original repository Rewick logo retained instead of generated logo variant; existing Phosphor icon library used. Initial avatars represent display names.
- Copy: functional existing admin actions preserved. No mock totals or identities shipped in application source. Page size remains existing fixed 20; mock's selectable size not implemented. Explicit logout kept instead of inventing account menu.

## Interaction and validation
- Browser: mock login, user list, more-actions open, Escape close, navigation to model configuration and back. Console error log empty. Desktop and narrow viewport inspected; temporary viewport reset afterward.
- Automated tests: updated name/menu-path assertions; added Escape/focus restoration test; 60 tests passed before final config toolbar-only adjustment (rerun recorded in delivery).
- No production API integration test or deployment performed.

## Findings
No unresolved P0/P1/P2 findings for selected user-management design. Other admin pages inherit global styles; only model configuration additionally inspected visually. Long populated production tables and every service configuration state not exhaustively visually tested.

final result: passed

## 用户管理概览更新 · 2026-09-23
- Target: `/Users/carlwang/.codex/generated_images/01a07b11-50ed-7123-bb1d-6e93860da07e/exec-9a7b59b8-4423-4091-8643-82b542a25aba.png`.
- Captures: `admin/design-preview/users-overview.png`, `admin/design-preview/users-overview-mobile.png`.
- Compared target and final desktop rendering together in one tool call at 1487×1058. Matched sidebar, compact table, selected-row tint and right overview; corrected unstyled close button and profile alignment after first comparison.
- Intentional business adaptations: API has no email, status totals/filter, binding or login-log support. Retained actual total/search and available account actions; no invented statistics or unsupported controls. Overview opens by selecting user name and closes back to list focus.
- At 390×844 overview stacks above list; document width375 <= viewport390, table remains independently scrollable. Viewport reset.
- Validation: 62 tests passed; TypeScript/Vite build passed; git diff --check passed. Tests cover switching users, cancellation of security action, close-focus restoration and clearing selection after search.
- QA status: passed with documented adaptations. Local synthetic-data preview only; production integration and deployment not performed this turn.

## 套餐管理 · 2026-09-23
- Target: `/Users/carlwang/.codex/generated_images/01a07b11-50ed-7123-bb1d-6e93860da07e/exec-cca8cf1b-6c36-4a8a-ad39-851209360dd3.png`.
- Captures: `admin/design-preview/packages.png`, `admin/design-preview/packages-mobile.png`.
- Compared target and implementation together at 1487×1058; tightened table density after initial capture. Three equal cards, selected state, ordering table and details panel retained. Uses existing blue design tokens, real price/discount fields, no invented subtitle or last-updated field.
- Card selection updates detail panel; edit opens existing validated form in modal; up/down state changes require confirmation and use versioned update; archive retains existing confirmation. No production data changed.
- Browser inspected editor contents and close action; 390×844 stacks cards without document overflow (scrollWidth375); viewport reset.
- Automated: 62 tests passed, including create/update units, latest version reuse, cancel/confirm unlisting with writable-only payload. Final build and diff check passed.
- final result: passed. Local synthetic-data preview; not deployed.

## 支付订单 · 2026-09-23
- Target: `/Users/carlwang/.codex/generated_images/01a07b11-50ed-7123-bb1d-6e93860da07e/exec-7982d6cc-d0b2-4ea3-bd7c-748e002ffc52.png`.
- Captures: `admin/design-preview/payment-orders.png`, `admin/design-preview/payment-orders-mobile.png`.
- Compared source and implementation together at 1487×1058, selected paid/credited order. Tightened table spacing after first comparison. Implemented toolbar, status/channel filters, independent payment and fulfillment columns, selected row and order progress/details.
- Adaptations: actual purchased duration replaces reference's fictional day-based validity; no fabricated channel transaction ID, voucher or fulfillment timestamp. Local search/pagination explicitly scoped to latest 100 API orders. Existing query/retry/refund logic retained; refund registration remains confirmed and does not send a provider refund.
- Mobile390×844 has no document horizontal overflow (375px); table independently scrolls, detail fields stack. Viewport reset.
- Validation: 63 tests passed including combined filters/detail reset, fulfillment retry and channel-specific manual refund confirmation; final build and diff check passed.
- final result: passed. Mock data used for visual QA; no production deployment performed.

## 邀请奖励 · 2026-09-23
- Target: `/Users/carlwang/.codex/generated_images/01a07b11-50ed-7123-bb1d-6e93860da07e/exec-79062b73-b29f-40b1-8510-042046f4adc9.png`.
- Captures: `admin/design-preview/invitations.png`, `admin/design-preview/invitations-mobile.png`.
- Compared source and implementation together at1487×1058: rule summary, reward value, trigger condition and invitation table match selected composition. Uses real verification requirement; enable checkbox lives in rule modal with explicit save rather than an ambiguous immediate toggle. Reward history contains only successful awards, so status is 已发放.
- Browser checked edit/cancel, record details and 390×844 stacked summary; no document horizontal overflow (375px). Viewport reset. Synthetic data only.
- Validation:64 tests passed including versioned save, conflict draft retention and cancel without mutation; build and diff check passed.
- final result: passed. No production deployment.

## 模型与服务 — 2026-09-23
- Source: `/Users/carlwang/.codex/generated_images/01a07b11-50ed-7123-bb1d-6e93860da07e/exec-5173881f-472c-43aa-8f2a-682b23e6340b.png`.
- Implemented capability filters, two-column equal-height service summary cards, inline configuration editing, add-service picker and grouped platform settings. Existing save/test/enable/delete and secret-handling behavior retained.
- Deliberate adaptations: render only available configuration fields; omit illustrative latency/history/index counts. All capabilities use the existing blue design tokens; destructive actions remain explicit.
- Compared source and live browser at 1487×1058; checked category filtering and opening/cancelling the ASR editor. Mobile 390×844 uses one column and scrollable categories, document scroll width 375px. Adjusted mobile add-menu anchoring.
- Screenshots: `admin/design-preview/model-services.png`, `admin/design-preview/model-services-mobile.png` (synthetic preview data).
- Validation: 65 admin tests passed; production build passed. No deployment performed.
- Result: passed.

## 支付设置 — 2026-09-23
- Source: `/Users/carlwang/.codex/generated_images/01a07b11-50ed-7123-bb1d-6e93860da07e/exec-c2c15ab7-53db-4df1-8828-a9d1db2f04ae.png`.
- Three selectable payment channel cards with saved configuration status, summary panel, configuration completeness checklist and copyable callback address. Existing editors are opened on demand and retain channel-specific validation/version/secret semantics; cancelling unmounts the draft.
- Compared reference and browser in the ZPAY state at 1487×1058. Checked edit/cancel and 390×844 layout (document scroll width 375px); no browser errors.
- Deliberate adaptations: existing blue tokens and Phosphor icons; no unsupported H5/international payment claims or false live connectivity check. ZPAY shows the single actual configured payment method. Enable/disable remains inside the saved editor rather than an immediate overview switch.
- Evidence: `admin/design-preview/payment-settings.png`, `admin/design-preview/payment-settings-mobile.png`, using synthetic local data.
- Validation: 67 tests and production build passed; `git diff --check` clean. No deployment or live payment configuration changes.
- Final result: passed.

## 邮件服务 — 2026-09-23
- Source: `/Users/carlwang/.codex/generated_images/01a07b11-50ed-7123-bb1d-6e93860da07e/exec-c28b52d1-b831-485a-aec9-5ff296e11091.png`.
- Added service status, SMTP summary, sender identity and connection-test panels. Editor opens on demand; cancelling restores the saved configuration and discards credentials. Existing validation, version conflict handling and reload confirmation retained.
- Adaptations: supported registration email only; no invented sender display name or historical test timestamp. Existing Phosphor envelope icon replaces decorative illustration. Enable/disable stays in the editor. Connection test remains authentication-only and sends no email.
- Source/live comparison at 1487×1058 passed. Editor/cancel verified in browser; 390×844 is single-column with no document horizontal overflow (scroll width 375px).
- Evidence: `admin/design-preview/email-settings.png`, `admin/design-preview/email-settings-mobile.png`, synthetic local data.
- Validation: 68 admin tests and production build passed; diff whitespace check clean. No deployment or production configuration changes.
- Final result: passed.

## 客户端下载 — 2026-09-23
- Source: `/Users/carlwang/.codex/generated_images/01a07b11-50ed-7123-bb1d-6e93860da07e/exec-0bb29074-983e-4cdb-95b9-8b5a9d66ede0.png`.
- Three platform release cards, selected release details, download path copying and on-demand editor. Upload validation/progress, failed draft retention and explicit save-to-publish behavior retained. Cards update after successful save; cancelling discards only the unsaved editor state.
- Adaptations: actual 500 MB limit instead of illustrative 2 GB; library platform icons; upload selection stays in the editor instead of adding a drag target. Enable/disable uses the existing save workflow. Relative download paths follow the landing implementation without inventing a download domain.
- Compared source/live at 1487×1058. Verified Windows edit/cancel and platform selection. 390×844 stacks cards and has no document horizontal overflow (375px scroll width).
- Screenshots: `admin/design-preview/client-downloads.png`, `admin/design-preview/client-downloads-mobile.png`; synthetic preview data.
- 69 tests passed; production build passed with a non-blocking 505 kB main-chunk size warning. Diff whitespace check passed. No deployment performed.
- Final result: passed.

## 调用记录 — 2026-09-23
- Source: `/Users/carlwang/.codex/generated_images/01a07b11-50ed-7123-bb1d-6e93860da07e/exec-03e4ffbc-12e6-440e-b4fe-0c61a3efe46a.png`.
- Added compact filter toolbar, expandable user/model filters, capability icons/status badges, refresh, calculated elapsed time and expandable request details. Server filtering/pagination preserved.
- Adaptations: search retains actual email/name semantics rather than claiming request-ID search; unfinished or invalid timing shows a dash. No invented costs, token counts or error reasons.
- Compared reference and browser at 1487×1058 with failed request selected; checked more-filter visibility and 390×844 layout. Table scrolls internally; document scroll width 375px.
- Evidence: `admin/design-preview/usage-records.png`, `admin/design-preview/usage-records-mobile.png` (synthetic data).
- Validation: 70 tests and production build passed; existing non-blocking main-chunk warning remains. No deployment.
- Final result: passed.

## 操作日志 — 2026-09-23
- Source: `/Users/carlwang/.codex/generated_images/01a07b11-50ed-7123-bb1d-6e93860da07e/exec-9c7d5500-9374-4ebf-b4a1-3a46c5824582.png`.
- Implemented date-grouped operation list, readable action labels, selected-row styling, right-hand details and a compact search/type/operator toolbar. Refresh, pagination and retry retained.
- Adaptations: existing endpoint supports pagination only, so filters explicitly apply to the current page and reset on page changes. No fabricated change descriptions, date-range server search or target types. Raw action and target remain available.
- Compared source and rendered desktop at 1487×1058; 390×844 stacks details above the internally scrolling table, document scroll width 375px. Synthetic preview data only.
- Evidence: `admin/design-preview/audit-logs.png`, `admin/design-preview/audit-logs-mobile.png`.
- Validation: 71 admin tests passed; production build passed with existing non-blocking chunk-size warning. No deployment.
- Final result: passed.

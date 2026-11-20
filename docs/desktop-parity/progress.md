# 桌面端改进进度（真实状态）

按 [改进候选 Backlog](improvement-backlog.md) 逐项记录。状态只使用以下含义：

- **已验证**：代码已合入，并在 GitHub `windows-2022` 真机流水线（或本地运行时）通过对应检查。
- **已实现，待验证**：代码已合入，但缺少对应的真机或运行时检查。
- **已分析，未实现**：根因或设计已确定，尚未改代码。
- **未开始**。

| 编号 | 项目 | 状态 | 证据 / 说明 |
| --- | --- | --- | --- |
| C3 | 窗口状态记忆 | 已验证 | 提交 `f655a1b`；`windows-2022` 冒烟报告：保存 `(120,140,1044,720,0)`，重启后原样恢复 |
| C9 | WebView2 缺失时的引导 | 已实现，待验证 | 编译通过；运行时缺失的分支无法在 runner 上真正移除 WebView2 来测试，需要专门的验证方式 |
| B1 | 模型网关超时导致无限重发（#345） | 已验证（运行时 + UI + 单元测试 + Windows 构建）；Windows 真机 UI 待做 | `verification/b1-retry-storm/`：真实 OpenCode 1.19.5 在 502 下持续重发；4xx 后 1 次请求即停止。UI 验证（Linux 无头 Chromium，已打补丁的网页服务，桩服务返回 424）：聊天区显示"Reply interrupted"和红色横幅"The upstream service failed"，整个运行只收到 1 次 POST。演示视频 `b1-demo-linux-headless.mp4`。局限：横幅不显示 424 的具体提示文字；沙箱缺中文字体，中文显示为方框。`tests/test_model_gateway.py` 12 项通过。补丁 `patches/agent-gateway-terminal-failure.patch` 在 `ab3f058` 上可无冲突应用，`windows-2022` 打包与冒烟通过 |
| B2 | 切换项目后 Agent 写入失败（#321） | 已分析，未实现（A1 依赖它） | 根因：Agent 复用界面的编辑会话，切换项目后会话归属改变，无法通过 A 的租约校验。修复需要为 Agent 运行单独持有租约（续期、结束释放、保留原窗口归属），涉及 `infrastructure/creation_projects.py` 的会话表和同项目单运行约束，属于数据安全关键路径，需要专门设计与测试，不宜仓促改动 |
| A1 | 简洁 / 进阶双模式（设置中切换） | 方案已确定，未实现 | 方案见 [a1-dual-mode-spec.md](a1-dual-mode-spec.md)。注意与上游 #386/#380 的"纯净/画布"不是同一概念，需对齐。依赖 B2 修复 |
| A2 | 首次模式选择页 | 未开始 | 依赖 A1 |
| A3 | Plan / Build 执行模式 | 未开始 | 需要服务端强制只读，涉及 `agent/native.py` 的权限配置 |
| B6 / B7 | 变更审阅与一键撤销 | 未开始 | |
| C5 | Windows 通知 | 未开始 | |
| C11 | 导出编码回退 | 未开始 | |
| D2 / D3 | 无模型入口、一句话出分镜 | 未开始 | |

## 本轮新增的工程能力

- 冒烟脚本的每条 PASS 断言写入 `delivery/windows-smoke-report.txt`，由流水线发布到 `evidence/windows-native`。原因是 GitHub 日志在 Azure CDN 上，沙箱无法访问。
- 录屏与截图来自 `windows-2022` 运行产物，可在 evidence 分支取回。

## 仍然缺少的验证

- 组合测试（如纯净模式 + 切换项目 + 运行中 Agent）尚无法执行，因为相关功能还未实现。
- 对 B1 的端到端 UI 验证尚未完成：还没有在网页里观察到"回合显示失败而不是一直思考"。这需要带 headless 浏览器的完整运行，列为下一步。

## 发现的新问题（来自 B1 UI 验证）

- **窗口关闭后租约不释放**：浏览器关闭时没有调用 `DELETE /api/creation/sessions/{id}`，会话残留在 `sessions` 表中，其它窗口打开同一工程会显示"This project is open in another window"，直到租约过期。这与 B2 属于同一类问题，应在 B2 的租约设计中一并处理（页面卸载时释放，或心跳超时更短）。
- **沙箱缺中文字体**：无头 Chromium 下中文显示为方框，演示视频中的中文不可读。真机验证不受影响。

## 收尾（用户指示：写入项目后结束）

- 当前所有代码、补丁、验证脚本与视频已提交到 `arena/5fcfdf0e-for-opendirectore-in-windows`。
- A1 方案写入 `a1-dual-mode-spec.md`，包括用户确认的两种模式、切换方式、依赖与待决问题。
- 未完成项：B2、A1–A3、B6/B7、C5、C11、D2/D3，以及备选清单中其余约 50 项。
- 未完成的验证：B1 在 Windows 真机上的 UI 演示；C9 的真机验证；各项改进的真机 mp4。

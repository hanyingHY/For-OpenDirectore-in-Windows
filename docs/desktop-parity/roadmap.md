# Windows 桌面端执行计划（desktop.12 起 · 授权执行版）

状态：**用户已全权授权执行**（2026-11-21）。本文件是本轮起的总纲，取代 improvement-backlog.md 的「推荐第一批」作为执行顺序来源；backlog 仍是候选池。

## 用户决策记录（本轮固化）

| 决策点 | 结论 |
| --- | --- |
| 主攻方向 | 授权 Agent 全权负责，按本计划推进；允许随时检索竞品（即梦、TapNow、Lovart、Pixo、OpenCode 及更多）并滚动加项 |
| 与上游关系 | **吸收社区 PR 优点（含用户本人提出的目标），在现有基础上做到我们能做到的极致**；共享修复回馈上游，树立 omni 领域开源 harness 地位 |
| 基线策略 | **先稳后跟**：先做 ddea4d0→0.1.5 差异评估，确认后整体推进基线、去重补丁 |
| A1 简洁模式默认 | **系统预设 + 可改抽屉**；支持参考图上传（不做 `@` 引用）；与上游 #386「纯净/画布」保持正交（双维模式） |
| 验收展示 | 认可：真机实操 mp4（CDP→H.264）+ windows-2022 CI 装机冒烟 + 证据归档 `evidence/windows-native`，每批改进交付全量旅程 |
| 发布 | **升级为公开 Release**（稳定频道 + 下载页对接，签名状态明示） |

## 定位

在 omni 领域做到 opencode 之于编码的地位：**Agent 与 GUI 共享同一后台、同一项目状态**；计划可见、任务可中断、变更可审阅、失败有出口、全程可审计。Windows 端以 WebView2 原生宿主实现「体验 ≥ 网页版且 Windows 原生感更强」。

## 双维模式（A1 的设计基线）

| 维度 | 取值 | 性质 |
| --- | --- | --- |
| 工作流（本计划 A1） | 简洁模式 / 进阶模式 | 用户能力梯度，一句话出片 ⇄ 完整工具流 |
| 布局（上游 #386） | 纯净模式 / 画布模式 | 呈现偏好，对话在前 ⇄ 画布在前 |

两维正交组合。简洁模式 MVP：单一输入框 + 参考图上传 → 系统预设出片 → 结果卡片（一键「转入进阶继续编辑」）；参数抽屉可微调；失败态与 B1 同款终止提示。

## 阶段计划

### P0 · 启动（本阶段）
- [x] 汇整 desktop.11 工作基线（arena/3dd8bd97 超集）至本分支
- [x] 本计划落盘
- [x] **基线差异评估**：见 [baseline-0.1.5-assessment.md](baseline-0.1.5-assessment.md)（结论：可行，4 文件重排 + 2 补丁语义去重）

### P1 · 基线推进与补丁去重
- [x] 基线推进到 0.1.5，补丁链重排：（桌面.12 已完成代码与本地全链验证，Windows 工作流冒烟待跑）吸收上游租约释放（unload DELETE）、open-elsewhere 出口等已上游化内容，保留/重写未上游化部分（canvas-placement、timeline-output-dismiss、gateway-terminal、export-signal-contract、open-elsewhere 自愈等待）
- [ ] 回归：上游 `npm test` 全绿 + 我方 `tests/` 全绿 + Windows 工作流冒烟

### P2 · B2 根治：会话/租约所有权（上游 #321）
- [x] Agent 运行持有独立租约（`lease_run` 写 `sessions.owner`、每 15 s 续期、回合结束在 `finally` 与完成回调中释放）；写入、停止、事件读取不再依赖窗口租约。提交 `a104763`，补丁 `patches/agent-run-lease.patch`。
- [x] 运行中的回合阻止重命名、删除（进入回收站）与清理，与一个打开的窗口一致（测试 `test_live_run_holds_rename_trash_and_cleanup_until_it_ends`）。
- [x] 多窗口冲突 UX：窗口 2 打开运行中的工程时显示「其他窗口」等待态，不进入画布；窗口 1 回复完成且写入落地；窗口 1 关闭后窗口 2 自行进入（`verification/agent_lease_second_window.mjs`，结果 `entered`，无点击）。
- [x] 页面卸载释放会话：上游已有 `pagehide` → `DELETE /api/creation/sessions/{id}`，第二窗口旅程依赖它。
- [x] **60 s 过期问题的答案**：运行中的回合每 15 s 续期，过期本身不会切断回复（`test_run_lease_outlives_the_window_lease_and_is_released_at_the_end`，0.5 s 租约下通过）。仅当进程被杀、续期停止时租约才会在 60 s 后失效，此时由 desktop.11 的等待自愈接管。
- [x] 交付：`delivery/desktop13-agent-lease.mp4`（28 s，切换项目 → Agent 写入 → 回到 A，写入状态 `applied`）。
- [ ] 崩溃恢复（SessionJournal）：进程被强杀后，回合在对话中的状态应显示「中断」而不是「思考中」，且工程在过期后可再次打开。尚未验证。
- [ ] 交付：强杀恢复旅程的真机全量 mp4（需在崩溃恢复完成后录制）。
- [ ] 回归：上游全量 pytest 与我方 `tests/` 全绿。当前：失败集合与基线完全相同（21 项，均为本机缺 CLI 运行时等环境原因），新增测试全部通过。

### P3 · A1/A2/C1 简洁模式与双维切换
- [ ] 简洁模式 MVP（输入一句话 + 参考图 → 预设出片 → 结果卡 → 转入进阶）
- [ ] 首次启动模式选择页（A2）+ 设置切换 + 桌面快捷键/托盘（C1）+ 偏好持久化
- [ ] 交付：双语、两种模式完整旅程 mp4

### P4 · Windows 原生冲刺（C 类）
- [ ] C5 生成/渲染完成 toast + 点击回节点；C11 导出编码回退（WebCodecs 不可用时明确引导）；C9 真机验证；C8 剪贴板截图成素材；C6 任务栏进度
- [ ] 交付：原生体验旅程 mp4

### P5 · harness 能力（B 类）
- [ ] B6 变更审阅（Agent 本轮改动 diff 列表）+ B7 一键撤销本轮；A3 Plan/Build（服务端强制只读）；B3 消息排队（跟进上游 #402/#403）
- [ ] 交付：Agent 可靠性旅程 mp4

### P6 · 公开 Release 与上游回馈
- [ ] 稳定频道公开 Release（Sigstore 清单 + SHA256 + 签名状态明示 + 回滚说明），对接下载页（上游 D6 / #413 布局）
- [ ] 上游回馈：Fit all 静默失效 issue；失败卡出口、网关终止、导出信号契约等共享修复整理 PR 回 ThinkFlowLab

## 竞品研究滚动机制

每阶段开始前检索一次（不限于即梦/TapNow/Lovart/Pixo/OpenCode/CapCut/Runway/字幕工具等），要点直接增补进 improvement-backlog.md 并标注来源；对「一句话出片」「Agent 执行图」「任务中心」「审阅流」重点跟踪。

## 验收纪律（每批改进）

1. 代码 + 补丁 + 静态守卫测试合入；2. 沙箱真浏览器全量旅程录屏（CDP→H.264 mp4，双语）；3. Windows 工作流冒烟（OD_VERIFY_RENDER=1）通过，报告入 `evidence/windows-native`；4. progress.md 逐项更新状态；5. 向用户交付 mp4 与摘要。

## 风险与边界

- B2 涉及租约与数据安全关键路径：先设计评审落盘再动 `creation_projects.py`，配套并发测试。
- 基线推进会重排补丁链：逐张验证无冲突后再删旧补丁，保留 desktop.11 成果语义。
- 公开 Release 无 Authenticode 签名：发布说明必须明示 SmartScreen 风险与 SHA-256 核对方式。
- 沙箱无 Windows 环境：「真机」= windows-2022 CI + 沙箱真实浏览器双轨证据，合并结论分别陈述。

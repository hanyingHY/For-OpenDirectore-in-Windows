# 讨论记录：OpenDirector Windows 桌面端（与 Agent 的完整讨论存档）

> 本文档记录本项目立项至 desktop.12 批收官期间，用户与 Agent 的全部讨论要点、决策与结论，供后续迭代与社区回馈参考。
> 相关文档：[roadmap.md](roadmap.md)（执行路线）、[progress.md](progress.md)（逐项状态）、[baseline-0.1.5-assessment.md](baseline-0.1.5-assessment.md)、[competitor-and-feature-baseline.md](competitor-and-feature-baseline.md)（竞品观察）、[improvement-backlog.md](improvement-backlog.md)（改进候选）、[a1-dual-mode-spec.md](a1-dual-mode-spec.md)（简洁模式规格）。

## 1. 愿景与定位

- **总目标**：在 omni（多模态视频创作）领域做到 opencode 之于编码的地位——**开源 harness，Agent 与 GUI 共享同一后台、同一项目状态**。对标 OpenCode 的 Plan/Build 只读、并行会话、统一后台等 harness 标杆能力。
- **任务**：为 ThinkFlowLab/OpenDirector（AI 视频创作工作区，"从想法到可下载短片"）做 **Windows 桌面端**（上游 RFC issue #362：Electron 壳 + 捆绑 Python/FFmpeg/Agent runtime，资源与工程分离，IPC 受限）。**体验必须等同或超过网页版**。
- **参考系**：hanyingHY/For-OpenDirector 与本项目迭代史；吸收已合并 PR #397（Electron+本地 Python Host、loopback 鉴权、项目侧栏、平台窗口控件、双语默认名、示例画布下载、导出信号桥、smoke 测试）的优点，并在其基础上尽力做到极致。
- **身份约束**：用户是上游社区贡献者之一（部分社区 PR 目标即用户提出），须吸收社区优点同时做出超出性的成果，最终回馈上游（P6）。

## 2. 用户约束与授权（长期有效）

1. **只做 Windows 端适配**，不做 macOS/Linux。
2. 应用体验**完全等同甚至超过原项目网页版**。
3. 必须在虚拟机/真机运行原项目网页版亲身体会其设计；建议搜索同类产品（即梦、TapNow 等）丰富理解——已建立竞品观察档案（F1–F14）。
4. **每批改进完成后必须进行真机操作的全量功能模拟**（mp4 形式）以确保无障碍，最后向用户展示真机模拟效果。
5. 用户**全权授权**按计划执行改进；工作过程中可随时搜索更多竞品成功案例并随时加入更丰富的改进。
6. **基线策略与 A1 简洁模式默认参数由 Agent 决定**（见 §3）。
7. 验收展示形式已获用户认可：**真机实操 mp4（CDP→H.264）+ windows-2022 CI 装机冒烟 + 证据归档 `evidence/windows-native`**，每批改进交付完整旅程 mp4。
8. 交付最终须**升级为公开 Release**（稳定频道 + 下载页对接，签名状态明示 SmartScreen 风险与 SHA-256 核对）。

## 3. 已定决策（Agent 决定、用户授权）

| 决策点 | 结论 |
| --- | --- |
| 基线策略 | **先稳后跟、评估后推进**：每步基线推进先全链验证（补丁重放→单测→集成→浏览器旅程→Windows CI）再跟上游；不盲目追新。 |
| A1 简洁模式默认参数 | 系统预设 + 可改抽屉 + **支持参考图上传（不做 @ 引用）**；与上游 #386 纯净/画布是**正交的双维模式**（详见 a1-dual-mode-spec.md）。 |
| 验收方法论 | CDP screencast→MediaRecorder 录真帧（avc1 直录，无需 ffmpeg）；reel 需隔离夹具；`delivery/SHA256SUMS.txt` 校验。 |
| 补丁链形态 | 仓库以 patch 链 + `scripts/package.py` 同步上游基线；补丁含手植头注释（来源/语义/验证状态），重生成后必须移植。 |
| 租约安全红线 | `creation_projects.py` 会话表/租约属数据安全关键路径（B2），须专门设计+测试，不仓促改动。 |

## 4. 执行路线（详见 roadmap.md）

P0 立项评估 → **P1 基线推进 0.1.5 → P2 B2 租约根治（上游 #321）→ P3 A1/A2/C1 简洁/进阶双模式 → P4 C 类 Windows 原生 → P5 B6/B7/A3 harness 能力 → P6 公开 Release + 上游回馈**。

## 5. 已完成批次

### desktop.11（工作基线导入，commit b650286）

- 渲染导出宿主契约 `data-od-exporting`（Host.cs 属性优先+旧兜底）、open-elsewhere 自愈等待（3s×25 自动重连）、失败卡片 Escape 出口、窗口状态记忆（C3）等已验证。
- B1 模型网关失败无限重发已修复（`patches/agent-gateway-terminal-failure.patch`）：502 重发风暴 → 终态失败 1 次请求即止 + UI 出口。
- 首个九章全量实录 mp4 交付（desktop11-full-journey.mp4）。

### desktop.12 批：P1 基线推进 0.1.5（9db7837 → 9f52f53）✅ 全绿收官

**做了什么**：
- 上游基线 ddea4d0 → **0.1.5（8584cc9，#400）**：吸收 #413 下载页、#415 分组工具栏、#416 再生成 busy、#417 会话边界（unload 释放租约 + 409 Reconnect/Back 出口）等改进；识别出上游「节点重叠」缺陷仍在（canvas-placement 补丁价值所在）。
- 六张补丁重生成并重排：canvas-placement（手工移植 useWorkspaceInteraction 三处）→ bundled-agent → timeline-output-dismiss → agent-gateway-terminal-failure → export-signal-contract → open-elsewhere-autoretry。
- export-signal-contract 与 #397 `desktop.ts` 双计数**合并为单一引用计数**：属性按计数翻转 + 桥按调用推送（上游 desktop.test.ts 语义保持）。
- 验证：上游 npm test **944/944** 全绿、build + check:i18n（3265 keys）通过、本仓库 23 项 unittest 全绿、package.py 四集成点逐一验证；desktop/VERSION=**0.1.5-desktop.12**。

**canvas 车道排障（讨论重点）**：
- CI（push 9db7837）：Windows x64 装机冒烟 ✅11m24s / checks ✅ / verify (canvas) ❌（唯一失败，无 `::error::` 注解=非断言失败）。
- 本地复现定位：`export_signal_contract` 测试的假桥只实现 `setExporting`，而 0.1.5 creationClient 必调 `registerSession`——workspace 崩在采样前，即那句不透明的 "exit code 1"。修（aa3e5ff）：假桥补全 DesktopBridge 四方法；桥断言改为按调用推送语义下的不变量「**恰好一条闭合边且在末尾**」（N 个布尔括号位点 → `[true×(2N−1),false]`，实测 `[t,t,t,f]`）。
- **重要环境教训（假回归）**：本地长跑夹具会被杀死的测试浏览器污染（会话表/上传租约 → uploads 409「item changed or is busy」），造成 8 个套件工作流假失败、甚至「未引用的新文件也致失败」的荒谬二分结果。**全新夹具 + 全补丁两跑两过**；判回归前必须先重启夹具。系统缺失 ffmpeg/ffprobe/python 另需 ~/bin 垫片（ffmpeg-static 被墙 → @ffmpeg-installer）。
- 修复后 CI 复跑（aa3e5ff）：**三条 lane 全绿**（44904707489 Windows 装机 / 44904707444 canvas 五车道 / 44904707457 checks）。
- **desktop.12 真机全量实录 PASS**：`delivery/desktop12-full-journey.mp4`（九章：中英欢迎→文本/素材/参考/配角→时间线→真实 MP4 渲染+Host 契约遮罩→失败卡片 Escape→强杀自愈→中英切换；1500×950 H.264 · 195s · 3.69MB），脚本 `verification/desktop12_full_reel.mjs`，sha256 入 `delivery/SHA256SUMS.txt`。

## 6. 关键技术结论（后续复用）

1. **测试假桥必须实现完整 DesktopBridge**（registerSession/setLocale/showMore/setExporting）——partial 对象 + `?.` 链仍会 "is not a function" 崩。
2. **导出信号语义**：`desktopExportStarted()=exportStarted()` 单一引用计数；publish()=属性按计数翻转；notifyBridge()=按调用推送；Host.cs 读 `data-od-exporting` 优先。
3. **上传/保存 409 三来源**：无会话 / 会话过期（需 keepalive） / 工程目录外移；「The item changed or is busy」=服务端 ProjectError(409) 通用文案。
4. **B2 根因（#321）**：Agent 复用界面编辑会话，切换项目后会话归属改变，无法通过 A 的租约校验 → 需为 Agent 运行单独持有租约（续期、结束释放、保留原窗口归属）。
5. **证据方法论**：CDP screencast→MediaRecorder avc1 直录真帧；reel 编解码回退链 mp4 avc1→webm vp9；reel 需隔离夹具（`/api/creation-test-health` isolated:true）。
6. **补丁移植**：`git apply --3way` 失败即弃用，冲突块手工移植（python3 + count==1 断言）；补丁重生成后必须从 `git show HEAD:patches/*.patch` 移植 `#` 头注释。
7. **上游 0.1.5 已知边界**：空时间线预检数百 ms 窗口内退出不报「导出1」；「Fit all 静默 no-op」候选缺陷；节点重叠缺陷仍在。

## 7. 竞品观察摘要（详见 competitor-and-feature-baseline.md）

即梦（无限画布 2.0、故事魔方）、TapNow（Tapflow + 执行导演 Agent）、Pixo、OpenCode（Plan/Build 只读、并行会话、MCP/LSP、统一后台——harness 标杆）等 F1–F14 观察已归档，持续吸收进改进候选（backlog ~50 项 S/D/Q：A3 服务端只读、B6 变更审阅、B7 一键撤销、B9 任务中心等）。

## 8. 下一步（按 roadmap，未完待续）

1. **P2 B2 租约根治**（上游 #321）：Agent 独立租约 + 续期 + 崩溃释放，A1 的依赖项；动 `creation_projects.py` 会话表前须专门设计与测试。
2. **P3** A1/A2/C1：简洁/进阶双模式（A1 默认参数已定，见 a1-dual-mode-spec.md）。
3. **P4** C 类 Windows 原生能力；**P5** B6/B7/A3 harness 能力；**P6** 公开 Release（稳定频道 + 下载页 + SmartScreen/SHA-256 明示）+ 上游回馈。

—— 记录截止：desktop.12 P1 全绿收官（CI 44904707489/44904707444/44904707457）。

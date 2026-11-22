# 桌面端改进进度（真实状态）

按 [改进候选 Backlog](improvement-backlog.md) 逐项记录。状态只使用以下含义：

- **已验证**：代码已合入，并在 GitHub `windows-2022` 真机流水线（或本地运行时）通过对应检查。
- **已实现，待验证**：代码已合入，但缺少对应的真机或运行时检查。
- **已分析，未实现**：根因或设计已确定，尚未改代码。
- **未开始**。

| 编号 | 项目 | 状态 | 证据 / 说明 |
| --- | --- | --- | --- |
| desktop.12-2 | canvas 车道修复（aa3e5ff）+ desktop.12 全量实录 | 已验证（本地全链 + Windows CI 三 lane 全绿） | CI 9db7837 三车道：Windows x64 ✅11m24s（装机冒烟过）/ checks ✅ / verify (canvas) ❌ 唯一失败（job 136834256391，无 ::error:: 注解=非断言失败）。本地复现定位 export_signal_contract：假桥缺 registerSession（0.1.5 creationClient 必调），崩在采样前→补全 DesktopBridge 四方法；断言按「按调用推送」语义改为不变量「恰好一条闭合边且在末尾」（[t,t,t,f]）。修后 PASS。**环境教训**：长跑夹具被杀死的浏览器污染（uploads 409 租约假失败、荒谬二分），全新夹具+全补丁两跑两过；判回归须先重启夹具。实录 PASS：`delivery/desktop12-full-journey.mp4`（九章 1500×950 H.264 195s，sha256 入 SHA256SUMS.txt），脚本 `verification/desktop12_full_reel.mjs`。CI 复跑 aa3e5ff：Windows x64 ✅ / checks ✅ / canvas 五车道 ✅（verify (canvas) 转绿） |
| desktop.12-1 | 基线推进 0.1.5（8584cc9）+ 补丁链重排/去重 | 已验证（Windows CI 44904707489 装机冒烟过 + 44904707444 五车道全绿 + 44904707457） | 《基线推进评估》见 baseline-0.1.5-assessment.md。六张补丁重生成：canvas-placement 手工移植 useWorkspaceInteraction 三处；export-signal-contract 与 #397 `desktop.ts` 双计数合并为单一引用计数（属性翻转 + 桥按调用推送，上游 desktop.test.ts 语义保持）；open-elsewhere 与上游 Reconnect/Back 出口、unload 释放互补共存；bundled-agent 判定为 Windows 专属隔离层保留。上游 `npm test` 944/944 全绿、`npm run build`+`check:i18n`（3265 keys）通过、本仓库 23 项 unittest 全绿、package.py 四个集成点逐一验证并编译检查 |
| desktop.11-1 | 渲染导出宿主契约 `data-od-exporting`（PR #397 取信号弃桥） | 已验证（Linux 真浏览器旅程 + 静态守卫） | `verification/export_signal_contract.mjs` PASS（真实渲染 44 采样 8 点命中、桥 `[true,false]`、失败路径归零）；`tests/test_export_signal_contract.py`；`desktop/Host.cs` 属性优先+旧兜底；全量实录第 6 章 `delivery/desktop11-full-journey.mp4`。Windows runner 复验待下轮 windows.yml |
| desktop.11-2 | 「他窗占用」自愈等待（open-elsewhere，3s×25 自动重连） | 已验证（Linux 真浏览器旅程） | `verification/open_elsewhere_autoretry.mjs` PASS（等待态「重新连接/返回首页」双出口、零点击自动进入）；`tests/test_transport.py` 7 项（SessionJournal 崩溃释放）；全量实录第 8 章。租约语义零改动 |
| desktop.11-3 | 重试输出失败卡 Escape 可关（失败态出口纪律收尾） | 已验证 | `verification/timeline_output_dismiss.mjs` PASS（failed card closable） |
| desktop.11-4 | 真机全量功能模拟（用户要求：每批改进后 mp4 展示） | 已交付 | `delivery/desktop11-full-journey.mp4`（H.264，九章：双语欢迎、画布入口、文本编辑、素材上传、时间线导入、真实渲染+导出信号、失败态出口、强杀自愈、中英切换） |
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

- **窗口关闭后租约不释放**：浏览器关闭时没有调用 `DELETE /api/creation/sessions/{id}`，会话残留在 `sessions` 表中，其它窗口打开同一工程会显示"This project is open in another window"，直到租约过期。这与 B2 属于同一类问题，应在 B2 的租约设计中一并处理（页面卸载时释放，或心跳超时更短）。**desktop.11 已解决其体验半边**：等租约过期期间改为自愈等待+自动进入（desktop.11-2），并由 SessionJournal 在崩溃重启时释放残留会话；「页面卸载时调用 DELETE」的根治仍归 B2。
- **上游缺陷候选：Fit all 静默 no-op**（desktop.11 发现）：渲染完成后 ⇧Shift+1 与缩放菜单 Fit all 完全不移动相机（`flow.fitView({nodes})` 路径，@xyflow/react 12.12.0），zoomTo 正常；建议提上游 issue，详见 [DESKTOP-PARITY-REVIEW.md](../DESKTOP-PARITY-REVIEW.md) §0.1。
- **沙箱缺中文字体**：无头 Chromium 下中文显示为方框，演示视频中的中文不可读。真机验证不受影响。

## 收尾（用户指示：写入项目后结束）

- 当前所有代码、补丁、验证脚本与视频已提交到 `arena/5fcfdf0e-for-opendirectore-in-windows`。
- A1 方案写入 `a1-dual-mode-spec.md`，包括用户确认的两种模式、切换方式、依赖与待决问题。
- 未完成项：B2、A1–A3、B6/B7、C5、C11、D2/D3，以及备选清单中其余约 50 项。
- 未完成的验证：B1 在 Windows 真机上的 UI 演示；C9 的真机验证；各项改进的真机 mp4。

## desktop.13 · B2 进展（本轮）

- 代码与测试：`a104763`（运行租约、补丁、6 个 pytest 用例）。从 `/tmp` 对「基线 + 六个补丁 + B2」复验：6/6 租约测试通过，42/42 助手与创建 API 测试通过，清单检查退出 0。
- 上游全量 pytest（已装入 ffmpeg 工具链）：21 失败、2848 通过，失败集合与基线逐项一致。
- 旅程：`agent_lease_switch.mjs`（切换项目，写入落地）、`agent_lease_second_window.mjs`（多窗口冲突 → 自愈进入）、`agent_lease_reel.mjs`（录屏）。
- 录屏修复（`verification/reel.mjs`）：浏览器内编码按挂钟计时，28 秒的录像被拉长到 73 秒，且突发帧被补到 90 ms；现在有 ffmpeg 时按真实帧间隔编码（沙箱），无 ffmpeg 时仍走浏览器编码（Windows 默认）。
- 演示视频：`delivery/desktop13-agent-lease.mp4`（已入库，SHA256SUMS 已登记）。
- 沙箱闸门：隔离车道 25 项中，`large video import`、`timeline node output`、`reference reconnect`、`local output delivery`、`structured editors` 在基线树上同样失败（沙箱环境问题，非 B2 引入）。`canvas text Markdown` 在修复树上独立运行两次均通过，车道内的失败判定为偶发。`timeline workflow` 需使用虚拟环境的 Python 才能通过。

## desktop.14 · 第二轮执行（2026-11-22，分支 arena/1d7b4478）

依据 [plan-2026-11-22.md](plan-2026-11-22.md)。用户已确认：起点 dd80424c、简洁模式默认「系统预设 + 可改抽屉」、先发 desktop.14 草稿。

| 编号 | 项目 | 状态 | 证据 / 说明 |
| --- | --- | --- | --- |
| A-1a | 强杀后租约在重启时释放（SessionJournal，真实 `desktop/service.py`） | 已验证（服务级集成） | `tests/test_desktop_crash_recovery.py`：子进程启动真实服务，桌面 Host/Origin/令牌头访问；第一会话占用时第二会话被拒（负对照）；SIGKILL → 重启 → 第二会话直接打开（200）；journal 不再含旧会话。 |
| A-1b | 强杀后回合显示「回复已中断」（UI） | **未验证，发现缺口** | 沙箱浏览器旅程（`creation_server.py` 夹具）中，强杀后重启的是夹具进程，它不执行 SessionJournal，因此工程仍显示「其他窗口占用，约 72 秒自动进入」。这是夹具与桌面路径的差异，不是桌面端缺陷；但它说明 UI 级旅程必须跑在 desktop service 上（需要桌面来源头的测试通道），此项留待下一步。前端的 `restoreConversation` 已把无活动回合的 streaming 还原为 interrupted，待 UI 旅程确认。 |
| — | 静态守卫修正 | 已修复 | `tests/test_export_signal_contract.py` 的补丁链期望补上 B2 的 `agent-run-lease.patch`（B2 提交时遗漏，导致 24 项中 1 项红）。`.github/workflows/canvas.yml` 两处 `git apply` 补上 `agent-gateway-terminal-failure.patch` 与 `agent-run-lease.patch`，与 `scripts/package.py` 链一致。 |

沙箱复验（Linux，上游 8584cc9 + 七张补丁按 package.py 顺序应用）：
- `open_elsewhere_autoretry.mjs` PASS（零点击自动进入）
- `agent_lease_switch.mjs` PASS（写入 `applied`，回复 `complete`，landed）
- `agent_lease_second_window.mjs` PASS（窗口 2 等待态后自动进入，写入 `applied`）
- `python -m unittest discover -s tests`：24 项全绿。

环境要点（沙箱）：Chromium 131 取自 `@sparticuz/chromium` 包（libnss 等依赖由其 `al2`/`al2023` 包解出，`LD_LIBRARY_PATH` 仅给浏览器，不能全局设置，否则系统 sqlite3 失败）；ffmpeg 9.0.2 取自 PyPI `imageio-ffmpeg`，ffprobe 取自 npm `@ffprobe-installer/ffprobe`；Playwright 驱动为 `playwright-core@1.58.2`（与 canvas.yml 同版本）。夹具必须用固定 `--root` 才能跨重启保留数据。

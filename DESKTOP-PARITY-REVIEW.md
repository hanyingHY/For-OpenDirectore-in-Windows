# 网页版 ⇄ Windows 版：体验对照、差异清单与迭代建议

> 面向 RFC #362（D1/D3）的评审文档。基线：上游 `ThinkFlowLab/OpenDirector@ab3f0585`（0.1.4，2026-11-19 的 main）；
> 桌面侧基线：本仓库 `desktop.9`（WebView2 + 打包 Python），本次修复「时间线失败卡无法关闭」。
> 本文所有「网页版」结论都来自对锁定基线源码的逐行核对与在沙箱中实际运行的上游 Web 应用；
> 「Windows 版」结论来自宿主/安装器源码、CI 装机验收录像与用户提供的截图。物理 Win10/Win11 桌面机上仍需按
> [WINDOWS-AUDIT.md](WINDOWS-AUDIT.md) 的清单逐项人工复验的条目已单独标注。

---

## 0. desktop.9：时间线「失败卡」关闭问题（本次修复）

### 症状与根因

用户截图：空时间线点「导出视频」后，画布上出现失败卡「请先向时间线加入素材。」，只有「重试输出」，
无法关闭。逐行核对后确认这是 **上游 UI 的缺陷，不是 Windows 适配引入的**——网页版同样卡死：

1. 失败卡（`TimelinePendingVideo`，`src/canvas/TimelineOutput.tsx`）是一个 **虚拟覆盖层节点**：
   `selectable:false, draggable:false, deletable:false, focusable:false`。选中不了 → `Delete` 删不掉，
   焦点进不去 → `Esc` 无从谈起，双击/F2/右键也被 capture 掉了（防误改名）。
2. 「取消合成」按钮只在 `rendering/publishing` 阶段存在；`cancel()` 也只中断 `rendering`。
   失败态（`failed`）没有任何一条路径把 state 置空：
   只有换工程、或 **删掉来源时间线节点** 才会顺带清掉它。
3. 「重试输出」对「时间线为空」这条错误永远是同一个错——点一次失败一次，形成事实上的死角。
4. 附带伤害：发布失败（`CreationCommandError`）时挂起的 `pending` 会 **阻塞其它时间线的导出**
   （`blockedItemId`），失败卡关不掉 → 其它时间线也导不了，直到重试成功。
5. 时间线为空时，编辑器文档在**本次会话内**是新的，画布节点上的缓存副本却可能是旧的——
   上游在 `run()` 里先 setState 再读源，失败卡从「不该存在的请求」开始就出现了。

### 修复（patches/timeline-output-dismiss.patch）

- **空时间线不再产生失败卡**：`run()` 在真正进入编码前用**已保存的编辑器文档**判定
  `timelineDuration(timeline) <= 0`，原地用工程已有的 toast（`errors.render.timelineEmpty`，
  即「请先向时间线加入素材。」）回答，`setState(null)`，画布上不出现任何覆盖层。
- **失败卡有三条出路**：`编辑时间线`（`onEdit` 直接打开来源时间线的编辑器修源头）、
  `重试输出`、以及真正的关闭按钮（`CanvasIcon close`，`aria-label`/`title` 双语「关闭卡片/Close card」，
  可键盘聚焦，`focus-visible` 有紫色描边，悬停变红色 ×）。
- `useTimelineOutput` 新增 `dismiss()`：中断在途渲染、丢弃缓存的渲染结果、清空覆盖层。
  覆盖层是虚拟节点，`timelinePublication` 之前不落库 → 关闭即无痕，不留孤儿视频节点。
- 关闭同时清掉 `pending`，**解除了第 4 点的连带阻塞**；错误文本 `user-select: text`，可以复制排查。
- 「发布中」按钮保持原样（禁用取消），避免与发布命令竞态——这是上游刻意的设计，没有动。
- 「重试复用已渲染片段」的原语义保留：不点关闭、直接点重试，仍然跳过重渲染只补发布。
- CSS 全部加在 `timeline-output.css` 既有类旁，不改节点框架；`Host.cs` 的退出确认用
  `.cw-timeline-pending:not(:has(.cw-timeline-pending-error))` 区分「正在渲染」与「失败卡」，
  类名未改 → 行为不变。

### 验证

- 网页版回归：`verification/timeline_output_dismiss.mjs`（六段旅程）挂进 canvas 车道：
  空时间线 → 工具栏导出 → **只有 toast、无卡片、后端无写入**；4096×4096（H.264 level 上限，
  确定性失败）→ 失败卡三键齐全、`aria-label` 正确；`编辑时间线` 打开编辑器；关闭 → 无孤儿 video、
  无卡死引用（第三次尝试仍能进卡再关）；第二条时间线同样被拒、可重复。
- 装机验收：`scripts/smoke.ps1` 在 **真实安装版 WebView2 窗口** 里跑同一场景
  （`verification/render.mjs` 断言 + `delivery/windows-timeline-failed.png` 证据帧），
  并新设 **专用录像 `delivery/windows-timeline-dismiss.mp4`**（CI 产物），随后继续
  「导入 640×400 时间线 → 渲染 → ffprobe 校验」链路，证明关闭后钩子状态完全释放。
- `tsc --noEmit`、`npm test`（838 通过）、`npm run build` 全绿；补丁按 `package.py` 顺序
  （placement → agent → dismiss）在纯净上游树上演练可干净套用。

---

## 1. 我是如何做对照的（方法）

- 把锁定基线（`d05a56d`）的上游 **原样跑起来**（同一 `package-lock.json`、同一 Python 服务、
  不套任何桌面壳），在沙箱里以生产构建 + API 的方式实际进入画布、创建时间线、触发导出失败路径；
  并留了一份 **未打补丁** 的同源实例做 A/B。桌面壳（`Host.cs`/`service.py`/NSIS/更新器）逐行读源码，
  对照 `desktop.7` 的装机录像与你的截图推断 Windows 侧行为。
- 结论口径：UI 层「两个版本」本就是 **同一份 React bundle**（打包时上游树上只多了 3 个补丁），
  所以体验差异 ≈ 宿主环境差异（WebView2/窗口/生命周期）+ 桌面壳新增行为，而不是界面差异。
  这符合「完全等同原项目」的目标，也意味着 **修复应尽量做进补丁而不是 fork 里另写 UI**。

## 2. 体验差异矩阵（按用户旅程）

图例：✓ 等同（且已验证或有测试） · △ 有意为之的桌面差异（文档已解释） · ⚠ 需要跟进的差距 · ✗ 缺陷

| # | 旅程环节 | 网页版 | Windows 版 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | 打开即用 | 要自备 Node/Python/服务器环境 | 双击安装，随包 CPython/FFmpeg/OpenCode/MinGit | ✓（交付目标本身） |
| 2 | 创建项目/画布操作/素材导入 | 浏览器标签页 | 同 bundle，同一 `~/.opendirector` 数据根 | ✓ |
| 3 | 空时间线导出失败 | 失败卡无法关闭（同一缺陷） | 同一缺陷 → desktop.9 已修（拒绝 + 三键） | ✓（修复后） |
| 4 | 导出/渲染进行中关页面 | **无 beforeunload 守卫**，直接丢任务 | ×隐藏到托盘，退出需确认且枚举 Agent/生成/导出计数 | ✓（桌面比网页更防误丢，网页反而值得借鉴） |
| 5 | 渲染期间窗口可见性 | 后台标签被节流，渲染变慢 | 隐藏到托盘后同样可能被节流（README 已声明「导出需存活渲染器」） | ⚠（见 §6.1 离屏渲染） |
| 6 | 文件保存/下载 | 浏览器默认下载目录、`chrome://downloads` 可见 | WebView2 默认「另存为」弹窗；无下载管理入口 | ⚠（见 §6.3） |
| 7 | 右键上下文 | 浏览器菜单 | **默认浏览器菜单全开**（重新加载/打印/查看源/检查；DevTools 默认可用） | ⚠（见 §6.2） |
| 8 | 页面缩放/状态栏 | 浏览器地址栏天然存在 | 状态栏（悬停显示 URL）、Ctrl+滚轮页面缩放仍开启，与画布自身 zoom 叠加 | ⚠（同上） |
| 9 | 多窗口/多会话 | 多标签共享同一后端；409 锁 | 子窗口（NewWindowRequested→原生多窗）+ 同一 409 锁 | ✓（升级：真·原生窗口） |
| 10 | IME/键盘 | 浏览器原生 | 同 Chromium 内核；Alt+Enter/Ctrl+Enter/Shift+1 等快捷键无浏览器冲突 | ✓（Win 机 IME 候选窗定位建议实机复验） |
| 11 | 高 DPI | 浏览器处理 per-monitor | `SetProcessDPIAware()`（仅 System-aware），混合 DPI 多屏会糊 | ⚠（见 §6.4） |
| 12 | 窗口记忆 | 无此概念 | 固定 1440×900 居中启动，不记忆尺寸/位置 | ⚠（见 §6.4） |
| 13 | 崩溃恢复 | 刷新即可；租约 60s | Job Object 兜底杀进程树；重启唤起同一窗口数据；租约同 60s | ✓ |
| 14 | 模型配置与密钥 | 后端按用户存盘 | 同一文件；桌面另加 DPAPI 会话凭据、任意本机进程 403 | ✓ + 更强隔离（有意差异） |
| 15 | CLI/工程互操作 | 无 | App Paths 注册 `OpenDirector-CLI.exe`，GUI/CLI 同一把锁 | ✓（桌面独有） |
| 16 | 更新 | 永远是服务器上的最新版 | Sigstore 校验 + 12h 后台检查 + 确认式重启 | △（差异合理；失败面已测） |
| 17 | 卸载 | 删文件夹 | 卸载保留工程/凭据/CLI 注册；运行中拒绝（exit 2） | ✓（语义正确） |
| 18 | SmartScreen/来源 | HTTPS 站点 | 无 Authenticode，README 教核对 SHA-256 | ⚠（发行前决策，见 §7） |
## 3. 「失败/卡住」状态盘点（网页版共有的生成工艺问题）

这次「关不掉的失败卡」不是孤例，值得做成一个 **统一的失败呈现规范**：

| 状态 | 现状 | 是否可脱困 | 建议 |
| --- | --- | --- | --- |
| 时间线失败卡 | desktop.9 前只有重试 | ✗ → ✓（已修） | — |
| 发布被 `blockedItemId` 阻塞 | 其它时间线导出按钮禁用 + `otherPending` 提示 | 间接（重试成功后恢复） | ✓ desktop.9 的关闭可立即解除 |
| 图像/视频/音频节点生成失败 | 节点是真实节点，可删除/重试，错误在卡内 | ✓ | 失败文案统一化（见下） |
| 后端 503 / 服务掉线 | `desktop-error-contract.patch` 已给双语修复指引（日志路径） | ✓ | 保持 |
| WebCodecs 不可用（N 版 Windows 无媒体包） | 渲染中途抛原始错误文本 | 能关（desktop.9 后） | 预检 `VideoEncoder.isConfigSupported` + 「装 Media Feature Pack」双语指引 |
| 渲染到一半宿主被杀 | 状态归零，无「上次被中断」标记 | 重开手动重来 | 见 §4.1 |

**规范建议（可提上游）**：一切「进行中卡片」必须满足三条——① 必有出口（成功→产物、失败→重试+关闭、
取消→还原）；② 关闭即释放全部互斥（如 `blockedItemId`）；③ 错误文本可复制、含可行动下一步。
本次补丁已经满足，建议把 `TimelineOutput.tsx` 的模式回给上游做组件级约束（配一个 lint/测试守卫：
`failed` 相必须渲染带 `dismiss` 的按钮行）。

## 4. PR #397 深度解读：哪些可借鉴，哪些已过时

上游 [PR #397](https://github.com/ThinkFlowLab/OpenDirector/pull/397)（`feat/desktop-host`，仍 OPEN，+6465/-141）
是官方路线的桌面壳：**Electron + 打包 Python Host**，与我们的 **WebView2 + 打包 Python** 是同一问题的两个答案。
它实现 RFC #362 的 D1/D2/D3（应用、macOS、Windows 分发）并带 Desktop Release CI。逐文件读完 7865 行 diff 后的结论：

### 4.1 已经不用借鉴的（上游 main 已吸收或我们已有等价物）

| PR #397 的做法 | 本仓库现状 |
| --- | --- |
| 示例画布经本地 Host 下载 + 进度 UI（`exampleCatalog/exampleDownload/ExampleCanvasDialog`） | **上游 `ab3f0585` 已原生实现**（`src/canvas/workspace/example/` 全套：目录、下载、进度、取消、重试、`exampleUrlAllowed` 白名单、`sha256` 校验、zip-wrapper 解包）——安装版直接继承，无需补丁 |
| 退出时检查进行中任务、释放编辑会话（`main.mjs` + `desktop.py`） | `Host.cs` 的托盘退出确认 + `/__desktop/activity` 计数早已覆盖，且经 `quit.ps1` 实机验证 |
| 示例画布的「可取消下载/失败重试/错误分类」三件套 | 与本补丁同一条设计规范（见 §3 规范建议），上游实现得比 PR 更完整 |
| 安装器 + SHA-256 + 双语 UI | NSIS 双语安装器、`zh-CN`/`en-US` 全量目录、版本资源齐备 |

### 4.2 可借鉴、本轮评估后**暂不**采纳的（记录理由，留待 desktop.10）

| PR #397 的做法 | 评估 | 不采纳的理由 |
| --- | --- | --- |
| `DesktopSidebar.tsx` 可折叠项目侧栏（含开闭状态持久化、双语键、saveFailed 提示） | 真实价值：多项目切换比「切换项目」菜单快 | 是对上游 `WorkspaceView` 的大面积 UI 改动；我们要么等上游合并（它的价值上游也会想要），要么进 desktop.10 单独验证。本轮的验证预算应该全部花在失败卡修复的实机证据上 |
| `projectDisplayName.ts` + `defaultNameIndex`（首个工程自动命名按语言显示，改名保真） | 真实价值：中文界面不再出现「Untitled project (2)」 | 需要**跨栈**改动：contract schema（`project.py` 字段）、`creation_catalog/projects.py`、`generated.ts` 再生成、`model.ts`、`ProjectSelector`、双语目录、多组测试。作为第 5 个补丁进入本轮会让所有补丁锚点重新对齐，风险/收益不成比例。已验证 PR 的补丁锚点与 `ab3f0585` 冲突（`ProjectSelector.tsx` 上游已变），需要手工移植 |
| `src/desktop.ts` 渲染器→宿主桥（`setExporting/registerSession/setLocale`） | 设计优雅：导出状态从「宿主轮询」变成「渲染器主动上报」 | 我们的宿主用 `/__desktop/activity` 计数端点解决同一问题，已被 `smoke.ps1` 的退出确认链路实测；加 JS 桥意味着 WebView2 `AddScriptToExecuteOnDocumentCreated` + 消息过滤 + 上游 UI 补丁，改动面大。**理念保留**：如果 desktop.10 做托盘导出进度环（§4.1），这个桥是更精确的数据源 |
| `smoke-window.mjs` 三次冒烟启动、安装即冒烟 | 我们已有等价物：`smoke.ps1` 的 create/reopen 两相 + 单实例拉起 + 托盘/窗口关闭路径 | 无增量价值 |
| Electron 自动更新、菜单、command.mjs | 架构不同 | 我们是 WebView2 + Sigstore 清单 + `update.py`，路线已验证，不迁移 |

### 4.3 反向借鉴：PR #397 里值得抄的**测试纪律**

PR 的 `tests/desktop.test.mjs`、`packaged-host.test.mjs`、`bilingual_defaults.mjs` 有两条纪律值得学：
1. **「宿主崩溃 ≠ UI 问题」的分层断言**——先证明 Python Host 起来了，再断言 UI；我们的 `smoke.ps1`
   已经这么做（`desktop.log` readiness → CDP attach），可以补的是把「分层」写进失败输出的 `::warning`，本次不改。
2. **双语默认值回归**——切语言后检查历史列表、保留用户自定义名。这条已经覆盖在 five-lane 的
   `check:i18n` 与浏览器套件里，等 sidebar/default-name 若被采纳时照抄其断言结构。

### 4.4 给上游的建议（基于两个桌面壳的对比）

- PR #397 的 Electron 方案与本仓库的 WebView2 方案**都依赖**「失败卡可关闭」这类 UI 契约。
  本补丁是干净 `git diff`，可直接转上游 PR；两个壳都受益（Electron 壳的 `smoke-window.mjs`
  同样会被未关闭的失败卡卡住截图断言）。
- 上游在 `ab3f0585` 已实现示例画布下载（正是 PR #397 的一部分目标），说明「桌面壳的需求 → 上游 UI」
  这条路走得通——失败卡修复也应走同一条路，而不是留在任何一家的 fork 里。

---

## 5. 同类产品对照：失败与空状态的行业惯例

调研对象：即梦（剪映系，国内头部）、TapNow（agent 驱动的新一代平台）、以及通用的 AI 视频任务状态模型。

| 产品/来源 | 失败时的做法 | 对本项目的启示 |
| --- | --- | --- |
| 即梦（图片/视频生成） | 「重新生成」是主操作；失败分三类提示（提示词超长/审核拦截/网络限流）；**但网页端在生成失败或卡住时的官方建议仍是「强制刷新」**，视频卡 99% 也靠刷新解 | 行业头部同样存在「失败无出口 → 刷新兜底」的死角。本补丁的三键出路 + 原地 toast 拒绝，目标就是让「刷新/换工程」不再是唯一逃生门 |
| TapNow（agent 生成） | 失败明确标注「未消耗积分」；agent 自动**换模型重试**而非死循环重试；失败分类 Failed/Cancelled/Rejected 各有处置 | 失败信息要**可行动**：告诉用户原因类别与下一步。本补丁的 `编辑时间线` 就是「换一条路」的短路径；错误文本可复制对应「带着信息去找支持」 |
| 通用任务状态模型（Pending/Processing/Completed/Partial/Failed/Cancelled/Rejected） | Failed → 重试一次，仍败 → 简化参数 | 与 §3 的规范建议一致：一切进行中卡片 ① 必有出口 ② 关闭释放互斥 ③ 错误可复制含下一步 |

**结论**：本补丁不仅修了一个 bug，而是把时间线导出的失败态对齐到了同类产品的最优实践
（可脱困、可归因、可行动），并且比即梦的「刷新兜底」更主动。

---

## 6. desktop.10 候选改进（Windows 侧，代码级方案都已核对可行）

### 6.1 导出与窗口存活解耦（最大的体验差）
现状：MP4 编码发生在渲染器（WebView2 页面）里，README 明确要求「导出时保持应用运行」；隐藏/最小化后
可能被系统节流。方案对比：
1. **离屏窗口继续渲染（小改）**：渲染开始时若主窗被隐藏，宿主创建隐藏的 `WebView2` 子窗（同一 origin）
   接管渲染上下文；或简单粗暴地在导出期间给主窗持有 `PowerCreateRequest(POWER_REQUEST)`（防系统睡眠）。
2. **进度可见性**：导出中托盘图标显示进度环（`NotifyIcon` 换帧），完成/失败弹 toast
   （宿主已有 `/__desktop/activity` 计数接入点 + `Updates` 已有 toast 通道，加一个 `ExportState` 监听即可；
   PR #397 的 `desktop.ts` 桥是更精确的数据源，见 §5.2）。
3. 长期：把渲染移入打包 Python + 捆绑 FFmpeg（服务端合成）——**不建议**，等于复刻一套第二渲染管线，
   违背「体验完全等同原项目」的第一原则；保持浏览器内 WebCodecs 单一事实源，宿主只负责「别让它死」。

### 6.2 像应用，而不是像网页（设置三项 + 一个菜单）
```csharp
core.Settings.AreDefaultContextMenusEnabled = false;   // 保留「粘贴」等输入框菜单由内核兜底
core.Settings.IsStatusBarEnabled = false;
core.Settings.IsZoomControlEnabled = false;            // 画布有自己的 58% 缩放，页面缩放是干扰项
core.Settings.AreDevToolsEnabled = false;               // 诊断走 desktop.log；排查时可临时开
```
风险：关右键菜单会影响「图片另存为」习惯——用 `DownloadStarting` 统一接管（见 7.3）即可补回。
每项都有真实验收路径（装机冒烟加 2 条断言即可）。

### 6.3 下载体验
`CoreWebView2.DownloadStarting` → 默认目录改 `%USERPROFILE%\Downloads\OpenDirector\`，
完成 toast 附「打开所在文件夹」动作。顺带解决「另存为」打断工作流的问题。
网页版保持浏览器原状——这属于 **桌面增值**，不违背等同原则（等同的是 UI/业务，不是宿主默认值）。

### 6.4 窗口质感
- 改 Per-Monitor V2：无 app.manifest，用 `SetProcessDpiAwarenessContext(DPI_AWARE_PER_MONITOR_V2)` 于
  `Main()` 首行（需 Win10 1703+，与声明的系统版本兼容），混合 DPI 副屏不再模糊；WebView2 自动跟随缩放。
- 记忆窗口位置/尺寸：写 `%LOCALAPPDATA%\OpenDirector\Desktop\window.json`，启动时恢复并钳制到在线显示器
  工作区（防拔屏后窗口丢在外面）。
- 「× 隐藏到托盘」加一次性气泡说明（已有 `Hidden()` 提示，可加「可在设置改为直接退出」的远期选项）。

### 6.5 安装体积（可选组件）
~2GB 里 OpenCode/MinGit/ripgrep 与字体占比可观。NSIS 已支持分段：把「AI Agent 运行环境」
做成可选组件（默认装），纯剪辑用户可减 ~35%。需要在 WINDOWS-AUDIT 的「不包含什么」里同步语义。

### 6.6 来自 PR #397 的候选（详见 §4.2）
- `DesktopSidebar` 可折叠项目侧栏（若上游未合并则作为补丁移植，含双语键与状态持久化）。
- `defaultNameIndex` 本地化首工程自动命名（需跨栈小改 + `generated.ts` 再生成）。
- `desktop.ts` 渲染器→宿主桥（若做托盘导出进度环，用它替代轮询）。

---

## 7. 需要拍板的问题（按优先级）

| # | 问题 | 选项 | 我的倾向 |
| --- | --- | --- | --- |
| D1 | desktop.9 的发布方式 | 只出 CI artifact / 建 draft release 附 EXE+SHA256 / 直接推稳定频道 | 先只出 CI artifact 给验收；推稳定频道前需 §5.4 的上游回贡决策 |
| D2 | §6.2/6.3/6.4 是否进 desktop.10 | 全收 / 只收 7.2+7.3 / 逐项讨论 | 6.2+6.3 先做（改动小、观感提升最大），6.4 的 DPI 需要多屏实机验证再放行 |
| D3 | dismiss 修复是否回贡上游 | PR / 仅 fork 补丁 / 等上游自己修 | PR：这是网页版也中枪的 P1 交互缺陷（PR #397 的 Electron 壳同样会被它卡住）；fork 继续留补丁直到上游合并 |
| D4 | PR #397 的 sidebar / defaultName 何时采纳 | desktop.10 / 等上游 / 不采纳 | sidebar 等上游或 desktop.10；defaultName 需要先解决与 `ab3f0585` 的锚点冲突 |
| D5 | 渲染节流（§6.1） | PowerRequest 保活（小）/ 离屏 WebView（中）/ 暂不做 | 先做 PowerRequest + 托盘进度，离屏方案等装机反馈 |
| D6 | WebCodecs 缺失的指引文案 | 归入失败卡文案（前端）/ 宿主预检（后端探针） | 前端：与双语目录一起维护，桌面壳不掺业务文案 |
| D7 | 签名 | 继续无签名+SHA256 文档 / 申请代码签名证书 | 分发对象若含非技术用户，证书优先级要提上来 |

---

### 附：desktop.9 变更清单（本仓库）

- `patches/timeline-output-dismiss.patch`（沿自 desktop.8，本版增强）：空时间线原地 toast 拒绝；
  失败卡 `编辑时间线` / `重试输出` / 红色 `关闭` 三键；`useTimelineOutput.dismiss()` 释放全部互斥；
  双语键 `timeline.output.dismiss`、`timeline.output.edit`。
- `scripts/package.py`：打包时应用新补丁；上游基线 `d05a56d` → `ab3f0585`。
- `verification/timeline_output_dismiss.mjs` + `.github/workflows/canvas.yml`：网页版六段旅程进 canvas 车道。
- `verification/render.mjs`：装机验收复现「空时间线导出被拒 → 确定性失败卡 → 三键可关 → 关闭后真实渲染」，
  证据帧 `delivery/windows-timeline-failed.png`。
- `scripts/smoke.mjs`：失败卡旅程获得**专用录像** `delivery/windows-timeline-dismiss.mp4`（一次一条 CDP screencast）。
- `desktop/update.py` / `windows.yml`：信任根与签名车道指向本仓库 `main` / 当前桌面工作分支。
- `desktop/VERSION` → `0.1.4-desktop.9`。

# 竞品调研与原版功能基线（Windows 桌面端）

本文档服务于 [RFC #362](https://github.com/ThinkFlowLab/OpenDirector/issues/362) 的 Windows 范围：先确定"原版网页能做什么"（验收基线），再确定"同类产品把哪些体验做得更好"（改进方向）。

- 原版基线：`ThinkFlowLab/OpenDirector` 提交 `ab3f058`（与 `scripts/package.py` 固定的上游一致）。
- 调研日期：2026-11-20。来源见文末，竞品信息多来自第三方评测，结论需以产品实际体验为准。

## 1. 原版功能清单（验收基线）

以下条目来自原版 `docs/guides/user-guide.md`，每条都需要在桌面端通过同样的操作路径验收。

| 编号 | 功能域 | 原版能力 | Windows 桌面端验收要点 |
| --- | --- | --- | --- |
| F1 | 首次进入 | 欢迎页：「Set up models」「Explore first」，中英切换 | 双语切换后无残留另一语言；欢迎页不依赖网络 |
| F2 | 模型连接 | 设置 → Model connections；Provider API / 自托管；Fetch models；Add manually；单模型测试 | 凭据保存在用户目录，不进工程目录 |
| F3 | 项目管理 | 新建、重命名（Enter/Esc）、切换、最近项目恢复、回收站恢复 | 项目目录含中文与空格路径可用 |
| F4 | 画布节点 | 文本/图片/视频/音频/时间线/主体节点；双击创建；右键菜单；撤销重做；框选与多选；自动排列 | 节点落位不重叠（已在 desktop.6 补丁处理） |
| F5 | 素材导入 | 上传按钮、拖放、粘贴、素材库；HEIC/HEIF；原图保留 | 文件管理器拖放到 WebView2 可用 |
| F6 | 生成 | 生成面板选模型、提示词、参数；`@` 引用；连线引用；生成历史；取消；继续检查原任务 | 未知提交状态不重复提交 |
| F7 | 图像/视频/音频编辑 | 裁剪、旋转、调色、图层、文字、形状；视频抽帧/裁剪；AI 扩图、擦除、抠图、放大 | 依赖模型能力，缺失时有提示 |
| F8 | AI 对话 | 右侧 Chat with AI；多会话；历史搜索；停止回复；引用来源卡片；草稿保存 | 窗口隐藏/恢复后会话不丢 |
| F9 | Agent 工具 | Agent 通过同一项目服务写入画布与时间线；CLI 与 GUI 共享项目租约 | 与 GUI 并发写入时的冲突提示 |
| F10 | 时间线 | 排列、起止、速度、音量、文字叠加、字体导入；预览 | 中文字体离线可用（Noto Sans CJK SC） |
| F11 | 导出 | Render MP4（浏览器内编码，需保持页面打开）；JSON / FCPXML / XML+media；可编辑包 `.timeline.zip` | 导出中禁止退出，退出需确认 |
| F12 | 保存与备份 | 「Saved locally」状态；Export canvas JSON；示例画布下载与导入 | 保存失败时的错误可读 |
| F13 | 语音与音乐 | 语音库、克隆音色、音乐模型 | 依赖外部服务 |
| F14 | 故障排查 | 双语错误、日志、诊断 | 启动失败有可执行的提示 |

## 2. 竞品调研

### 2.1 即梦 AI（字节跳动）

- 「无限画布 2.0」（2026 年初全量开放）：文字、参考图、生成结果、视频片段统一管理，拖拽排版，图片可直接转视频。来源：[1]、[2]。
- 画布内编辑：局部重绘、扩图、消除、抠图；数字人与对口型。来源：[2]。
- 「故事魔方」：关键词生成分镜、自动配音、剧情成片的一站式流程；Agent 交互模式。来源：[4]。
- 启示：OpenDirector 已有画布、AI 对话和时间线，但**从一句话到分镜再到成片的引导路径**较弱（原版需要用户自己搭节点）。

### 2.2 TapNow（Tapflow 画布）

- 无限节点画布，节点可为提示词、图片、音频、视频或 3D 场景；节点之间连线，可在画布上切换多个模型对比。来源：[5]、[6]。
- TapNow Agent（"AI 执行导演"）理解每个节点和连接，可按步骤执行，并支持实时反馈调整。来源：[5]。
- 社区 TapTV：公开画布可复刻（remix）。来源：[6]。
- 不足（第三方评测指出）：没有完整时间线剪辑，最终成片常在 Premiere/CapCut 中完成。来源：[7]。
- 启示：OpenDirector 的优势恰恰在"时间线 + 导出 MP4 + 可编辑包"；Windows 桌面端应把这条链路做顺。

### 2.3 Pixo（对比参照）

- 以"一句 brief → 脚本、分镜、生成、剪辑"为主线，用户以审阅为主，不需要搭节点。来源：[7]、[8]。
- 启示：新手路径应提供"引导式创建"，而不是只靠自由画布。

### 2.4 OpenCode（作为"harness"标杆）

- MIT 开源编码 Agent，同一套 agent 核心服务于 TUI、桌面应用（macOS/Windows/Linux beta）和 IDE 扩展。来源：[9]、[10]。
- 关键设计：**Build / Plan 两种模式**（Plan 只读，Tab 切换）；后台子代理；会话并行；AGENTS.md 项目记忆；MCP；LSP；2.0 起所有客户端连接同一个后台服务。来源：[9]、[11]、[12]。
- 桌面端：多会话、diff 视图、拖放文件、"Jump to message"。来源：[10]、[12]。
- 启示：OpenDirector 要在 omni 领域对标"harness"，核心是 **Agent 与 GUI 共享同一后台服务和同一项目状态**，以及可见的计划/执行模式和可中断的后台任务。原版已有 Agent Shell 与 CLI，但桌面端尚未把"计划模式、后台子任务、会话并行、diff 视图"展示出来。

## 3. PR #397（ThinkFlowLab/OpenDirector）可借鉴点

PR #397 为 FayeSpica 的桌面版 Electron 方案，包含：可折叠项目侧栏、平台化窗口控件、终端命令注册、示例画布经本地 Host 下载并显示进度、首个项目名称与默认会话标题的本地化、Desktop Release 工作流（冒烟测试 + 草稿 Release）。

| 借鉴项 | 判断 | 理由 |
| --- | --- | --- |
| 可折叠项目侧栏 | 采用（思路） | 与原版项目切换、最近项目一致，Windows 端在 WebView2 中也可实现 |
| 示例画布下载进度 | 已有（原版已支持 Try example 进度条） | 无需额外改动 |
| 终端命令注册 | 已有（App Paths 注册 `OpenDirector-CLI.exe`） | 不改写系统 PATH，保持现有策略 |
| 双语默认标题、用户自定义名称保留 | 采用 | 符合原版 AGENTS.md 双语规则 |
| Electron 外壳 | 不采用 | 已选择 WebView2 原生宿主，保留现有更小的攻击面 |
| Desktop Release 冒烟测试 | 采用（思路） | 对应现有 `windows.yml` 的 smoke 流程 |

## 4. 改进候选（第一轮）

第二轮扩展的完整候选（约 60 项，含上游 issue/PR 映射、双模式切换评估）见 [改进候选 Backlog](improvement-backlog.md)。以下为第一轮摘要。

按"对标 OpenCode/即梦体验的收益 ÷ 在 Windows 上的可验证性"排序：

1. **引导式首次创建**：空白画布上提供"一句话生成分镜草稿"入口，复用现有 Agent 与 Chat，减少搭节点成本。
2. **计划模式（Plan）与执行模式（Build）切换** 于右侧 AI 面板，对标 OpenCode；只读模式禁止写画布与时间线。
3. **后台任务中心**：生成/渲染/Agent 任务统一显示在托盘与侧栏，退出确认显示真实进行中的任务数。
4. **项目侧栏**（参考 PR #397）：最近项目、重命名、回收站。
5. **Windows 原生体验打磨**：托盘菜单、窗口状态记忆、深浅色跟随系统、键盘快捷键与原版一致。
6. **可观测性**：`desktop.log` 与 Agent 运行记录在界面内可查看。

## 来源

[1] https://ai.aiproducthub.cn/forum-post/2076.html（即梦 AI 功能盘点，2026）
[2] https://www.aitoollab.cn/articles/jimeng-ai-complete-guide-2026/（即梦 AI 教程，2026）
[3] https://zhuanlan.zhihu.com/p/2005040292995293698（AI 画布排行榜，2026）
[4] https://thlm.com/sites/107.html（即梦官网介绍，2026-03）
[5] https://filmora.wondershare.com/video-editor-review/tapnow-ai-review.html（TapNow 评测，2026-07）
[6] https://dreamina.capcut.com/ai-video/tapnow-ai-review（TapNow 评测，2026-05，竞品方发布，需谨慎）
[7] https://pixo.video/blog/tapnow-alternatives（TapNow 替代对比，竞品方发布，需谨慎）
[8] https://pixo.video/alternatives/tapnow（Pixo 对比，竞品方发布，需谨慎）
[9] https://www.explainx.ai/blog/opencode-open-source-ai-coding-agent-guide-2026（OpenCode 指南，2026-10）
[10] https://www.opencode.asia/（OpenCode 桌面端介绍）
[11] https://agents.4geeks.com/agent/opencode（OpenCode 功能矩阵）
[12] https://ai-tldr.dev/tools/opencode/（OpenCode v2.3.0 版本信息，2026-11-13）

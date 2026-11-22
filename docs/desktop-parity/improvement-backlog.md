# 改进候选 Backlog（第二轮，2026-11-20）

本文件扩展 [竞品调研与原版功能基线](competitor-and-feature-baseline.md) 中的 6 项候选，覆盖上游 open issue/PR、OpenCode 桌面端与 harness 设计、同类创作画布（即梦、TapNow、Lovart）以及 Windows 原生体验。

**分层原则**（依据上游 `AGENTS.md`："先修共享服务与组件，再做入口特例"）：
- **S 类（共享）**：改动在上游 Web UI / 后端，桌面端只是消费者。应向上游提交或跟进既有 PR，不在桌面分支里另起一套。
- **D 类（桌面）**：只属于 Windows 宿主（WebView2、托盘、系统通知、文件关联、安装包）。
- **Q 类（质量）**：验收、诊断、发布证据。

**评分**：价值（对标 OpenCode / 即梦体验与用户痛点）与可验证性（能否在 Linux 无头浏览器或 Windows CI 上复现和录屏）各 1–5 分。

## A. 工作方式与信息架构

| 编号 | 候选 | 层 | 价值 | 可验证 | 来源 / 说明 |
| --- | --- | --- | --- | --- | --- |
| A1 | **纯净模式 / 画布模式双模式切换**（见下节评估） | S + D | 5 | 4 | 上游 RFC [#386](https://github.com/ThinkFlowLab/OpenDirector/issues/386)、WIP PR [#380](https://github.com/ThinkFlowLab/OpenDirector/pull/380) |
| A2 | 首次进入的模式选择页（两张预览卡，选后记住） | S | 4 | 5 | RFC #386 第 3 节 |
| A3 | **Plan / Build 执行模式**：Plan 只读，服务端强制禁止写画布与时间线；Build 才允许写 | S | 5 | 4 | OpenCode 核心设计（Tab 切换，Plan 不改文件） |
| A4 | 结果卡片（预览、交给 Agent 修改、打开编辑器、在画布中查看、候选标记） | S | 4 | 4 | RFC #386 第 3 节 |
| A5 | 聊天 ↔ 画布双向定位（"在画布中查看"、画布选中后引用到聊天） | S | 4 | 4 | 上游 #333（聊天链接跳转画布）、PR #389 |
| A6 | 项目素材入口（不发消息即可上传、选素材、新建时间线） | S | 3 | 5 | RFC #386 第 3 节 |

## B. Agent 可靠性与 harness 能力

| 编号 | 候选 | 层 | 价值 | 可验证 | 来源 / 说明 |
| --- | --- | --- | --- | --- | --- |
| B1 | **修复 120 秒首字节超时导致回合永久挂起** | S | 5 | 4 | 上游 [#345](https://github.com/ThinkFlowLab/OpenDirector/issues/345)；慢代理网络在 Windows 上更常见 |
| B2 | **切换项目后 Agent 写入失败** | S | 5 | 4 | 上游 [#321](https://github.com/ThinkFlowLab/OpenDirector/issues/321)；桌面端多项目切换是常见路径 |
| B3 | **运行中插入 / 排队 / 撤回消息**，停滞队列可继续 | S | 5 | 4 | 上游 #379 #381 #383 #384 #385 #403，PR #402 #403 在途 |
| B4 | 停止后编辑并重发上一条用户消息 | S | 3 | 5 | 上游 [#375](https://github.com/ThinkFlowLab/OpenDirector/issues/375) |
| B5 | 会话删除；防止重复空会话 | S | 3 | 5 | 上游 [#247](https://github.com/ThinkFlowLab/OpenDirector/issues/247)、[#246](https://github.com/ThinkFlowLab/OpenDirector/issues/246) |
| B6 | **变更审阅**：Agent 本轮对画布 / 时间线的改动以 diff 列出，可逐条接受、撤销 | S | 5 | 4 | OpenCode "Session changes" 统一 / 并排 diff；Windsurf 一键回滚整个会话 |
| B7 | **一键撤销本轮 Agent 修改**（会话级 undo） | S | 5 | 4 | OpenCode `/undo`；Windsurf 整会话回滚 |
| B8 | **权限策略可视化**：每次写入 / 执行命令前询问；"允许本项目始终"；自动接受开关 | S + D | 4 | 4 | OpenCode permission 与 "Allow always"；Windows 上对 shell 的风险更需要 |
| B9 | 后台子代理与任务中心（生成、渲染、Agent 统一列表） | S | 5 | 4 | OpenCode 2.x 后台子代理；即梦"Agent 模式" |
| B10 | 会话级执行 trace 总览 | S | 3 | 4 | 上游 [#407](https://github.com/ThinkFlowLab/OpenDirector/issues/407) |
| B11 | 项目规则文件（类似 AGENTS.md 的项目记忆，Agent 每轮读取） | S | 4 | 4 | OpenCode AGENTS.md；Windsurf/Cursor rules |
| B12 | 可选的 Cursor Agent harness | S | 2 | 3 | 上游 [#396](https://github.com/ThinkFlowLab/OpenDirector/issues/396) |
| B13 | MCP 服务器接入 | S | 3 | 3 | OpenCode MCP；范围较大，建议排在 B1–B9 之后 |

## C. Windows 原生体验（桌面端）

| 编号 | 候选 | 层 | 价值 | 可验证 | 说明 |
| --- | --- | --- | --- | --- | --- |
| C1 | **模式切换快捷键与托盘菜单**（如 Ctrl+Shift+M），偏好存在桌面配置里，WebView 资料重置也不丢 | D | 4 | 4 | 依赖 A1 |
| C2 | 多项目标签页（一窗口多项目，类似 OpenCode Desktop tabs） | D + S | 4 | 3 | 每个标签绑定独立编辑会话，需要验证租约与锁 |
| C3 | 窗口状态记忆（位置、尺寸、最大化、聊天宽度比例） | D | 3 | 4 | 小改动、用户感知强 |
| C4 | 文件关联：双击 `.canvas`、`.timeline.zip` 直接在应用中打开；右键"用 OpenDirector 打开" | D | 4 | 3 | 需要安装器注册表项，已有 App Paths 经验可复用 |
| C5 | **Windows 通知**：生成或渲染完成时弹出 toast，点击回到对应节点 | D | 5 | 3 | 长任务离开窗口的核心需求；与 B9 任务中心联动 |
| C6 | 任务栏进度（渲染进度条、ITaskbarList3） | D | 3 | 3 | 原生体验加分项 |
| C7 | 系统深浅色跟随，Win11 Mica 材质，标题栏颜色与主题一致 | D | 3 | 3 | Windows 11 才可见，Win10 需降级 |
| C8 | 剪贴板图片与截图直接粘贴成素材（Win+Shift+S 之后 Ctrl+V） | D + S | 4 | 4 | 常见创作路径，WebView2 剪贴板 API 可用 |
| C9 | 缺少 WebView2 时的引导安装，而不是直接失败 | D | 4 | 4 | 桌面端可用性的第一道门槛 |
| C10 | 高 DPI（125%、150%、200%）与分辨率的布局验收 | Q | 4 | 3 | 每次布局改动后都要跑 |
| C11 | MP4 编码能力回退：WebCodecs 不可用时给出明确原因或切换路径 | D + S | 5 | 3 | 原版文档已说明导出依赖浏览器编码能力，Windows 机器差异大 |
| C12 | 长路径、中文路径、OneDrive 同步目录下的工程保存与冲突提示 | D | 5 | 3 | 工程保存失败是最伤用户的类型 |
| C13 | 在资源管理器中显示项目目录 / 用 VS Code 打开项目 | D | 2 | 5 | 交接给外部工具 |
| C14 | 开机自启与后台保持（可选），后台可渲染（如后续支持） | D | 2 | 3 | 原版文档明确：关闭页面会停止渲染 |

## D. 首次体验与教学

| 编号 | 候选 | 层 | 价值 | 可验证 | 来源 / 说明 |
| --- | --- | --- | --- | --- | --- |
| D1 | **无需 API Key 的交互式新手引导**，走完一个真实短片场景 | S | 5 | 4 | 上游 [#225](https://github.com/ThinkFlowLab/OpenDirector/issues/225) |
| D2 | 未配置模型时给出可操作的设置入口 | S | 5 | 5 | 上游 [#370](https://github.com/ThinkFlowLab/OpenDirector/issues/370) |
| D3 | "一句话出分镜草稿"模板（即梦"故事魔方"式），用现有 Agent 与节点完成 | S | 5 | 4 | 即梦故事创作；Pixo 的 brief 驱动 |
| D4 | 视频教程与新手指南，中英文同步 | S | 3 | 3 | 上游 [#373](https://github.com/ThinkFlowLab/OpenDirector/issues/373) |
| D5 | 桌面端首次启动向导：选择工作方式、检查 WebView2、选择工程目录 | D | 4 | 4 | 与 A2、C9 合并实现 |

## E. 创作能力

| 编号 | 候选 | 层 | 价值 | 可验证 | 来源 / 说明 |
| --- | --- | --- | --- | --- | --- |
| E1 | 批量候选网格与采纳（同一提示生成多版，在卡片里比较后采纳） | S | 4 | 4 | Lovart 批量生成；已有结果版本体系 |
| E2 | 分镜视图（storyboard）作为时间线的入口之一 | S | 4 | 3 | 即梦故事魔方；上游 #338 方向 |
| E3 | 视频超分 x2（768p → 2K） | S | 3 | 3 | 上游 [#387](https://github.com/ThinkFlowLab/OpenDirector/issues/387) |
| E4 | 模型采样步数、蒸馏 LoRA 配置 | S | 2 | 3 | 上游 [#388](https://github.com/ThinkFlowLab/OpenDirector/issues/388) |
| E5 | 时间线字幕自动生成（从台词或文本资源） | S | 4 | 4 | 即梦对口型与字幕；原版已有文字叠加 |
| E6 | 多角色一致性替换工作台 | S | 3 | 2 | 上游 C1 系列 #351–#360，已有计划 |
| E7 | 从画布一键生成节点连线（Agent 搭图） | S | 3 | 4 | TapNow Agent 执行图；需要 B6 保证可撤销 |

## F. 质量、观测与发布

| 编号 | 候选 | 层 | 价值 | 可验证 | 说明 |
| --- | --- | --- | --- | --- | --- |
| F1 | 每日人工 UX 冒烟（录屏证据）| Q | 4 | 5 | 上游 [#214](https://github.com/ThinkFlowLab/OpenDirector/issues/214)；本轮录屏流程可直接复用 |
| F2 | Windows 端 WebView2 冒烟与 Playwright 连接（已有 `smoke.ps1`）接入每次 PR | Q | 4 | 4 | 分支已有，需要稳定化 |
| F3 | 诊断包导出（脱敏：去掉密钥、项目路径可选） | D + Q | 4 | 4 | 与 `desktop.log` 配合，便于用户提 issue |
| F4 | 一键备份与恢复项目目录（不含密钥，或加密） | D | 4 | 4 | 原版文档要求用户手动备份 `projects/` |
| F5 | 自动更新渠道与回滚（D5 已在分支，需端到端验证） | D | 4 | 3 | 分支已有 Sigstore 验证流程 |

## 推荐的第一批（建议 6 项）

按"价值 × 可验证性"，并且尽量与上游已有 PR/Issue 对齐，避免重复造轮子：

1. **A1 + A2 + C1**：双模式切换、首次选择页、桌面快捷键与持久化（先在 PR #380 基础上验证，不另起一套 UI）。
2. **B1 + B2**：修复挂起与切换项目写入失败（上游 bug，直接影响 Windows 使用）。
3. **A3**：Plan / Build 执行模式，服务端强制只读。
4. **B6 + B7**：Agent 变更审阅与一键撤销（OpenCode 最有辨识度的能力之一）。
5. **C5 + C9 + C11**：通知、WebView2 引导、导出编码回退（Windows 原生体验的三个关键缺口）。
6. **D2 + D3**：无模型提示入口与"一句话出分镜草稿"（新手路径）。

## 双模式切换：可行性与设计建议

用户提出的"类比桌面端/IDE 或极简/深入开发两种模式自由切换"，与上游 RFC #386 的"纯净模式 / 画布模式"高度一致。评估如下：

**可行性：高。** 上游 RFC 与 WIP PR #380 已覆盖布局层：纯净模式为居中对话，画布模式为左聊右画（约 1:2 或 1:3）；切换保留会话、草稿、引用、画布视角与选中对象；运行中的回复和生成任务继续执行，切换本身不提交业务命令。PR #380 的验证包括 17 组浏览器回归与 Windows 相关的窄屏用例。

**关键设计：把两个"模式"拆成两个独立维度。**

| 维度 | 取值 | 性质 | 由谁决定 |
| --- | --- | --- | --- |
| 布局（你说的"极简 / 深入"） | 纯净模式、画布模式 | 呈现偏好，随时切换 | 用户，浏览器 / 桌面端记忆 |
| 执行（类 OpenCode 的 Plan / Build） | Plan（只读）、Build（可写） | 权限边界，服务端强制 | 用户，且 Plan 下无法写入，与布局无关 |

两者正交：可以在纯净模式下用 Build 直接出片，也可以在画布模式下用 Plan 先规划。把它们混为一个开关会带来两个问题：一是用户以为"极简"就等于"只读"；二是切换布局时意外改变了写入权限。

**桌面端的增量价值（不分叉 UI）：**
- 快捷键与托盘菜单切换；偏好存在桌面配置中，清空 WebView 缓存也不丢。
- 窗口宽度不足时自动收起聊天或降级为纯净模式，并给出说明。
- 切换时若有渲染或导出进行中，只提示状态，不中断。
- 首次启动的模式选择与 D5 向导合并。

**建议的验收方式：** 在无头浏览器中覆盖 1280、1920、2560 宽度与 125%/150% 缩放，分别完成"纯净模式生成 → 切到画布模式核对节点 → Plan 模式尝试写入被拒绝 → Build 写入成功"的完整路径，并录制 MP4。

## 来源

- 上游 Issue / PR：[#386](https://github.com/ThinkFlowLab/OpenDirector/issues/386)、[#380](https://github.com/ThinkFlowLab/OpenDirector/pull/380)、[#345](https://github.com/ThinkFlowLab/OpenDirector/issues/345)、[#321](https://github.com/ThinkFlowLab/OpenDirector/issues/321)、[#375](https://github.com/ThinkFlowLab/OpenDirector/issues/375)、[#247](https://github.com/ThinkFlowLab/OpenDirector/issues/247)、[#246](https://github.com/ThinkFlowLab/OpenDirector/issues/246)、[#225](https://github.com/ThinkFlowLab/OpenDirector/issues/225)、[#370](https://github.com/ThinkFlowLab/OpenDirector/issues/370)、[#373](https://github.com/ThinkFlowLab/OpenDirector/issues/373)、[#214](https://github.com/ThinkFlowLab/OpenDirector/issues/214)、[#387](https://github.com/ThinkFlowLab/OpenDirector/issues/387)、[#388](https://github.com/ThinkFlowLab/OpenDirector/issues/388)、[#407](https://github.com/ThinkFlowLab/OpenDirector/issues/407)、[#396](https://github.com/ThinkFlowLab/OpenDirector/issues/396)
- OpenCode 桌面端与模式设计：[OpenCode Desktop 教程](https://deepseekartifacts.com/guides/opencode-desktop-tutorial)、[OpenCode Desktop 更新日志](https://opencode.ai/desktop)、[Tabs 发布文章](https://abrarakhunji.com/blog/opencode-desktop-launch/)、[OpenCode agents 文档摘要](https://github.com/anomalyco/opencode)、[Exploring OpenCode](https://elite-ai-assisted-coding.dev/p/exploring-opencode)
- Windsurf 与 Cursor 的模式取舍：[Cursor vs Windsurf 2026](https://vexp.dev/blog/cursor-vs-windsurf-2026-honest-comparison-what-works-with-both)、[Windsurf AI Review 2026](https://www.nxcode.io/resources/news/windsurf-ai-review-2026-best-ide-for-beginners)
- Lovart 设计 Agent：[Lovart Review 2026](https://tooldirectory.ai/tools/lovart)、[Lovart Review（Australia）](https://www.theaidirectory.com.au/review-lovart-australia-2026/)
- 即梦 / TapNow：见 [竞品调研文档](competitor-and-feature-baseline.md) 的来源列表。

注：竞品资料多为第三方评测，OpenCode 桌面端的部分细节（如 Plan 模式的具体限制）以官方文档与实际版本为准。

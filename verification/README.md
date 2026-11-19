# 时间线输出失败卡片改进——设计说明与全量模拟证据

本目录记录 [RFC #362](https://github.com/ThinkFlowLab/OpenDirector/issues/362) Windows 范围内一次具体改进的完整闭环：**时间线为空时点「输出视频」会弹出“生成失败”卡片（提示“请先向时间线加入素材”），该失败卡片无法关闭**。修复后完成全量功能模拟，并以 MP4 录像展示。

## 1. 问题与根因

- 触发路径：画布上选择时间线节点 → 工具栏「输出视频」→ 空时间线渲染器抛错 → 卡片进入 `failed` 态，界面只给「重试输出」，没有关闭按钮，卡片永久滞留在画布上。
- 根因：`onOutput` 直接 `timelineOutput.run`，渲染器遇到空时间线只抛错；`TimelineOutput` 的 `failed` 分支缺少 `dismiss` 途径。
- 复现录像：[web-bug-repro-unclosable-card.mp4](../delivery/web-bug-repro-unclosable-card.mp4)（未打补丁的上游 UI，卡片上只有「重试输出」，Escape/Delete 均无效）。

## 2. 修复（`patches/timeline-output-dismiss.patch`）

1. **空时间线就地拒绝**：提交前判定保存的编辑器文档为空，只弹提示「请先向时间线加入素材。」，不再挂出合成卡片——提示出现在操作处，不产生需要收拾的残卡。
2. **失败卡片可关闭**：`TimelineOutput` 的 `failed` 态提供「编辑时间线」「重试输出」「关闭卡片」（`cw-timeline-pending-close`）三个出口；关闭会中止任务、清理 pending、释放 `blockedItemId`。桌面版退出窗口前也会释放全部引用，不残留“生成中”状态。
3. **双语**：新增文案中英文各一份，与原版语言切换一致。

回归：`tests/timeline_output_dismiss.mjs`（空请求被拒且无卡片、失败卡片可关、无孤儿输出、无残留引用）。打包构建（`scripts/package.py`）按序应用 `canvas-placement → bundled-agent → timeline-output-dismiss` 三个补丁。

## 3. PR #397 的借鉴

上游 [PR #397](https://github.com/ThinkFlowLab/OpenDirector/pull/397) 是桌面壳参考实现。本仓库与其对齐/借鉴的要点：

- **本地服务架构**：桌面壳 + 本地 Python Host，只经 loopback 认证连接，不把 API 暴露给任意本机进程（见 README「文件、CLI 和升级」）。
- **项目侧栏与平台窗口控件**：原生标题栏按钮、侧栏创建入口平移进桌面壳，WebView2 内仍是原版 UI（本仓库的「六个画布入口」布局修复即在此壳上验证）。
- **失败态必须有明显出口**：PR #397 的错误可操作提示思路直接体现在本次修复——任何失败卡片都要有关闭/重试/回到编辑器三个出口之一。
- **双语默认名与本地化**：新增文案全部双语，默认工程名本地化。
- **示例画布经 Host 下载**：`examples/Blue Hour.canvas` 的导入导出走同一工程管道。

## 4. 同类产品调研

- **即梦（字节）**：故事创作模式 + 时间轨道管理、生成与编辑一体化、运镜控制、动作模仿/对口型、中文直出海报、一键导出成片。启示：时间线是一等公民，生成结果必须能直接落到轨道上继续编辑。
- **TapNow**：“Your AI-Native Creative Canvas”，Tapflow 节点式管线连接 text/image/video 节点，多模型编排、场景连续性/重光照、可复用工作流模板、TapTV 社区；但缺时间线后期工具。启示：节点画布负责编排、时间线负责成片，两者的衔接（本仓库的“时间线节点 → 输出视频节点”发布流）是 OpenDirector 的差异化位置。
- 两者共同点：失败/异常态都给出明确出口，不让用户卡在无操作可能的残卡上——本次修复正对齐该原则。

参考迭代历史仓库：[hanyingHY/For-OpenDirector](https://github.com/hanyingHY/For-OpenDirector)（分支即历史，本仓库基线由其移植至上游 `ab3f0585`）。

## 5. 全量功能模拟（MP4 录像）

模拟在真实运行的 OpenDirector 应用（React/Vite UI + creation API，与 WebView2 中同源同码）上由 Playwright 驱动真实鼠标/键盘操作录制，录制器为 CDP screencast → ffmpeg 合成（`web_recorder.mjs`）。

| 阶段 | 内容 | 截图 |
| --- | --- | --- |
| 1 | 新建画布项目（随机名，落盘“已保存到本机”） | `sim-shots/01-project.png` |
| 2 | 侧栏「添加时间线」创建时间线节点 | `sim-shots/02-timeline-node.png` |
| 3 | **空时间线点「输出视频」→ 提示“请先向时间线加入素材。”，无失败卡片** | `sim-shots/03-empty-refused-toast.png` |
| 4 | 「打开时间线」→ 编辑器导入 JPEG 时间线包 → 应用编辑 → 合成预览 | `sim-shots/04-editor-clip.png` |
| 5 | 真实渲染：输出视频 → 上传 MP4 → 发布视频节点到画布 | `sim-shots/05/06-*.png` |
| 6 | 4096×4096 触发编码失败 → **失败卡片带「编辑时间线」「重试输出」「×关闭」** → 关闭 | `sim-shots/07/08-*.png` |
| 7 | 顶栏「导出画布」下载 `.canvas` 工程文件 | `sim-shots/09-exported.png` |
| 8 | 中英切换 + 页面无错误 | `sim-shots/10/11-*.png` |

- **修复后全量模拟**：[web-full-simulation.mp4](../delivery/web-full-simulation.mp4)（1440×900，约 36 秒，8 个阶段全部通过）
- **修复前复现**：[web-bug-repro-unclosable-card.mp4](../delivery/web-bug-repro-unclosable-card.mp4)（11 秒，卡片只剩「重试输出」）
- 导出示例工程：[web-sim-project.canvas](../delivery/web-sim-project.canvas)
- 脚本：`web_full_simulation.mjs`（全量旅程）、`web_bug_repro.mjs`（复现）、`web_recorder.mjs`（录制器）；运行配方见脚本头部注释。

## 6. Windows 真机验证

[windows.yml](../.github/workflows/windows.yml) 在本分支提交后已在 GitHub-hosted Windows Server 2022 x64 实跑：**[Windows x64 desktop · 运行 44526330763](https://github.com/hanyingHY/For-OpenDirectore-in-Windows/actions/runs/44526330763)** 全部步骤通过——装配打补丁 UI 与 Windows 运行时、原生 Agent 项目写入（确定性模型）、编译 NSIS 安装包、**安装后通过 CDP 驱动已打开的原生 WebView2 窗口执行全量验收**（建项目、导入图片、编辑提示词、导出画布、侧栏布局、图片编辑器、Agent 聊天、渲染 MP4 并用 ffprobe 校验）。同批回归：[Desktop regression checks](https://github.com/hanyingHY/For-OpenDirectore-in-Windows/actions/runs/44526330906)、[Patched canvas and service regressions](https://github.com/hanyingHY/For-OpenDirectore-in-Windows/actions/runs/44526330669)。

真机产物（Actions 页面可下载）：

- `Windows-installer-x64`（约 195 MB）：`OpenDirector-0.1.4-desktop.9-x64-Setup.exe` 安装包。
- `Windows-native-evidence`（约 4.8 MB）：原生 WebView2 窗口操作录像（`windows-*.mp4`）与安装版应用实际渲染导出的 `timeline-export.mp4`。

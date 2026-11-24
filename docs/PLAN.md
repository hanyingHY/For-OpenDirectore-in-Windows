# For-OpenDirector-in-Windows — 总体计划 / Master Plan

> 目标：为 [OpenDirector](https://github.com/ThinkFlowLab/OpenDirector)（[Issue #362](https://github.com/ThinkFlowLab/OpenDirector/issues/362)）交付 **Windows 桌面端应用**，
> 在 Windows 上的体验**完全等同并超越**原项目网页版，成为 omni 领域对标 OpenCode 的开源 harness 的 Windows 旗舰形态。
>
> 本仓库专注 **Windows 端适配**（对应上游 D3/Windows distribution 及其后续），吸收 [PR #397](https://github.com/ThinkFlowLab/OpenDirector/pull/397) 的桌面架构经验，并借鉴即梦、TapNow 等同类产品的优秀设计。

---

## 1. 背景与调研结论 / Background & Research

### 1.1 上游现状（截至 2026-11-24）

| 事项 | 状态 |
| --- | --- |
| 上游 Web 工作台（对话生成 / 画布 / 媒体编辑 / 时间线导出 MP4 / FCPXML） | v0.1.5 已发布 |
| PR #397 桌面应用（Electron + Python Host，macOS DMG / Windows NSIS） | 已合并，v0.1.5 Windows x64 未签名安装包已发布 |
| D5 自动更新 (#367) | **未交付** — 本仓库重点之一 |
| Windows 签名、干净机器验收 | **未完成** — 本仓库重点之一 |
| D7 媒体按引用导入 (#473)、#474 双向剪贴板 | 开放，help wanted |
| 桌面 CLI 验收 (#475) | 开放 |

### 1.2 PR #397 可借鉴的核心设计（已深度吸收）

- **Electron 壳 + 认证回环 Host**：主进程启动捆绑 Python Host，经私有 stdio 管道交换一次性凭据；渲染器通过 `opendirector://app` 协议经主进程代理访问 Host（CSP 收紧、Node 集成关闭、上下文隔离）。
- **关窗保活、退出查活**：关闭窗口仅隐藏；退出前检查 Agent/生成/导出活动并提示；Host 释放本实例的编辑会话。
- **项目侧边栏（可折叠）+ Windows 标题栏覆盖**：`titleBarOverlay` 自定义标题栏、48px caption 高度、深浅色同步。
- **打包运行时**：`prepare-runtime.mjs` 用 uv 装独立 Python → 构建 wheel（含前端与 OpenCode）→ 校验 ffmpeg/ffprobe → 写 `runtime/manifest.json`（平台/架构校验）。
- **冒烟验证**：打包后启动真实 exe，拖入 MP4/PNG/WAV 验证 SHA-256 与节点绑定持久化、双语、隐藏窗口保活、重启恢复。
- **Windows 细节**：NSIS 可选安装目录、单实例锁、便携的 PowerShell 校验和、删除 uv 无版本别名避免打包双份运行时。

### 1.3 竞品体验研究（即梦 / TapNow / 同类）

| 竞品 | 值得借鉴的体验 | 本项目落点 |
| --- | --- | --- |
| 即梦（Dreamina） | 智能画布一站式（多图融合、局部重绘、一键扩图）；故事模式时间轨道；首尾帧/运镜控制；参数面板（时长/比例/次数）；**上手 2 分钟出片** | 桌面端首启引导优化、快速动作、任务中心 |
| TapNow | Tapflow 无限节点画布多模型编排；**Agent 执行导演**（理解节点与连线，拆解步骤）；草图转视频；**TapTV 一键克隆工作流社区** | 画布示例库增强、Agent 面板体验、"克隆示例画布"入口 |
| 通用桌面标杆 | 跳转列表/托盘/任务栏进度/Toast 通知/自动更新/深链/文件关联 | **Windows 原生集成层**（本仓库核心增量） |

### 1.4 本次实测发现的真实痛点（全量模拟将逐一验证修复）

1. **会话锁恢复体验差**：浏览器/应用异常退出后，重新打开项目只显示 "This project is open in another window"，仅提供 Reconnect/返回，无接管手段、无锁归属信息、无自动恢复倒计时。
2. **无 Windows 任务栏进度/Toast**：导出 MP4、生成任务进行中系统层无感知。
3. **无自动更新**：D5 缺口，用户需手动下载安装包。
4. **窗口状态不记忆**：重启后窗口大小/位置/最大化状态丢失。
5. **无跳转列表/最近项目**：从任务栏无法快速进入最近项目。

---

## 2. 技术方案 / Architecture

```
┌─────────────────────────────── Windows 桌面应用（本仓库 windows/）───────────────────────────────┐
│  Electron 主进程（Windows-first 增强层）                                                          │
│  ├─ Mica/Acrylic 沉浸背景 + 深浅色跟随系统 + 标题栏覆盖（Snap Layouts）                            │
│  ├─ 窗口状态持久化（多显示器/DPI 感知）                                                            │
│  ├─ Jump Lists（最近项目/新建/打开数据目录）· 托盘 · Toast 通知 · 任务栏进度                        │
│  ├─ 深链 opendirector:// · 文件关联 · 单实例聚焦                                                    │
│  ├─ 会话锁接管（Take over）· 崩溃恢复 · 导出诊断包                                                  │
│  ├─ 自动更新（electron-updater 通道 + NSIS 增量）★ D5 填补                                        │
│  └─ 捆绑运行时：Python Host（认证回环）+ FFmpeg + OpenCode Agent 运行时                            │
│                    │  stdio 控制管道（initialize/session/inspect/shutdown）                       │
│                    ▼                                                                              │
│  Python Host（上游 opendirector_api.desktop）── 项目存储 workspace/（%APPDATA%\OpenDirector）      │
│                    ▲                                                                              │
│  渲染器（上游 Web UI，复用 + patches/ 改进）── opendirector://app 代理 + CSP                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **复用上游**：Web UI、Python API、项目存储、Agent 运行时、契约。构建时按固定 commit 拉取（`scripts/vendor-upstream.sh`），改动以 `patches/` 补丁集形式维护，保证可升级、可审计。
- **超越上游**：`windows/` 桌面壳的 Windows 原生集成 + `patches/` 中的体验修复（会话接管等）。
- **构建产物**：NSIS 安装器（x64，签名就绪）+ SHA-256 + 便携 CLI + 自动更新 manifest。

## 3. 交付物与验收 / Deliverables & Acceptance

对照 Issue #362 验收标准（Windows 切片）：

| # | 验收项 | 交付物 |
| --- | --- | --- |
| A1 | 声明测试 OS/架构/包格式/运行时版本/签名状态 | `docs/architecture-windows.md` + Release notes 模板 |
| A2 | 干净环境：安装 → 建项目 → Agent 辅助工作流 → 编辑 → 导出 → 重开 → 更新 | NSIS 安装器 + CI（windows-latest）打包与冒烟 + 全量模拟 mp4 |
| A3 | 更新/卸载保留项目与凭据；启动失败/任务中断/更新失败有可操作提示 | NSIS 配置（`deleteAppDataOnUninstall: false`）+ 故障注入模拟 |
| A4 | 中英文 UI、文件操作、诊断 | 双语全量模拟 + 诊断导出 |
| A5 | 导出与后台任务需要客户端参与的说明 | 文档 + 导出期间任务栏进度/阻止休眠 |

**真机全量功能模拟（硬性要求）**：`scripts/record-demo.mjs` 驱动真实前后端（上游代码 + 补丁），
覆盖：首启引导 → 模型配置 → 对话 → 示例画布 → 节点创建/连线/编辑 → 上传素材 → 图像预设 →
时间线编排 → MP4 导出 → 项目重开 → 会话锁接管 → 双语切换 → 主题切换 → 桌面壳行为模拟，
全程录制并编码 `demo/*.mp4` 展示。回归层运行上游 `tests/browser/*` 工作流确保零回归。

## 4. 实施阶段 / Phases

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 调研 | 上游代码/Issue #362/PR #397/竞品（即梦/TapNow）/在 VM 跑原项目网页版体验 | ✅ 完成 |
| P1 计划与骨架 | 本文档、README、仓库结构、vendor 脚本 | ✅ 完成 |
| P2 Windows 桌面壳 | Electron 主进程（Windows 增强层）、Host 桥接、NSIS、单元测试 25/25 | ✅ 完成 |
| P3 体验补丁 | 0001 会话锁接管；0002 任务栏进度/原生通知；0003 工作流模板 | ✅ 持续追加 |
| P4 模拟与录制 | 全量功能模拟脚本、上游回归 29/29、mp4 录制（中英双语） | ✅ 每批刷新 |
| P5 CI 与验收 | GitHub Actions Windows 构建/冒烟全绿（run 45387924507）、验收文档 | ✅ 完成 |
| P6 竞品批次 | 工作流模板✅；后续：故事板模式、首尾帧控制、模板社区等 | 🔄 进行中 |

## 5. 决策记录 / Decisions

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 桌面壳技术 | Electron（与上游 PR #397 同构，Windows-first 增强） | 与上游 Web UI/Host 协议零适配成本；生态成熟（NSIS/自动更新/任务栏 API）；体验一致 |
| 上游集成 | 构建时按 commit 拉取 + patches/ 补丁集 | 仓库轻量；升级路径清晰；Apache-2.0 合规（保留 NOTICE） |
| 运行时捆绑 | uv 独立 Python + wheel + FFmpeg + OpenCode | 沿用上游已验证的 prepare-runtime 流程，Windows 移植 |
| 自动更新 | electron-updater + GitHub Releases 渠道（可换自建） | 填补 D5；NSIS 增量友好；签名校验就绪 |
| 模拟录制 | 无头 Chromium（CDP）+ 帧序列 + ffmpeg/libx264 | 沙箱可复现；驱动真实前后端；可全量回归 |
| 沙箱限制 | 沙箱无法运行 Windows/Electron 二进制 | 桌面壳以单测+静态校验覆盖；真实安装/升级走 CI windows-latest 冒烟与验收清单 |

## 6. 风险与缓解 / Risks

| 风险 | 缓解 |
| --- | --- |
| 上游快速演进导致补丁漂移 | 补丁按文件聚类、CI 中 dry-run 应用；固定 commit 有升级脚本 |
| Windows 签名缺失（SmartScreen） | 文档声明未签名状态；配置 electron-builder 签名钩子就绪 |
| 沙箱无 Windows 运行时 | CI windows-latest 真机冒烟（安装/启动/拖放/卸载）+ 全量模拟 mp4 |
| 大文件（字体/示例媒体）入 Git | 跟随上游布局，demo 产物 gitignore，按需发布到 Release |

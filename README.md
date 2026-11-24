# OpenDirector for Windows

面向 Windows x64 的非官方桌面发行版。安装后从开始菜单打开 **OpenDirector**，无需命令行、Python 环境或本地开发服务器。不是网页快捷方式，也不连接某个托管的 OpenDirector 网站。

**desktop.11（本分支）**：本轮三件事——①**渲染导出宿主契约**：应用在任何导出/渲染进行中时于 `documentElement` 置位 `data-od-exporting`（进行中才置位，完成/失败即撤），Host.cs 优先读该属性、保留旧选择器兜底，并兼容 PR #397 的 `window.opendirectorDesktop.setExporting` 桥——退出确认与托盘从此不再误判；②**「他窗占用」自愈等待**：强杀/崩溃后 60 秒内重开同一项目，不再弹只能手动重连的错误卡，而是倒计时等待（约 75 秒）+「重新连接 / 返回画布首页」双出口，租约一到期自动进入，无点击；③**失败态出口纪律**：重试输出失败时用 Escape 即可关卡（此前焦点陷在卡片里）。真机全量功能模拟实录（九章：欢迎双语 → 画布入口 → 文本编辑 → 素材上传 → 时间线导入 → 真实 H.264 渲染（导出信号全程在位）→ 失败态三出口 → 强杀后自愈 → 中英切换）：

| 证据（本分支实录） | 文件 |
| --- | --- |
| **真机全量功能模拟（desktop.11 九章，H.264）** | [delivery/desktop11-full-journey.mp4](delivery/desktop11-full-journey.mp4) |
| 状态机旅程：导出信号契约（渲染进行中 44 采样置位/结束归零、失败路径零残留） | [verification/export_signal_contract.mjs](verification/export_signal_contract.mjs) |
| 状态机旅程：他窗占用自愈（等待态双出口 + 零点击自动进入） | [verification/open_elsewhere_autoretry.mjs](verification/open_elsewhere_autoretry.mjs) |
| 静态契约守卫（Host.cs 读取顺序、双语文案、打包补丁链顺序） | [tests/test_export_signal_contract.py](tests/test_export_signal_contract.py) |
| 取舍与设计记录（PR #397 `desktop:exporting` 取「信号」弃「桥」；上游 Fit all 静默失效候选缺陷） | [DESKTOP-PARITY-REVIEW.md](DESKTOP-PARITY-REVIEW.md) |

> 三条旅程与全量录像均在隔离 fixture（`tests/browser/creation_server.py`）+ 真实浏览器窗口上驱动，渲染为浏览器自身 H.264 编码（与装机版同一 WebCodecs 路径）；`tests/test_export_signal_contract.py` + `tests/test_transport.py` 13 项 + 上游 `npm test` 930/930 全绿。canvas 工作流（五车道 + 三条旅程）随本版更新。

### 上一版 desktop.10 归档（基线推进与失败卡修复）

**desktop.10**：交付基线推进到上游 `ab3f0585`（当前 `main` 头）。构建、原生 Agent 车道、装机冒烟与渲染验收由 [Windows x64 desktop 工作流](../../actions/workflows/windows.yml) 在 `windows-2022` runner 上执行，本轮 [run 44527172841](https://github.com/hanyingHY/For-OpenDirectore-in-Windows/actions/runs/44527172841) 通过：`package.py` 装配 + 原生 Agent 写入（确定性模型）+ NSIS 编译 + 装机冒烟（`OD_VERIFY_RENDER=1`：静默安装、启动、双语存储、真实 H.264 渲染与 ffprobe 核验），产物 `Windows-installer-x64`（195 MB）与 `Windows-native-evidence`（4.4 MB 装机截图/录像）挂在同一 run；[run 44527172840](https://github.com/hanyingHY/For-OpenDirectore-in-Windows/actions/runs/44527172840)（frontend/backend/canvas/voice/assistant 五车道）与本轮 [离线检查](https://github.com/hanyingHY/For-OpenDirectore-in-Windows/actions/runs/44527669259) 同样通过。安装包在 run 页面的 `Windows-installer-x64` 构件里，原生窗口截图与录像在 `Windows-native-evidence` 里。`sign-update` / `update-handoff` 维持按仓库与 `main` 分支跳过（候选分支不进稳定频道）。本轮修复的时间线「失败卡」问题（用户报告：卡片关不掉）见 [DESKTOP-PARITY-REVIEW.md §0](DESKTOP-PARITY-REVIEW.md)——含网页版 A/B 录像与逐条判据：

| 证据（本分支实录） | 文件 |
| --- | --- |
| 原项目网页版（未打补丁）：失败卡只有「重试输出」，Escape / 点空白 / 右键全部无效，关不掉 | [delivery/preview/baseline-repro.mp4](delivery/preview/baseline-repro.mp4) |
| 适配后：空时间线以 toast 回答、不留卡片；真失败卡片给 编辑时间线 / 重试输出 / 关闭卡片（✕），焦点落出口、Escape 可关；关闭后无孤儿输出、引用不卡死 | [delivery/preview/patched-verify.mp4](delivery/preview/patched-verify.mp4) |
| 关键帧截图（失败卡三出口、Escape 关闭、关闭后画布状态等） | [delivery/preview/](delivery/preview/) |
| 校验值（逐文件列出，不用通配） | [delivery/SHA256SUMS.txt](delivery/SHA256SUMS.txt) |

> 录像是运行中应用的真实截屏帧（CDP screencast → libx264），在沙箱 Linux 容器里对锁定基线的原样网页运行录制；装机场景（真实 WebView2 窗口）由 `scripts/smoke.ps1` + `verification/render.mjs` 在 Windows runner 上复验同一组选择器与判据。

### 上一版 desktop.6 / desktop.7 归档（姐妹仓库 hanyingHY/For-OpenDirector）

**[desktop.7 Windows x64 安装包（维护者草稿）](https://github.com/hanyingHY/For-OpenDirector/releases/tag/untagged-77520365e069afb1c1a1)** · **[desktop.7 Actions 安装包（ZIP 内含 EXE）](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44452250785/artifacts/14495997765)** · [desktop.7 Windows 验收记录](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44452250785)


**[desktop.7 实机窗口录像](delivery/desktop.7-windows-workflow.mp4)** · [六个画布入口实录](delivery/desktop.7-windows-sidebar.mp4) · [应用实际导出的 H.264 MP4](delivery/desktop.7-timeline-export.mp4) · [安装包 SHA-256](delivery/SHA256SUMS.txt)。[构建、跨版覆盖安装及签名交接测试](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44452250785) 已通过，录像与 EXE 从同一次构建保留。录像中的 AI 服务响应来自本地测试模型；OpenCode、项目写入及渲染是真实执行。EXE 未经 Authenticode 签名。

### 上一版 desktop.6 归档

**[下载 Windows EXE（仓库维护者可见的草稿）](https://github.com/hanyingHY/For-OpenDirector/releases/tag/untagged-2dd2f0a139431e481607)** · **[Actions 备用下载](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44297067032/artifacts/14424746913)** · **[画布重叠复现与修复](delivery/canvas-debug.mp4)** · **[Windows 全流程实录](delivery/studio-walkthrough.mp4)** · [时间线导出的 MP4](delivery/timeline-export.mp4) · [可导入的示例画布](examples/Blue%20Hour.canvas)

登录有仓库维护权限的 GitHub 账号，可从草稿中直接下载 EXE。Actions 备用下载需要登录，解压得到 `OpenDirector-0.1.4-desktop.6-x64-Setup.exe`，双击即可按当前用户安装。用 `Get-FileHash .\OpenDirector-0.1.4-desktop.6-x64-Setup.exe -Algorithm SHA256` 对照其发布草稿内的 `SHA256SUMS.txt`。安装程序**没有 Authenticode 签名**，可能触发 SmartScreen。请核对来源和 SHA-256，不要关闭系统安全防护。无管理员权限要求；安装和首次启动请预留约 2 GB 空间。

**desktop.6 结果**：[源码构建与 five-lane 检查通过](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44297067032)，[独立 Windows 安装/升级/导出/验收通过](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44299900134)。画布录像来自升级前的 desktop.5；[图片编辑 → Agent → 渲染实录](delivery/studio-walkthrough.mp4)、[Agent 写入截图](delivery/windows-agent-en.png)和 1.5 秒 H.264 输出来自升级后的 desktop.6。逐项结果与边界见 [Windows 核对清单](WINDOWS-AUDIT.md)。

### 画布布局（desktop.6 新增）

六个侧栏创建入口（文本、图片、视频、音频、时间线、主体）原共用画布居中锚点，连续创建的卡片会互相覆盖。desktop.6 只在自动创建路径上计算空位：已有节点按其父组换算为绝对边界，再加上实际宽高与 64 画布单位间隔，从当前锚点沿水平或垂直轴取最近的空位；没有固定列数，也没有搜索半径。明确指定的端点、鼠标拖放、替换素材和打开旧工程不会触发全图重排，已有叠放也不会被悄悄移动——需要整理时点击画布空白处，按 `Ctrl+A` 或框选卡片，再点多选工具栏的「自动排列」；`Shift+1` 查看全图，必要时点「撤销」恢复。[看旧版复现与手动恢复](delivery/canvas-debug.mp4)。

## 桌面版与网页版是什么关系？

固定基线是 [ThinkFlowLab/OpenDirector `8258d4b`](https://github.com/ThinkFlowLab/OpenDirector/tree/8258d4b016496d81a7c824e4cdfa42f3c840d5eb)（0.1.5，含上游官方 Electron 桌面应用 #397 与下载页 #413，我们只消费其共享层）。使用其 `package-lock.json` 构建完整的 React/Vite UI，原样加载其 API、画布、时间线、字幕字体、双语消息、模型配置和 Agent skills。打包时对 Windows CLI 启动脚本、非交互 Git 初始化的标准输入和只读任务计数接入点做适配，不改画布的写入、渲染或模型业务规则。WebView2 提供 Edge 的文件选择、下载、剪贴板和 WebCodecs，不用另一套 UI 模仿原版。

| 项目 | 本次交付 |
| --- | --- |
| 目标 | Windows 11 x64 / Windows 10 22H2 x64，.NET Framework 4.8+ 及 Evergreen WebView2；不含 Windows ARM64、x86、macOS、Linux |
| 实测系统 | GitHub-hosted **Windows Server 2022 x64**。这是原生 Windows 构建和 GUI 测试，不是 Win10、Win11 各硬件机型的认证 |
| 打包 | 每用户 NSIS 安装 / 卸载；开始菜单、桌面快捷方式、App Paths；桌面版 `0.1.5-desktop.12`，编译 UI 前按序应用 `patches/` 六张补丁（canvas-placement、bundled-agent、timeline-output-dismiss、agent-gateway-terminal-failure、export-signal-contract、open-elsewhere-autoretry；仅影响节点位置、失败卡出口、导出信号与租约等待呈现，不改动存储格式、渲染和模型业务规则。基线推进 0.1.5 后，open-elsewhere 与 #397 的 Reconnect/Back 出口、unload 释放会话互补共存；导出信号与 #397 的 `setExporting` 桥统一为单一引用计数，属性与桥不再互相打架） |
| 随应用安装 | CPython 3.12.16、上游 Python 依赖、OpenCode 1.19.5 x64 baseline、MinGit 2.56.1、ripgrep 15.1.0、FFmpeg/ffprobe 9.0.2（含 libx264）、编译后的 Web UI |
| 系统组件 | WebView2 SDK 1.0.2903.40；实际浏览器由系统 Evergreen Runtime 提供并更新。若被移除，请从[微软](https://developer.microsoft.com/microsoft-edge/webview2/)安装 x64 运行时。未捆绑完整浏览器或模型权重 |

### 第一次使用

1. 安装后打开应用；可以先不配模型，创建项目、上传本地素材、编辑、导入和导出。点上方「中文 / EN」切换语言。
2. 可用「导入画布」打开 `examples/Blue Hour.canvas`。它是由原版界面实际导出的含图像和视频提示词的工程，不需要 API 密钥。
3. 用 AI 时，在原版模型设置中配置自己的服务地址、模型 ID 和认证。第三方服务、价格、账号权限、可选的外部 Agent CLI 与网页版本一样，不随安装包附赠。
4. **导出时保持应用运行**。MP4 在渲染器内编码，需要 WebView2 和系统的 H.264 编码能力。不要在导出、生成或 Agent 正在工作时退出。主窗口 × 隐藏到托盘；双击托盘或重新从开始菜单启动会唤回原窗口。选择托盘「退出」或按 **Alt+空格 → 退出 OpenDirector** 才会检查运行中的任务、显示确认并停止本地进程树；远端提供商已经接受的任务未必随之取消。

### 文件、CLI 和升级

| 内容 | 默认位置 |
| --- | --- |
| 应用资源 | `%LOCALAPPDATA%\Programs\OpenDirector\app` |
| 工程、目录索引及模型配置 | `%USERPROFILE%\.opendirector`，或使用与上游 CLI 相同的 `OPENDIRECTOR_ROOT`。模型密钥由原版后端按用户保存，请勿共享整个目录 |
| 浏览器配置、诊断 | `%LOCALAPPDATA%\OpenDirector\Desktop`，日志为 `desktop.log` |

GUI 和 CLI 使用同一个项目 ID、会话租约、文件锁及版本规则。GUI 运行时，在 PowerShell 里执行：

```powershell
& "$env:LOCALAPPDATA\Programs\OpenDirector\app\OpenDirector-CLI.exe" project list
```

桌面未运行时，默认 CLI 操作会提示先打开应用，不会转向开发服务器；`--help` 仍可离线使用，显式 `--url` 不受影响。托盘可选注册、修复或移除 `OpenDirector-CLI.exe` 的 App Paths（Win+R）；PowerShell 中直接用上面的绝对路径，不覆盖系统 `PATH` 或其他 CLI。每次启动的桌面凭据受 Windows 当前用户 DPAPI 保护。原版 HTTP API 不直接对任意浏览器或未认证的本机进程开放。

**自动更新（默认开启，自 desktop.3 起）**：desktop.2 及更早版本需要手动覆盖安装一次。此后应用在启动时及每 12 小时从本仓库的公开 Windows x64 稳定发布检查新版并在后台下载。无需 GitHub 登录；离线或检查失败不阻塞编辑。草稿、预发布、其他平台及同版/旧版本不会安装。

- 在 Windows 通知区域右键 **OpenDirector** 图标，可「检查更新」、取消进行中的下载、关闭或重新开启自动更新。开关按当前用户保存。
- 下载完成后点击通知或「安装并重启」。**保存工程、等待导出和 Agent 任务完成后再确认**；选择“否”不会关闭应用。没有授权就不安装，不强制重启。
- 更新使用 Sigstore 发布清单验证，不是只匹配下载站提供的校验和。客户端验证固定 GitHub Actions 工作流身份和透明日志证明，再校验 EXE 的签名清单大小与 SHA-256。安装前再次验证，等待旧宿主及后台服务退出后替换资源并重启。
- 出错时查看 `desktop.log`；网络恢复后右键托盘重试。下载缓存位于 `%LOCALAPPDATA%\OpenDirector\Desktop\updates`。也可从本文开头的渠道手动覆盖安装，工程和模型配置保留。

**手动升级**：从托盘退出，再运行新版安装包。遇到“另一个安装正在进行”时，请等待完成。若上次升级在新旧程序目录交换时中断，重新运行安装包会先恢复上一个完整版本，不必手动删除目录。

**卸载**：使用 Windows 设置中的「已安装的应用」。工程、模型设置和 WebView2 配置默认保留；如需彻底删除，先备份，再手动处理数据目录（包括自定义的根目录）。

### 无法启动或重开？

- 检查 WebView2 Evergreen x64 是否可用；查看 `desktop.log`。desktop.4 改由系统分配本机端口；无需腾出 48765 或开放防火墙。日志可从托盘直接打开。
- 异常退出后，上游编辑租约最多保留约 **60 秒**。等待后重新连接，不要删除 SQLite 索引或锁文件。
- Agent 不工作时，先检查模型配置、网络和诊断；不要在错误报告中包含密钥、完整项目目录或会话凭据。

## desktop.7：Windows 回归修复

- 内置 OpenCode 的数据、缓存和状态放在 `%LOCALAPPDATA%\OpenDirector\Desktop\agent-runtime\opencode-v1`，不读取或迁移用户的独立 OpenCode 数据库。旧的原生会话 ID 不会跨存储目录复用；继续对话时从 OpenDirector 已保存的历史恢复。内置依赖损坏时请用可信安装包覆盖安装，不要运行 `pip install`。
- 应用运行时直接执行 `Uninstall.exe /S` 返回 **2**，保留安装与项目。请从托盘完全退出再卸载；正常完成返回 **0**，项目与凭据仍保留。安装器、卸载器、桌面宿主与 CLI 都含品牌图标和版本资源；Windows 设置显示发布者、图标与安装大小。
- 自动更新的成功检查间隔跨重启保留 **12 小时**。手动检查可绕过常规间隔，但遵守服务器的限流退避；网络故障不影响编辑。桌面日志按 UTF-8 收集 Python stdout/stderr。
- desktop.6 不信任当前候选分支的更新签名，所以 .6 → .7 用可信 EXE 手动覆盖安装。公开稳定频道应从已有客户端信任的 `main` 构建；不会为候选包绕过旧版签名验证。

## 复现 Windows 构建

构建机需要 Windows x64、Python 3.12、Node.js 24.22.1/npm、NSIS 3、.NET Framework 自带的 x64 C# 编译器和网络。**这些是构建机依赖，不是最终用户的开发环境要求。**

```powershell
python scripts/package.py
& "${env:ProgramFiles(x86)}\NSIS\makensis.exe" /INPUTCHARSET UTF8 desktop\setup.nsi
Get-FileHash delivery\*-Setup.exe -Algorithm SHA256
```

产物在 `delivery/`。大二进制不进 Git。仓库的 `delivery/SHA256SUMS.txt` **只对应文件中点名的 CI/Release 安装包**，不是本地可复现构建承诺。NSIS 版本、文件时间戳、构建工具链等都会改变产物字节；本地请为自己的 EXE 计算并另存校验和。

**运行本地验收**：使用交互式的干净 Windows VM，安装 PowerShell **7+**（命令 `pwsh`，不是 Windows PowerShell 5.1）、Node/npm、WebView2 x64，并确保 `delivery/` 只有一个 `*-Setup.exe`。`smoke.ps1` 会通过 npm 安装固定的 `playwright-core@1.56.1` 并连接已打开的 WebView2，不需另下载 Chromium；运行独立的 Node 验收脚本前可手动执行同样的 npm 命令：

```powershell
npm install --prefix scripts --no-save --no-package-lock playwright-core@1.56.1
$env:OD_VERIFY_RENDER = '1'
pwsh -NoProfile -File scripts/smoke.ps1
pwsh -NoProfile -File scripts/agent-check.ps1
```

打包脚本固定上游提交和依赖版本，并校验 Python、Git、ripgrep、FFmpeg 归档 SHA-256 和 OpenCode 的 npm 锁文件完整性。安装中保留上游 LICENSE/NOTICE、字体许可、Python 包元数据、Git/FFmpeg 发行说明及许可证。来源：[OpenDirector](https://github.com/ThinkFlowLab/OpenDirector)、[Python standalone](https://github.com/astral-sh/python-build-standalone/releases/tag/20261110)、[Git for Windows](https://github.com/git-for-windows/git/releases/tag/v2.56.1.windows.1)、[FFmpeg Windows 构建](https://github.com/GyanD/codexffmpeg/releases/tag/9.0.2)。

### 维护者：发布更新到稳定频道

1. 递增 `desktop/VERSION`（格式 `X.Y.Z-desktop.N`），在授权分支构建。客户端只信任本仓库 `.github/workflows/windows.yml` 在 `main` 或当前桌面工作分支的 Sigstore 签名，验证不依赖维护者向用户分发密钥。
2. Windows 测试通过后，单独的 OIDC 签名作业生成 `windows-update.json` 和 `windows-update.json.sigstore.json`；Windows handoff 测试用真实签名和 EXE 验证重启流程。交付工作流会把它们与同一 EXE 放进草稿。
3. **仅当决定对用户推送时**，将标签 `windows-x64-X.Y.Z-desktop.N` 的草稿发布为普通 Release（不要标记 pre-release）。发布前核对三份资产齐全。不要替换既有版本；修复应递增版本号。过期信任根等验证失败时不会退回未验证安装，应通过可信手动渠道重新引导安装。

## 验证

- `python -m unittest discover -s tests -v`：桌面私有传输、Host/Origin 检查和 ASGI 生命周期。
- [Windows 构建记录](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44297067032)：编译 PE、运行打包的 OpenCode/媒体工具，安装后通过 CDP 操作**已经打开的原生 WebView2 窗口**，不是另外启动 Chrome。CDP 只由测试父进程启用。
- [候选安装包独立验收](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44299900134)：在另一台 Windows runner 下载相同 EXE，隔离开发工具 PATH，使用带空格及中文的工作目录，导入图片、编辑提示词、导出 `.canvas`、从 desktop.5 覆盖升级到 desktop.6、英文重开、从聊天框驱动原生 Agent 写入同一项目并验证凭据保留、导入时间线、渲染 MP4 并用 ffprobe 检查编码、尺寸和时长。
- `verification/previous-update.ps1` 使用**已安装的上一版更新器和它自带的信任根**，验证草稿清单、启动新版安装器、等待旧宿主退出，再从自动重启的应用读取同一工程和密钥文件。它只替换发布资产的网络传输，不是公开推送。
- `scripts/smoke.ps1` **仅在空白测试账号 / VM 中运行**：会安装、终止和卸载应用。`scripts/agent-check.ps1` 运行上游包含真实 OpenCode 子进程的回归，用确定性的本地模型响应，既不伪造 Agent 程序也不发送付费请求。
- [Five-lane CI](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44297885250)：前端、后端、助手、语音和画布几何回归；浏览器通过率不等同于 Windows 窗口验收，两者结论须分别看。
- `delivery/candidate.json` 指向当前分支已执行跨版本安装验收的构建。交付工作流检查整条 Windows 流水线状态与产物摘要，回存小型证据，并把原始 EXE 附加到该提交对应的维护者 **draft release**（须事先用 `gh release create <tag> --draft --target <完整构建提交>` 创建，标签写入 `draftTag`），不会向上游推送或公开发布。

本仓库只处理 [RFC #362](https://github.com/ThinkFlowLab/OpenDirector/issues/362) 的 Windows 范围。生产 Authenticode 签名、真实付费模型与各 Windows 客户端 / GPU 组合仍需单独验收。

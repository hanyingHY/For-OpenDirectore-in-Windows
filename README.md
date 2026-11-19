# OpenDirector for Windows

面向 Windows x64 的非官方桌面发行版。安装后从开始菜单打开 **OpenDirector**，无需命令行、Python 环境或本地开发服务器。不是网页快捷方式，也不连接某个托管的 OpenDirector 网站。

## desktop.9（本分支）：时间线失败卡的出口

固定基线推进到 [ThinkFlowLab/OpenDirector `ab3f0585`](https://github.com/ThinkFlowLab/OpenDirector/tree/ab3f05855251eb459b102186ff45936216580931)（本轮复核时的 `main` 头），`desktop/VERSION` 记为 `0.1.4-desktop.9`。

本轮解决的问题：时间线里还没有素材时点「输出视频」，画布上出现失败卡「请先向时间线加入素材。」，而这张卡 **关不掉**——只有「重试输出」，点一次失败一次。经逐行核对与实机运行确认，这是上游 UI 的缺陷，**网页版同样卡死**，不是 Windows 适配引入的。

- 空时间线现在用工程自己的 toast 回答，不再落下一个覆盖层卡片，也不写工程。
- 真正的编码失败给出三个出口：`编辑时间线`（直达失败原因）· `重试输出` · `关闭卡片`（右上角 ✕）。关闭会中断在途渲染、丢弃缓存结果、释放被 `blockedItemId` 挂住的其它时间线。
- 键盘同样可达：失败时焦点落在 ✕ 上，`Esc` 即离开这张卡（必须在 document 的 capture 阶段接管——工作区根节点的 capture 处理器会先吃掉它，这一点是实测撞出来的）。
- 证据是同一条旅程在打补丁前后的两段实机录像：[修复前：7 种退路全部无效](delivery/od-timeline-output-before.mp4)（[同帧截图](delivery/timeline-before-stuck.png)） · [修复后：toast、三个出口、`Esc`、关闭后仍能真实渲染并下载 MP4](delivery/od-timeline-output-after.mp4)（[同帧截图](delivery/timeline-after-failed-card.png)） · [应用自己导出的 640×400 H.264](delivery/od-timeline-app-export.mp4)。两段录像在同一环境、同一条脚本下各录一次（`OD_REEL=before|after`），可直接逐帧对比。录像由 `verification/reel.mjs` 在真实浏览器窗口上生成（CDP 截流 → 浏览器 H.264 编码），**不依赖 ffmpeg**；其中的等待时间被压缩，界面动效未丢帧。逐条判据见 [DESKTOP-PARITY-REVIEW.md](DESKTOP-PARITY-REVIEW.md) §0。
- 文件名里的 `od-` 而不是 `windows-`：这两段录像是 **同一份 React bundle 在测试机浏览器里** 的记录，不是装机窗口录像。安装包构建与装机验收仍须在 Windows runner 上跑（下文的 Windows 构建记录是 desktop.7 那一版）；本轮没有产出新的 EXE，也没有把装机结论算进这里。

上一版（desktop.6 / desktop.7）的装机证据没有复制进本分支：安装包、`SHA256SUMS.txt`、实机窗口录像与截图保存在姊妹仓库 [hanyingHY/For-OpenDirector](https://github.com/hanyingHY/For-OpenDirector) 的发布草稿与 Actions 产物里（desktop.7 构建与验收：[安装包](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44452250785/artifacts/14495997765) · [验收记录](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44452250785)；desktop.6：[构建](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44297067032) · [独立装机验收](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44299900134)）。本仓库的 `delivery/` 只保留本轮生成的三个录像与页面入口，大二进制不进 Git。

desktop.6 还带来一项画布布局修复：六个侧栏创建入口（文本、图片、视频、音频、时间线、主体）原共用画布居中锚点，连续创建的卡片会互相覆盖；现在只在自动创建路径上计算空位（按父组换算绝对边界 + 实际宽高 + 64 画布单位间隔，沿水平或垂直轴取最近空位），明确指定端点、拖放、替换素材和打开旧工程都不触发全图重排。需要整理时点画布空白处 → `Ctrl+A` → 多选工具栏「自动排列」，`Shift+1` 看全图，`Ctrl+Z` 撤销。

## 桌面版与网页版是什么关系？

固定基线是 [ThinkFlowLab/OpenDirector `ab3f0585`](https://github.com/ThinkFlowLab/OpenDirector/tree/ab3f05855251eb459b102186ff45936216580931)（0.1.4，由 `scripts/package.py` 的 `SHA` 锁定；desktop.6–.8 用的是 `d05a56d`，本分支已把整条补丁链重新套到更新的主干上）。使用其 `package-lock.json` 构建完整的 React/Vite UI，原样加载其 API、画布、时间线、字幕字体、双语消息、模型配置和 Agent skills。打包时对 Windows CLI 启动脚本、非交互 Git 初始化的标准输入和只读任务计数接入点做适配，不改画布的写入、渲染或模型业务规则。WebView2 提供 Edge 的文件选择、下载、剪贴板和 WebCodecs，不用另一套 UI 模仿原版。

| 项目 | 本次交付 |
| --- | --- |
| 目标 | Windows 11 x64 / Windows 10 22H2 x64，.NET Framework 4.8+ 及 Evergreen WebView2；不含 Windows ARM64、x86、macOS、Linux |
| 实测系统 | GitHub-hosted **Windows Server 2022 x64**。这是原生 Windows 构建和 GUI 测试，不是 Win10、Win11 各硬件机型的认证 |
| 打包 | 每用户 NSIS 安装 / 卸载；开始菜单、桌面快捷方式、App Paths；桌面版 `0.1.4-desktop.9`，编译 UI 前依次应用 `patches/canvas-placement.patch`（自动创建的节点避让已占位置）、`patches/bundled-agent.patch`、`patches/timeline-output-dismiss.patch`（时间线失败卡的出口，见上）；三张都只改呈现与前置校验，不改存储格式、渲染和模型业务规则 |
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

产物在 `delivery/`。大二进制不进 Git。本分支的 `delivery/SHA256SUMS.txt` **只覆盖随分支保留的三个验收录像**；安装包的校验和由 CI 写进发布草稿，不是本地可复现构建承诺。NSIS 版本、文件时间戳、构建工具链等都会改变产物字节；本地请为自己的 EXE 计算并另存校验和。

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
- 交互修复的证据不需要 Windows：`OD_REEL=before|after node verification/timeline_output_reel.mjs` 在真实 Chromium/WebView 窗口里跑同一条旅程并录成 MP4（`verification/reel.mjs`，无需 ffmpeg）。同一旅程也拷进上游 `tests/` 作为回归（`verification/timeline_output_dismiss.mjs`），已挂进 `canvas.yml` 的 canvas 车道。
- `scripts/smoke.ps1` **仅在空白测试账号 / VM 中运行**：会安装、终止和卸载应用。`scripts/agent-check.ps1` 运行上游包含真实 OpenCode 子进程的回归，用确定性的本地模型响应，既不伪造 Agent 程序也不发送付费请求。
- [Five-lane CI](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44297885250)：前端、后端、助手、语音和画布几何回归；浏览器通过率不等同于 Windows 窗口验收，两者结论须分别看。
- 上游浏览器车道（打了全部补丁的上游树 + 隔离夹具，真实 Chromium）：`npm run test:browser` 43 条旅程最终 43 通过（首轮 41/43），含 `timeline node output`（真 MP4 发布与多版本）与 `mp4 export`。那两条失败（`locale`、`provider settings`）在 **换新夹具根目录后单独重跑即通过** —— 是同一常驻夹具连跑两轮后的编辑租约竞争，不是回归；这条判读规则已写进 [WINDOWS-AUDIT.md](WINDOWS-AUDIT.md)。
- 三条工作流的分工：`checks.yml`（前端/后端与打包脚本自检）、`canvas.yml`（打上全部补丁的上游回归，含 `verification/timeline_output_dismiss.mjs` 与画布几何）、`windows.yml`（真实 Windows 构建 + 装机冒烟 + 更新清单签名）。**装机产物→发布草稿** 的交付环节目前不在本分支上（`delivery.yml` 与 `candidate.json` 属于姊妹仓库的 desktop.7 流程）；若要继续，需要把那条流水线连同 `draftTag` 约定一起搬过来。

本仓库只处理 [RFC #362](https://github.com/ThinkFlowLab/OpenDirector/issues/362) 的 Windows 范围。生产 Authenticode 签名、真实付费模型与各 Windows 客户端 / GPU 组合仍需单独验收。

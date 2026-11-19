# OpenDirector for Windows

面向 Windows x64 的非官方桌面发行版。安装后从开始菜单打开 **OpenDirector**，无需命令行、Python 环境或本地开发服务器。不是网页快捷方式，也不连接某个托管的 OpenDirector 网站。

本仓库承接 [RFC #362](https://github.com/ThinkFlowLab/OpenDirector/issues/362) 的 Windows 范围，延续
[hanyingHY/For-OpenDirector](https://github.com/hanyingHY/For-OpenDirector) 的迭代历史（desktop.1–desktop.7 的安装包、
录像与验收记录都在该仓库的分支与 Actions 里）。固定基线已随 desktop.9 迁到上游
[ThinkFlowLab/OpenDirector `ab3f0585`](https://github.com/ThinkFlowLab/OpenDirector/tree/ab3f05855251eb459b102186ff45936216580931)（0.1.4，当前 main）。

## desktop.9：时间线「失败卡」必须能关掉（本次修复）

空时间线点「导出视频」会留下失败卡「请先向时间线加入素材。」，而卡片只有「重试输出」——对这条错误重试永远
同样失败，且卡片是虚拟节点：选不中、删不掉、焦点进不去，Esc 与右键都被吞掉，只能换工程或删掉来源时间线才能脱身。
网页版（上游 main `ab3f0585`）同样中枪，这是上游 UI 缺陷，不是 Windows 适配引入的。

- **空时间线不再产生失败卡**：请求在原地被拒绝，用工程已有的 toast 提示「请先向时间线加入素材。」，
  画布上不出现任何覆盖层；判定依据是**已保存的编辑器文档**（编码器将要读的内容），不是画布节点的缓存副本。
- **真实的编码失败有三条出路**：`编辑时间线`（直接跳回编辑器修）、`重试输出`、以及真正的关闭按钮
  （带 `aria-label`、可键盘聚焦，悬停为红色 ×）。双语键 `timeline.output.dismiss` / `timeline.output.edit`
  进入 i18n 目录，`check:i18n` 通过。
- **关闭即释放一切**：中断在途渲染、丢弃已渲染但未发布的挂起结果（解除 `blockedItemId` 对其它时间线
  导出按钮的连带阻塞）、清空覆盖层；覆盖层此前不落库，关闭后不留孤儿视频节点、无卡死的 `active`/`pending` 引用。
- 网页版回归：`verification/timeline_output_dismiss.mjs`（六段旅程）进 canvas 车道；装机验收：
  `verification/render.mjs` 在**真实安装版 WebView2 窗口**里复现空时间线 → 失败卡 → 关闭 → 真实渲染的完整链路，
  专程录像 `delivery/windows-timeline-dismiss.mp4`（CI 产物）。
- **沙箱 A/B 实录**（本仓库 `delivery/`）：未打补丁的上游原树复现截图 `web-unpatched-stuck-card.png`
  （与用户截图一致：只有「重试输出」，Esc/Delete 无效、重试同样失败）；打补丁后
  `web-patched-empty-toast.png`（原地 toast）、`web-patched-failed-card.png`（三键失败卡）、
  `web-patched-after-close.png`（关闭后干净画布）；完整操作录像 `desktop9-dismiss-demo.mp4`
  （修复前卡死 → 修复后拒绝/三键/关闭，约 3 分钟，H.264）。同一沙箱里 `npm test` 931/931、
  `check:i18n`、`check:browser-manifest`、`npm run build` 全绿。
- 细节见 [DESKTOP-PARITY-REVIEW.md](DESKTOP-PARITY-REVIEW.md)（含 PR #397 借鉴分析与同类产品对照）。

### 画布布局（desktop.6 新增）

六个侧栏创建入口（文本、图片、视频、音频、时间线、主体）原共用画布居中锚点，连续创建的卡片会互相覆盖。desktop.6 只在自动创建路径上计算空位：已有节点按其父组换算为绝对边界，再加上实际宽高与 64 画布单位间隔，从当前锚点沿水平或垂直轴取最近的空位；没有固定列数，也没有搜索半径。明确指定的端点、鼠标拖放、替换素材和打开旧工程不会触发全图重排，已有叠放也不会被悄悄移动——需要整理时点击画布空白处，按 `Ctrl+A` 或框选卡片，再点多选工具栏的「自动排列」；`Shift+1` 查看全图，必要时点「撤销」恢复。（旧版复现与手动恢复的录像见上一仓库 desktop.6 归档。）

## 桌面版与网页版是什么关系？

固定基线是 [ThinkFlowLab/OpenDirector `ab3f0585`](https://github.com/ThinkFlowLab/OpenDirector/tree/ab3f05855251eb459b102186ff45936216580931)（0.1.4）。使用其 `package-lock.json` 构建完整的 React/Vite UI，原样加载其 API、画布、时间线、字幕字体、双语消息、模型配置、Agent skills 和示例画布目录。打包时对 Windows CLI 启动脚本、非交互 Git 初始化的标准输入和只读任务计数接入点做适配，编译 UI 前应用四个补丁（自动创建节点空位、内置 Agent、时间线失败卡、桌面 503 契约），不改存储格式、渲染和模型业务规则。WebView2 提供 Edge 的文件选择、下载、剪贴板和 WebCodecs，不用另一套 UI 模仿原版。

| 项目 | 本次交付 |
| --- | --- |
| 目标 | Windows 11 x64 / Windows 10 22H2 x64，.NET Framework 4.8+ 及 Evergreen WebView2；不含 Windows ARM64、x86、macOS、Linux |
| 实测系统 | GitHub-hosted **Windows Server 2022 x64**。这是原生 Windows 构建和 GUI 测试，不是 Win10、Win11 各硬件机型的认证 |
| 打包 | 每用户 NSIS 安装 / 卸载；开始菜单、桌面快捷方式、App Paths；桌面版 `0.1.4-desktop.9`，编译 UI 前额外应用 `patches/` 四个补丁（仅影响列名的行为，不改动存储格式、渲染和模型业务规则） |
| 随应用安装 | CPython 3.12.16、上游 Python 依赖、OpenCode 1.19.5 x64 baseline、MinGit 2.56.1、ripgrep 15.1.0、FFmpeg/ffprobe 9.0.2（含 libx264）、编译后的 Web UI |
| 系统组件 | WebView2 SDK 1.0.2903.40；实际浏览器由系统 Evergreen Runtime 提供并更新。若被移除，请从[微软](https://developer.microsoft.com/microsoft-edge/webview2/)安装 x64 运行时。未捆绑完整浏览器或模型权重 |

### 第一次使用

1. 安装后打开应用；可以先不配模型，创建项目、上传本地素材、编辑、导入和导出。点上方「中文 / EN」切换语言。
2. 画布工具栏自带上游的「示例画布」对话框：从目录里选一个示例下载导入（带进度、可取消、可重试），不需要 API 密钥。本仓库 `examples/Blue Hour.canvas` 是上一版交付用过的离线示例，仍可从检出仓库的机器上用「导入画布」打开。
3. 用 AI 时，在原版模型设置中配置自己的服务地址、模型 ID 和认证。第三方服务、价格、账号权限、可选的外部 Agent CLI 与网页版本一样，不随安装包附赠。
4. **导出时保持应用运行**。MP4 在渲染器内编码，需要 WebView2 和系统的 H.264 编码能力。不要在导出、生成或 Agent 正在工作时退出。主窗口 × 隐藏到托盘；双击托盘或重新从开始菜单启动会唤回原窗口。选择托盘「退出」或按 **Alt+空格 → 退出 OpenDirector** 才会检查运行中的任务、显示确认并停止本地进程树；远端提供商已经接受的任务未必随之取消。
5. 时间线导出失败时（包括空时间线、画面尺寸超过编码器上限等），失败卡右上角有「编辑时间线」「重试输出」和红色「关闭」三个出路；空时间线则直接在原地用 toast 提示，不会出现失败卡。

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

## desktop.7：Windows 回归修复（历史，沿自上一仓库）

- 内置 OpenCode 的数据、缓存和状态放在 `%LOCALAPPDATA%\OpenDirector\Desktop\agent-runtime\opencode-v1`，不读取或迁移用户的独立 OpenCode 数据库。旧的原生会话 ID 不会跨存储目录复用；继续对话时从 OpenDirector 已保存的历史恢复。内置依赖损坏时请用可信安装包覆盖安装，不要运行 `pip install`。
- 应用运行时直接执行 `Uninstall.exe /S` 返回 **2**，保留安装与项目。请从托盘完全退出再卸载；正常完成返回 **0**，项目与凭据仍保留。安装器、卸载器、桌面宿主与 CLI 都含品牌图标和版本资源；Windows 设置显示发布者、图标与安装大小。
- 自动更新的成功检查间隔跨重启保留 **12 小时**。手动检查可绕过常规间隔，但遵守服务器的限流退避；网络故障不影响编辑。桌面日志按 UTF-8 收集 Python stdout/stderr。
- 更新信任根现指向本仓库 `hanyingHY/For-OpenDirectore-in-Windows` 的 `windows.yml` 在 `main` 或当前桌面工作分支的签名；desktop.6/7 客户端只信任上一仓库的签名，所以从旧版升级用可信 EXE 手动覆盖安装。

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
- Windows 构建记录：本仓库 Actions 的 `Windows x64 desktop` 工作流——编译 PE、运行打包的 OpenCode/媒体工具，安装后通过 CDP 操作**已经打开的原生 WebView2 窗口**，不是另外启动 Chrome。CDP 只由测试父进程启用。
- 装机验收：真实安装/创建工程/导入素材/导出 `.canvas`/英文重开、Agent 写入同一项目、**空时间线导出被原地拒绝、失败卡三键可关、真实渲染 MP4 并用 ffprobe 校验编码、尺寸、时长**；证据（截图与 `windows-timeline-dismiss.mp4` 等录像）随工作流产物上传。
- `scripts/smoke.ps1` **仅在空白测试账号 / VM 中运行**：会安装、终止和卸载应用。`scripts/agent-check.ps1` 运行上游包含真实 OpenCode 子进程的回归，用确定性的本地模型响应，既不伪造 Agent 程序也不发送付费请求。
- Five-lane CI（前端、后端、助手、语音和画布几何回归）由 `canvas.yml`/`checks.yml` 承担；浏览器通过率不等同于 Windows 窗口验收，两者结论须分别看。

本仓库只处理 [RFC #362](https://github.com/ThinkFlowLab/OpenDirector/issues/362) 的 Windows 范围。生产 Authenticode 签名、真实付费模型与各 Windows 客户端 / GPU 组合仍需单独验收。

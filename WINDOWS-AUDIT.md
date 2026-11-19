# Windows 对照清单 · RFC #362

核对基线：[RFC 与六项工作](https://github.com/ThinkFlowLab/OpenDirector/issues/362)；[对应的原版网页、服务与 CLI 源码](https://github.com/ThinkFlowLab/OpenDirector/tree/ab3f05855251eb459b102186ff45936216580931)（`ab3f0585`，由 `scripts/package.py` 的 `SHA` 锁定；desktop.6–.8 用的是 `d05a56d`）。这是本分支的 Windows 验收记录，不代表上游已经接受或关闭这些 issue。

| 工作项 | Windows 处理方式 | 验证方法 / 不包含什么 |
| --- | --- | --- |
| [D1 桌面应用](https://github.com/ThinkFlowLab/OpenDirector/issues/363) | WebView2 加载由上游锁文件构建的完整 UI，而不是复刻界面或连接托管站点。Windows 原生宿主管理打包的 Python、Agent 和媒体进程；非交互的 Git 初始化不会继承正在等待关闭信号的宿主管道。实际窗口中发送首条消息不再卡在“思考中”。不用提案中的 Electron，不提供 JS → 原生执行桥。 | `scripts/package.py` 执行打包解释器的 import、Agent PE、rg 和 FFmpeg 检查；`scripts/agent-check.ps1` 用真实 Agent 加载内置 skill 并写入工程。 |
| D1 · 连接与同一工程 | 服务绑定 `127.0.0.1:0` 后通过私有管道报告端口。WebView2 内部把旧的浏览器 origin 映射到本次监听器，保留 localStorage / IndexedDB 命名空间。宿主用一次性随机挑战验证路由后才给本 origin 的请求附加凭据。CLI 从当前用户 DPAPI 票据读取本次端口并验证服务。 | `tests/test_transport.py` 检查认证、Host、Origin 和挑战不能充当凭据。`scripts/smoke.ps1` 占用旧端口；`scripts/smoke.mjs` 验证未认证请求被拒、不同编辑会话获得 409、CLI 读到同一 ID、升级前后浏览器标记仍在。 |
| D1 · 退出与恢复 | 主窗口 × 隐藏到托盘；再次启动或双击托盘恢复原窗口。托盘或系统菜单（Alt+空格）「退出」及「安装并重启」读取后端 Agent / 生成 / 工具运行数，并检查各窗口上游导出进度。检查失败显示状态未知；默认不退出。正常停机释放本次窗口的租约；崩溃用上游租约过期机制，绝不强占别人正在编辑的工程。 | 隐藏 ≠ 无窗口渲染服务；导出需要存活的渲染器，后台可能变慢。退出中断本地工作，不等于取消服务商已接单的远程任务。统计是确认前的快照，不承诺检测未来开始的任务。 |
| D1 · 命令 | 可直接调用打包的 CLI；托盘可选择注册 / 修复 / 移除 `OpenDirector-CLI.exe` 的当前用户 **App Paths**。可从 Win+R / ShellExecute 发现；不会安装同名全局 `opendirector`，也不更改 PATH。 | `OpenDirector-CLI.exe --help` 是上游 CLI 帮助。不同路径已占用注册名时不覆盖；卸载只删除匹配本安装路径的 CLI 注册。 |
| [D2 macOS](https://github.com/ThinkFlowLab/OpenDirector/issues/364) | 不在本次 Windows 委托内。 | 未构建、未签名、未测试；下载页无此包。 |
| [D3 Windows](https://github.com/ThinkFlowLab/OpenDirector/issues/365) | x64 每用户 NSIS `.exe`，带快捷方式、应用注册、分阶段替换、卸载保护。项目、密钥、WebView 配置不放进应用目录。 | 使用 Windows Server 2022 x64 托管 runner，应用 PATH 去除开发工具，用含中文及空格的数据路径测试；主机有系统 WebView2。目标是 Win10 22H2 / Win11 x64，不宣称两代消费系统、所有 GPU 和全新物理机都已测试。**无 Authenticode**。 |
| [D4 Linux](https://github.com/ThinkFlowLab/OpenDirector/issues/366) | 不在本次范围。 | 不提供 DEB、RPM 或 AppImage。HarmonyOS 同样不是本次交付。 |
| [D5 自动更新](https://github.com/ThinkFlowLab/OpenDirector/issues/367) | 固定稳定频道、签名清单与 EXE 散列校验、取消与重试、用户确认、等待旧进程、安装并重启。服务端草稿不会触发客户端更新。 | `tests/test_update.py` 检查版本、签名/摘要失败、中断、取消和不降级。`verification/update_handoff.py` 使用测试传输 + 真签名 + 真安装器验证等待和重启；不是一次公开推送。独立验收还通过 `verification/previous-update.ps1` 用上一版自带的更新器验证并安装新版，核对重启后的工程与密钥文件。未制造真实硬盘损坏或断电。 |
| [D6 下载入口](https://github.com/ThinkFlowLab/OpenDirector/issues/369) | `delivery/index.html`：中英文、响应式、平台与架构手选、无法确定时不猜，分别提示未提供构建/无稳定版/查询失败。仅在 GitHub 确实返回匹配的公开非预发行 EXE 时显示主下载按钮。草稿通过 README 单独标注维护者访问权限。 | `node verification/landing.mjs` 覆盖混合版本、草稿、错误资产、无发布和网络失败。这里是本 fork 的预览页，不冒充 [上游网站 / Pages #368](https://github.com/ThinkFlowLab/OpenDirector/issues/368)；公共域名、签名证书与正式发布需发行方决定。 |

## 最短复验路线

1. 空白 Windows 测试账号安装上一版，在中文窗口新建工程、导入图片、编辑提示词、保存并导出 `.canvas`。
2. 模拟宿主崩溃，覆盖安装新版，等待上游租约过期。旧端口另被占用时，验证同一工程 ID、节点、图片和窗口存储；切换英文。另一个写入会话应被拒绝，不能破坏原窗口。
3. 在这个工程的 **AI chat** 中发送请求。本地确定性模型只返回工具调用与文字：实际的 OpenCode 子进程、命令、写入回执、素材 ID 和持久化的回复均由应用生成。等待模型时打开原生退出确认，核对 Agent 数为 1，选择「否」，确认同一任务继续写入；没有连接付费服务。
4. 通过同一窗口导入可编辑时间线、渲染并下载 MP4。打包的 ffprobe 应读到 H.264、640 × 400、约 1.5 秒。点 × 隐藏，再启动同一 EXE 应唤回原进程。
5. 尝试在窗口仍运行时覆盖安装，应被拒绝。用不可作为目录的路径模拟服务启动失败，检查双语错误和日志；卸载后检查工程文件、密钥文件散列与独立 CLI 注册。勿在真实用户账户运行破坏性安装测试。

核心命令、包来源、运行时版本与可下载产物见 [README](README.md)。

desktop.6 新增：画布自动创建节点会避让已占位置（64 单位间隔），按水平或垂直轴取最近空位；拖放、替换、打开旧工程不触发全图重排。已有叠放的旧工程通过「自动排列」整理，`Shift+1` 看全图，`Ctrl+Z` 撤销。

## 可核对的证据与仍需人工验收的部分

- [原生 Windows 构建、安装测试、更新清单签名及安装重启](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44297067032)；[同一份安装器的独立跨版本验收](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44299900134)。构建源码 `049daf0`；实际安装包以 `delivery/SHA256SUMS.txt` 指纹为准，不用 Git 提交号代替文件校验。
- [旧版画布重叠与自动排列修复](delivery/canvas-debug.mp4) → [desktop.6 完整 Windows 工作流](delivery/studio-walkthrough.mp4) → [真正导出的 MP4](delivery/timeline-export.mp4)。演示为真实窗口截图帧；录像压缩了没有界面变化的等待时间，不能用来比较推理速度。
- 本轮有原生运行记录的异常路径包括并行安装竞争、上次目录交换中断且重试暂存失败、未认证访问、第二写入会话、旧端口已占用、宿主被终止、错误数据目录和运行时拒绝覆盖安装。未把每一个托盘菜单项的手动点击、每一种中断时机或任意第三方模型/编码器算作自动化通过。量产前仍应在正式 Win10/Win11 机型上核对托盘授权与拒绝、真实服务商恢复、SmartScreen 和系统编码器。

## desktop.7：P1–P7 回归记录

同一份 [Windows 构建及验收](https://github.com/hanyingHY/For-OpenDirector/actions/runs/44452250785) 在 Windows Server 2022 x64 上从已核验 SHA-256 的 desktop.6 创建项目，再用 desktop.7 覆盖安装和重开；单独的交接作业验证带真实签名的测试更新可以等待退出并重启，但不代表 desktop.6 已信任此候选分支的签名。

| 问题 | 验收结果 |
| --- | --- |
| P1 | 外部 XDG 数据目录放入缺少 `session` 表的 SQLite 数据库；安装版内置技能目录返回 200，真实 Agent 在确定性模型响应下通过 CLI 写入项目；外部数据库字节不变。 |
| P2 | 应用仍运行时直接调用 `Uninstall.exe /S`，退出码 2，已安装文件和注册保留。退出后静默卸载成功，工程、模型配置和独立 CLI 注册保留。 |
| P3 | 无效项目根触发真实 Python 异常；日志中能匹配原始中文文件名，并提供双语启动错误。 |
| P4 | 自动校验四个 PE 的产品名、描述与四段文件版本，以及 ARP 的显示版本、发布者、图标路径、安装大小。 |
| P5 | 本地测试覆盖跨启动间隔、手动检查、模拟 HTTP 403 `Retry-After` 和损坏状态文件；不需要故意用完 GitHub 的共享限额。 |
| P6–P7 | README 给出 `pwsh`、固定 Playwright 版本和验收命令；CI 归档摘要与源代码重建产物分别校验。 |

[最新窗口录像](delivery/desktop.7-windows-workflow.mp4) 与 [导出文件](delivery/desktop.7-timeline-export.mp4) 对应 [归档 EXE 校验和](delivery/SHA256SUMS.txt)。未覆盖所有 Win11 中文客户端的硬件/GPU 组合、真实第三方账号及上游每一个可选集成。

## desktop.9：时间线失败卡的出口（交互层，本轮）

本轮改的是 **同一份 React bundle 上的一处交互死角**，因此它的验收口径与装机不同：证据来自把锁定基线在沙箱里 **原样跑起来**（Vite + 上游隔离夹具 `tests/browser/creation_server.py`，真实 Chromium 窗口），打补丁前后各跑一次同一条旅程。

| 判据 | 修复前（`ab3f0585`，未打补丁） | 修复后（本分支 `patches/timeline-output-dismiss.patch`） |
| --- | --- | --- |
| 空时间线点「输出视频」 | 落下失败卡「请先向时间线加入素材。」，只有一个「重试输出」 | 用工程自己的 toast 回答同一句话，不产生覆盖层、不写工程（后端 `canvasItems` 里 video 数为 0） |
| 能否离开失败卡 | `Escape`、点画布空白、双击卡片、右键卡片、`Delete`、点重试、再点重试 —— **7/7 无效**，错误文案一字不变 | `编辑时间线 / 重试输出 / 关闭卡片` 三个出口都在；焦点自动落在 ✕；`Esc` 生效；关闭后覆盖层与 `pending`（连带 `blockedItemId` 对他人的阻塞）一起释放 |
| 关闭是否留痕 | 无法关闭 | 关闭后节点数回到 1，无孤儿 video；同一时间线随后仍能真实渲染并下载 H.264 MP4 |
| 中文界面 | 同样卡死 | 同一张卡三个控件都在（`编辑时间线 / 重试输出 / 关闭卡片`）；`delivery/od-timeline-output-after.mp4` 第 7 步 |
| 上游回归 | — | `npm test` 931 通过、`check:i18n` 3238 keys 0 problems、`tsc --noEmit`、`npm run build` 全绿；`npm run test:browser` 43 条旅程全通过（含 `timeline node output` 的真 MP4 发布与多版本校验） |

不包含什么：这不是装机验收。真实安装包仍要在 Windows runner 上按下面的「最短复验路线」跑；本轮没有构建 EXE，也没有把 `scripts/smoke.ps1` 的结果算进这里。`Host.cs` 退出确认的计数选择器 `'.cw-render-status progress,.cw-timeline-pending:not(:has(.cw-timeline-pending-error))'`：失败卡仍带 `.cw-timeline-pending-error`（不计入「正在导出」），且现在用户可以自己关掉它，所以「状态未知」的弹窗只会更少。**已知边界**：空时间线守卫把第一次 `setState` 移到保存往返之后，因此「点击输出 → 卡片出现」这段预检窗口在 DOM 上无痕，恰在此间退出不会报「导出 1」；此时本地编码尚未开始、文档写入仍是带版本号的保存命令，不会丢用户内容。彻底覆盖需要预检期渲染一个 DOM 标记，而那标记对合法拒绝也会闪一下——正是本补丁要消灭的形态，故不做，只记录。

### 沙箱验收的可复现口径（重要）

- 录像与验收用 **同一个** Chromium 与同一份 `package-lock.json`；`verification/reel.mjs` 只用 CDP 截流 + 浏览器 `MediaRecorder('video/mp4;codecs=avc1')`，不需要 ffmpeg，因此换一台机器也能重算。
- 该容器本来不带媒体工具：为了跑通上游 `timeline node output`（会用 `ffprobe` 校验真 MP4）临时装了 `@ffprobe-installer/linux-x64` 5.2.0 与 `@ffmpeg-installer/linux-x64` 4.1.0。**它们只是测试机的媒体探针，不是安装包内容**；发行版按 `scripts/package.py` 带 FFmpeg/ffprobe 9.0.2（含 libx264）。缺探针时上游旅程会以「需要 FFmpeg」失败（409），那是测试机环境，不是应用缺陷；它顺带验证了失败卡在 **服务侧失败** 下也有出口——两种分支的判据都记在 [DESKTOP-PARITY-REVIEW.md](DESKTOP-PARITY-REVIEW.md) §0。
- **判读规则**：同一常驻夹具上连跑两轮浏览器车道后，`locale` / `provider settings` 一类会出现 `409 operation_rejected`（编辑租约与修订号竞争，不是功能回归）。换一个新的 `--root`（或重启夹具）单独重跑即过。本轮第一次 41/43、第二次 41/43、单独重跑两条 → 43/43；结论按「单独重跑通过」记，但这条判读规则必须随交付一起说明，不能只报绿。
- H.264 编码能力判定：`VideoEncoder.isConfigSupported('avc1.42001F')` 在该 Chromium 为 true，且录像本身能被 `Video` 元素解码回放（`delivery/SHA256SUMS.txt` 对应三段录像）。

### 与上游 PR #397 的对照（结论：思路可借、壳不换）

见 [DESKTOP-PARITY-REVIEW.md](DESKTOP-PARITY-REVIEW.md) §5。要点：#397 用 Electron，本仓库用 WebView2，二者对 RFC 的取舍不同；值得借的是它把「正在导出」由渲染进程 **显式上报**（`ipcMain.on('desktop:exporting')`）而不是像我们这样反查 DOM 类名，以及 `docs/architecture/desktop.md` 那份宿主生命周期文档。冒烟/构建同 job、产物与录像同构建的做法已由 `verification/reel.mjs` 在 Linux 侧对齐。

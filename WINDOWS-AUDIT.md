# Windows 对照清单 · RFC #362

核对基线：[RFC 与六项工作](https://github.com/ThinkFlowLab/OpenDirector/issues/362)；[对应的原版网页、服务与 CLI 源码](https://github.com/ThinkFlowLab/OpenDirector/tree/d05a56d712349ee7e4c61407cfc2d0258724cefa)。这是本分支的 Windows 验收记录，不代表上游已经接受或关闭这些 issue。

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

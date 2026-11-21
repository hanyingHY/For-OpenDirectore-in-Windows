# 网页版 ⇄ Windows 版：体验对照、差异清单与迭代建议

> 面向 [RFC #362](https://github.com/ThinkFlowLab/OpenDirector/issues/362)（D1/D3）的评审文档。
> 基线：上游 `ThinkFlowLab/OpenDirector@ab3f0585`（本分支 `scripts/package.py` 里 `SHA` 锁定的提交，
> 即本轮复核时的 `main` 头）；桌面侧基线：本仓库 `desktop.9`（WebView2 + 打包 Python）。
> 本文「网页版」结论来自在沙箱里 **把锁定基线原样跑起来**（同一 `package-lock.json`、同一 Python 服务、
> 不套桌面壳、不装补丁）并真实点击；「修复后」结论来自同一实例 + `patches/*.patch` 的第二次运行。
> 两条旅程都录成了 MP4（见下表），帧内容即判据，不是叙述。
> 装机（Windows 上的安装/升级/卸载）仍需按 [WINDOWS-AUDIT.md](WINDOWS-AUDIT.md) 在 runner 上复验。

---

## 0. desktop.9：时间线「失败卡」的出口（本轮修复）

### 症状与根因

报告的问题：时间线里还没有素材时点「输出视频」，画布上出现失败卡「请先向时间线加入素材。」，
而这张卡 **关不掉**。逐行核对 + 实机运行确认：这是 **上游 UI 的缺陷，不是 Windows 适配引入的**——
同一份 React bundle 在网页版里一样卡死。

1. 失败卡（`TimelinePendingVideo`，`src/canvas/TimelineOutput.tsx`）是 **虚拟覆盖层节点**：
   `selectable:false / draggable:false / deletable:false / focusable:false`。选不中 → `Delete` 无效；
   焦点进不去 → `Esc` 无从触发；双击、`Enter`、`F2`、右键菜单都被 capture 掉（那是防误改名的上游设计）。
2. 「取消合成」只在 `rendering/publishing` 阶段存在，`cancel()` 也只中断 `rendering`。
   `failed` 态没有任何路径把 state 置空：只有换工程、或 **删掉来源时间线节点** 才会顺带清掉它。
3. 「重试输出」对「时间线为空」永远是同一个错——点一次失败一次，形成事实上的死角。
4. 附带伤害：发布失败（`CreationCommandError`）时挂起的 `pending` 会通过 `blockedItemId`
   **阻塞其它时间线的导出按钮**，直到那次重试恰好成功。

### 沙箱实测（未打补丁，upstream `ab3f0585`）

空时间线 → 选中节点 → 「输出视频」后，逐条尝试用户会想到的每种退路，结果全部失败：

| 尝试 | Escape | 点画布空白 | 双击卡片 | 右键卡片 | Delete | 重试输出 | 再点重试 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 卡片仍在 | 是 | 是 | 是 | 是 | 是 | 是（错文案不变） | 是 |

7/7 失败，错误文本一字不变 —— 与报告一致。录像：`delivery/od-timeline-output-before.mp4`。

### 修复（`patches/timeline-output-dismiss.patch`）

- **空时间线不再产生卡**：`run()` 在读到已保存的编辑器文档后先算时长，为 0 就用工程自己的 toast
  回答（`errors.render.timelineEmpty`，卡片自带 ✕ 可关），不落库、不留覆盖层。判定用**已保存的文档**
  而不是画布节点的缓存副本——同一次会话里刚编辑过的节点副本是旧的。
- **真失败必须有三个出口**：`编辑时间线`（直达失败原因所在）· `重试输出` · `关闭卡片`（右上角 ✕，
  `aria-label`/`title` 用 `timeline.output.dismiss`）。
- `useTimelineOutput().dismiss()`：中断在途渲染、丢弃已缓存的渲染结果、清空覆盖层；同时清掉 `pending`，
  **顺带解除第 4 点的连带阻塞**。覆盖层在 `timelinePublication` 之前不落库 → 关闭即无痕，不留孤儿 video 节点。
- **键盘可达**（本轮相对上一版草稿的新增）：
  - 进入 `failed` 时把焦点落到 `关闭卡片`，除非用户已在卡片内或模态框（时间线编辑器可以叠在卡上）持焦；
  - `Esc` 在卡片持焦时被当作「离开这张卡」。必须在 **document 的 capture 阶段** 接：
    工作区根节点的 `onKeyDownCapture`（`useWorkspaceInteraction → onWorkspaceKey`）会在 React 把 keydown
    分发到节点内部之前就 `stopPropagation()`，写在卡片上的 React 处理器根本不会执行——这一点是实测撞出来的，
    第一版实现（写在 `onKeyDownCapture` 里）在真实浏览器里静默失效。
- `notice` 从「有默认值的可选参数」改成 **必填参数**：一个无法通知的调用方会把用户点击吞成空气，
  而这正是本补丁要终结的失败形态；类型层面强制比约定更可靠（调用点只有 `WorkspaceView` 一处）。
- 「发布中」按钮保持原样（禁用取消）以免与发布命令竞态；「重试复用已渲染片段」的原语义保留。
- 把「时间线还没定下来」这段时间也算作忙碌：空时间线守卫把第一次 `setState` 挪到保存往返之后，
  于是这段窗口里既没有 phase 也没有卡片。`busy` 因此改成 `!!active.current || phase is rendering/publishing`
  （`run()` 自己就是用 `active.current` 拒绝二次提交的，`finally` 里必定清空），
  让输出按钮在这段窗口里仍然禁用，不把「点了没反应」换成「点了两下排两次队」。
- 双语键 `timeline.output.edit` / `timeline.output.dismiss` 进入消息目录，`npm run check:i18n` 通过
  （3238 keys，0 problems）。不改存储格式、发布命令、编码规则与模型行为。

### 验证

| 判据 | 结果 |
| --- | --- |
| 空时间线 | 回答是 toast，`.cw-timeline-pending` 数量 0；后端 `canvasItems` 里没有多出 video（无孤儿） |
| 真编码器失败（4096×4096，H.264 level 超限） | 三个出口齐全，顺序即 `编辑时间线 / 重试输出 / 关闭卡片` |
| 键盘 | `document.activeElement` 落在 `.cw-timeline-pending-close`；`Esc` 后卡片从 DOM 移除 |
| 关闭后 | 节点数回到 1（覆盖层消失），同一时间线再输出仍能成功；`blockedItemId` 不再挂住其它时间线 |
| 中文界面 | 同一张卡的三个控件都在（见下方「一个意外但有价值的分支」） |
| 上游回归 | `npm test`（929 通过）、`npm run build`、`tsc --noEmit`、`check:i18n` 全绿；`verification/timeline_output_dismiss.mjs` 通过 |
| 录像 | `delivery/od-timeline-output-before.mp4`（缺陷）· `delivery/od-timeline-output-after.mp4`（修复后同一旅程）· `delivery/od-timeline-app-export.mp4`（另附同帧截图 `delivery/timeline-before-stuck.png` 与 `delivery/timeline-after-failed-card.png`）（应用自己导出的 640×400 H.264） |

**一个意外但有价值的分支**：第一轮录制时（该容器还没有 ffprobe），同一张卡的错误文本是服务端的
「视频和音频需要 FFmpeg：请安装并确保 ffprobe 在 PATH 中，然后重启服务。」（`probe.require_ffprobe` 的 409），
而不是编码器拒绝。原因不是补丁，而是测试机缺探针；装上探针后同一条旅程回到编码器拒绝分支，其余判据不变。
它顺带证明了一件更重要的事：**失败卡是所有失败原因的公共呈现面**，编码器拒绝和服务端 409 都会落到这里；
出口必须对两种原因、两种语言都成立。实测成立。装机场景里「运行时被删坏」正是用户最容易卡死在卡上的时刻。

### 与桌面壳退出确认的接缝（本轮一并核对）

`Host.cs` 判断「是否还在导出」用的是 `ExecuteScriptAsync` 反查 DOM：
`'.cw-render-status progress,.cw-timeline-pending:not(:has(.cw-timeline-pending-error))'`。

- 失败态仍然带 `.cw-timeline-pending-error` → **不计入**「正在导出」，与修复前一致；而且现在用户能自己关掉卡，
  退出确认里「状态未知」的概率只会下降。
- 需要说明的**收窄**：因为空时间线守卫把 `setState` 放到保存往返之后，从「点击输出」到「卡片出现」这段
  预检窗口里 DOM 上没有任何可查的痕迹，若用户恰在这几百毫秒内选择退出，宿主不会报「导出 1」。
  后果是有界的：本地编码还没开始，文档写入走的是同一套带版本号的保存命令，不会丢用户内容——
  丢的是一次还没起跑的导出，而这本来就是「退出即中断本地工作」的语义。
  要彻底覆盖就得在预检期渲染一个 DOM 标记，而那张标记对「空时间线」这种合法拒绝也会闪一下，
  正是本补丁要消灭的形态，所以没有做。**记录为已知边界。**

### 证据怎么来的（可复现，不需要 Windows）

`verification/reel.mjs`：CDP `Page.startScreencast` 抓窗口自己的重绘 → 丢弃相邻重复帧、
每帧最多驻留 0.9s（等待被压缩，运动不被压缩）→ 在第二个页面里把帧序列画到 canvas，
用 `MediaRecorder('video/mp4;codecs=avc1…')` 编码成 MP4。**没有 ffmpeg、没有浏览器下载、没有原生工具链**，
而且用的是应用导出 MP4 时同一个编码器：这份录像能播，就说明该机的 H.264 编码通路可用。
字幕是注入被测页面的浮层（`pointer-events:none`），所以录像自带讲解，不需要后期。

```bash
python tests/browser/creation_server.py --port 8019            # 上游隔离夹具
OPENDIRECTOR_API_URL=http://127.0.0.1:8019 npx vite --port 5179 --strictPort
export BROWSER_PATH=<chromium> PLAYWRIGHT_MODULE=<playwright-core/index.mjs>
export CREATION_WEB_URL=http://127.0.0.1:5179 CREATION_API_URL=http://127.0.0.1:8019
OD_REEL=before node verification/timeline_output_reel.mjs       # 未打补丁
git -C source apply ../patches/*.patch ../verification/desktop-error-contract.patch
OD_REEL=after  node verification/timeline_output_reel.mjs       # 打补丁后同一旅程
node tests/timeline_output_dismiss.mjs                          # 状态机断言
```

Windows 装机侧的同一场景仍由 `verification/render.mjs`（`OD_VERIFY_RENDER=1` 的 `scripts/smoke.ps1`）
在真实 WebView2 窗口里跑；这里的两个脚本共用同一组选择器与判据。

---

## 0.1 desktop.11：导出宿主契约 · 租约自愈 · 重试卡出口（本轮修复）

### ① 渲染导出的宿主契约 `data-od-exporting`（PR #397 取「信号」弃「桥」）

**症状**：Host.cs 判断「是否有导出进行中」（退出确认、托盘状态）靠扫描 DOM 里的
`.cw-render-status progress` 等视图类名——渲染一完成，完成卡上残留的 progress 元素
（及失败卡的 `[aria-busy]`）会让宿主误判为仍在导出，退出确认被无谓拦截。

**取舍**：PR #397 让 Electron 主进程收 `desktop:exporting` 事件。WebView2 壳没有 IPC 桥，
但契约本身可借：应用在 `documentElement` 上置位 **`data-od-exporting`**（有引用计数：
多个时间线并发导出只在全部结束时撤销；**进行中才置位**，完成卡/失败卡不算）。Host.cs
`InspectAsync` 优先读该属性，旧选择器保留兜底；同时兼容 `window.opendirectorDesktop.
setExporting` 桥（将来任何壳都可零改动接信号）。三处渲染入口（DirectorStage 预览、
TimelineEditor 封装导出、TimelineOutput 时间线输出）都挂钩，挂载级 `useExportSignal`，
组件卸载即释放——没有泄漏的「永久导出中」。

### ② 「他窗占用」自愈等待（open-elsewhere）

**症状**：应用被强杀/崩溃后 60 秒内重开同一项目，后端租约（`LEASE_SECONDS=60`）未过期，
UI 弹硬错误卡 "This project is open in another window"，只有手动「重新连接」——而用户能做
的本来就只有等。三个沙箱会话在无关工作中都踩到这个坑。

**修复**：初始化层（`useWorkspaceDocument`）对 `project_open_elsewhere` 单独静默重试
（3 秒 × 25 次 ≈ 75 秒，覆盖租约剩余寿命），等待态是专门的加载文案：说明在等谁、约多少秒
后自动进入，并保留「重新连接 / 返回画布首页」两个出口（失败态出口纪律）。租约到期自动进入，
零点击。重试耗尽（真的有别的活窗口）才落回原错误卡，不掩盖真冲突。租约语义零改动：
不抢租、不缩租、不碰 sessions 存储。桌面侧配套：`service.py` 的 SessionJournal 在下次
启动时释放上次崩溃遗留的渲染端会话（绝不碰独立 CLI 租约），`tests/test_transport.py` 7 项。

### ③ 重试输出不再产生关不掉的卡

§0 修复后遗留的一条缝：失败卡上点「重试输出」时焦点仍落在卡片内，若再次失败，
Escape 一按焦点被吞。本版把重试链与失败卡的出口（Escape / ✕）连通，判据见
`verification/timeline_output_dismiss.mjs` 的「failed card closable」段。

### 判据与证据

| 判据 | 证据 |
| --- | --- |
| 导出信号：渲染进行中置位、结束归零、失败路径零残留 | `verification/export_signal_contract.mjs`（真实渲染 44 采样，8 点命中；桥 `[true,false]`）；全量实录第 6 章 [delivery/desktop11-full-journey.mp4](delivery/desktop11-full-journey.mp4) |
| 他窗占用：等待态双出口 + 零点击自动进入 | `verification/open_elsewhere_autoretry.mjs`（PASS）；全量实录第 8 章 |
| 契约静态守卫：Host.cs 读取顺序、双语文案、打包链顺序 | `tests/test_export_signal_contract.py`（5 项） |
| 全量真机模拟（九章，含双语、上传、导入、真实 H.264） | [delivery/desktop11-full-journey.mp4](delivery/desktop11-full-journey.mp4) |

### 上游缺陷候选（未修，建议提 issue）

**「Fit all」在渲染后状态静默 no-op**：⇧Shift+1 与缩放菜单的 Fit all 在时间线渲染完成后
（节点被自动移出视口，D7）完全不移动相机（100ms×12 采样几何零变化），无报错；
`zoomTo(100%)` 正常。路径为 `flow.fitView({nodes: [{id}]})`（@xyflow/react 12.12.0），
canvas-placement 补丁不涉 `fit()`，疑为 xyflow 的 nodes 过滤语义问题。旅程以「缩放菜单输入 8%」
的用户路径绕过（`export_signal_contract.mjs` 的 `seeEverything`）。复现探针见
`.work/upstream/tests/geom_probe.mjs`（临时树，已记档）。

## 1. 对照方法

- 锁定基线原样跑起来（不套壳、不打补丁）进入画布、创建时间线、触发导出失败；再以同一实例 +
  `patches/` 四张补丁重跑，形成 A/B。桌面壳（`Host.cs`/`service.py`/NSIS/更新器）逐行读源码，
  对照装机录像与截图推断 Windows 侧行为。
- 口径：UI 层「两个版本」本就是 **同一份 React bundle**（打包时上游树上只多了几张补丁），
  所以体验差异 ≈ 宿主环境差异（WebView2/窗口/生命周期）+ 桌面壳新增行为，而不是界面差异。
  这符合「体验完全等同原项目」的目标，也意味着 **修复应做进补丁，而不是在 fork 里另写一套 UI**。

## 2. 体验差异矩阵（按用户旅程）

图例：✓ 等同（且已验证或有测试） · △ 有意为之的桌面差异 · ⚠ 需要跟进的差距 · ✗ 缺陷

| # | 旅程环节 | 网页版 | Windows 版 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | 打开即用 | 自备 Node/Python/服务 | 双击安装，随包 CPython/FFmpeg/OpenCode/MinGit | ✓（交付目标本身） |
| 2 | 建工程/画布/素材导入 | 浏览器标签页 | 同 bundle，同一 `~/.opendirector` 数据根 | ✓ |
| 3 | 空时间线导出失败 | 修复前：失败卡关不掉（同一缺陷） | 同一缺陷 → desktop.9 已修 | ✓（修复后，本文 §0 有 A/B 录像） |
| 4 | 导出中关页面 | **无 beforeunload 守卫**，直接丢任务 | × 隐藏到托盘；退出需确认并枚举 Agent/生成/导出计数 | ✓（桌面比网页更防误丢；网页值得反向借鉴） |
| 5 | 渲染期间窗口可见性 | 后台标签被节流，渲染变慢 | 隐藏到托盘后同样可能被节流 | ⚠（§4.1） |
| 6 | 文件保存/下载 | 浏览器下载目录、`chrome://downloads` | WebView2「另存为」，无下载管理入口 | ⚠（§4.3） |
| 7 | 右键上下文 | 浏览器菜单 | 默认浏览器菜单全开（重载/打印/查看源/检查） | ⚠（§4.2） |
| 8 | 页面缩放 | 地址栏天然存在 | Ctrl+滚轮页面缩放与画布自身 zoom 叠加 | ⚠（§4.2） |
| 9 | 多窗口/多会话 | 多标签共享后端；409 锁 | 原生多窗 + 同一 409 锁 | ✓ |
| 10 | IME/快捷键 | 浏览器原生 | 同内核；`Alt+Enter`/`Ctrl+Enter`/`Shift+1` 无冲突；卡片现在也吃 `Esc` | ✓（Win 机 IME 候选窗定位需实机复验） |
| 11 | 高 DPI | per-monitor | 仅 System-aware，混合 DPI 多屏会糊 | ⚠（§4.4） |
| 12 | 窗口记忆 | 无此概念 | 固定 1440×900 居中，不记忆 | ⚠（§4.4） |
| 13 | 崩溃恢复 | 刷新即可；租约 60s | Job Object 杀进程树；重启唤起同一窗口数据；租约同 60s | ✓ |
| 14 | 模型配置与密钥 | 后端按用户存盘 | 同一文件 + DPAPI 会话凭据、任意本机进程 403 | ✓ + 更强隔离 |
| 15 | CLI/工程互操作 | 无 | App Paths 注册 `OpenDirector-CLI.exe`，GUI/CLI 同一把锁 | ✓（桌面独有） |
| 16 | 更新 | 永远是服务器上的最新版 | Sigstore 校验 + 12h 检查 + 确认式重启 | △ |
| 17 | 卸载 | 删文件夹 | 保留工程/凭据/CLI 注册；运行中拒绝（exit 2） | ✓ |
| 18 | SmartScreen/来源 | HTTPS 站点 | 无 Authenticode，README 教核对 SHA-256 | ⚠（发行决策，§6） |

## 3. 「失败/卡住」状态盘点

这次「关不掉的失败卡」不是孤例，值得做成 **统一的失败呈现规范**：

| 状态 | 现状 | 能否脱困 | 备注 |
| --- | --- | --- | --- |
| 时间线失败卡 | desktop.9：编辑/重试/关闭 + `Esc` | ✓ | 本文 §0 |
| 发布被 `blockedItemId` 阻塞 | 其它时间线导出按钮禁用 + `otherPending` | 间接 | 关闭卡片立即解除 |
| 图像/视频/音频节点生成失败 | 真实节点，可删除/重试，错误在卡内 | ✓ | 文案统一化建议同上 |
| 后端 503 / 服务掉线 | `desktop-error-contract.patch` 给双语修复指引（含日志路径） | ✓ | 保持 |
| 服务端 409（缺 FFmpeg/ffprobe） | 也落到同一张卡 | ✓（desktop.9 后） | 本轮实测；安装包自带 FFmpeg，损坏时才见 |
| WebCodecs 不可用（N 版 Windows 无媒体包） | 渲染中途抛原始文本 | ✓（能关） | 建议预检 `VideoEncoder.isConfigSupported` + 「装 Media Feature Pack」双语指引 |
| 渲染一半宿主被杀 | 状态归零，无「上次被中断」标记 | 手动重来 | §4.1 |

**规范（可提上游）**：一切「进行中卡片」必须满足三条——① 必有出口（成功→产物、失败→重试+关闭、
取消→还原）；② 关闭即释放全部互斥（这里是 `blockedItemId`）；③ 错误文本可复制、含可行动下一步。
desktop.9 已满足 ①②③（`.cw-timeline-pending-error { user-select: text }` 就是 ③）。
建议把 `TimelineOutput.tsx` 的模式回给上游做组件级约束，并配一条守卫：`failed` 相必须渲染带 `dismiss` 的按钮行。

## 4. desktop.9+ 候选改进（方案都已核对可行，未在本轮实施）

### 4.1 导出与窗口存活解耦（最大的体验差）
渲染发生在页面里，README 要求「导出时保持应用运行」。可选：① 导出期间宿主持 `PowerCreateRequest`
（防睡眠，改动最小）；② 托盘图标显示进度环 + 完成/失败 toast（已有 `/__desktop/activity` 计数接入点）；
③ 把渲染移进打包 Python + 捆绑 FFmpeg ——**不建议**，等于复刻第二套渲染管线，违背「体验等同」第一原则。

### 4.2 像应用，而不是像网页
```csharp
core.Settings.AreDefaultContextMenusEnabled = false;
core.Settings.IsStatusBarEnabled = false;
core.Settings.IsZoomControlEnabled = false;   // 画布有自己的缩放，页面缩放是干扰项
core.Settings.AreDevToolsEnabled = false;      // 诊断走 desktop.log
```
配套：关右键菜单前先接管 `DownloadStarting`（§4.3），否则「图片另存为」习惯被砍。

### 4.3 下载体验
`DownloadStarting` → 默认落到 `%USERPROFILE%\Downloads\OpenDirector\`，完成 toast 带「打开所在文件夹」。
网页版保持浏览器原状——等同的是 UI/业务，不是宿主默认值。

### 4.4 窗口质感
Per-Monitor V2（`SetProcessDpiAwarenessContext` 于 `Main()` 首行，无需 app.manifest）；
窗口位置/尺寸写 `%LOCALAPPDATA%\OpenDirector\Desktop\window.json` 并钳制到在线显示器工作区。
DPI 需要多屏实机验证后再放行。

### 4.5 安装体积（可选）
把「AI Agent 运行环境」做成 NSIS 可选组件（默认勾选），纯剪辑用户可减约 35%；
需要在 WINDOWS-AUDIT 的「不包含什么」里同步语义。

## 5. 与上游 PR #397（Electron 桌面壳）的对照

[ThinkFlowLab/OpenDirector#397](https://github.com/ThinkFlowLab/OpenDirector/pull/397)
是同一 RFC 的另一条路线，值得逐项对照——**结论是「思路可借、壳不换」**：

| #397 的做法 | 本仓库 | 判断 |
| --- | --- | --- |
| Electron 壳 + `webContents` 复用 Web UI；关闭窗口后 Host 继续存活 | C# WinForms + WebView2 Evergreen；× 隐藏到托盘 | 不换。WebView2 免带一整套 Chromium（体积、更新、企业白名单都受益），且直接吃系统媒体栈；代价是要自己管退出确认与租约 |
| `ipcMain.on('desktop:exporting', …)`：渲染进程 **显式上报**「正在导出」 | `Host.cs` 用 `ExecuteScriptAsync("!!document.querySelector('.cw-render-status progress,.cw-timeline-pending:not(:has(.cw-timeline-pending-error))')")` **反查 DOM** | 值得借。反查把宿主判定绑在 UI 类名上；#397 的信号不会。WebView2 的等价物是 `window.chrome.webview.postMessage` + `WebMessageReceived`，但需要在页面里加一处上报（会进补丁面）。**建议**：保留 DOM 反查为兜底，另加一条 `data-od-exporting` 属性上报，避免类名重排把「正在导出」误判成 0 |
| `docs/architecture/desktop.md`（+ zh-CN）把宿主生命周期写成文档 | 只有 README/WINDOWS-AUDIT 两处 | 值得借：`desktop.md` 那套「Host 就绪 → 认证回环 → 关闭语义」的图 + 状态表，本仓库缺 |
| `prepare-runtime.mjs` + `smoke.mjs` / `smoke-window.mjs`（291 行窗口级冒烟）+ 「Desktop Release」工作流：tag 或手动触发 → 双平台构建 → 安装后跑冒烟 → mac 侧签名前后各验一次 → 各自上传到同一 draft | `scripts/package.py` + `scripts/smoke.ps1` + `windows.yml`/`canvas.yml`/`delivery.yml` | 我们更严（Sigstore 发布清单、跨版本覆盖安装、真实 Agent 车道）。可借的是它把 **冒烟与构建同 job、产物与录像同构建** 的耦合方式：本轮 `verification/reel.mjs` 正是同一思路的 Linux 版 |
| 认证回环：一次性随机挑战 + Host/Origin 校验 | 同一思路（DPAPI 票据 + 挑战 + 403） | 已对齐；`tests/test_transport.py` 覆盖 |
| 折叠式工程侧栏、平台化窗口按钮、终端命令注册 | 侧栏沿用上游；CLI 走 App Paths | 上游已含侧栏；Win 侧不需要再仿 |
| 首条消息「思考中」卡住等 i18n 修复 | 已在 `desktop.7` 覆盖 | 保持 |

本轮 **没有** 采纳 #397 的任何 UI 复刻，理由同 §1：桌面版必须吃同一份 bundle。

## 6. 需要你拍板的问题

| # | 问题 | 选项 | 我的倾向 |
| --- | --- | --- | --- |
| D1 | desktop.9 的发布方式 | 只出 CI artifact / 建 draft release 附 EXE+SHA256 / 直接推稳定频道 | draft release：更新频道信任 `main`，候选分支不进公开推送 |
| D2 | §4.2/4.3/4.4 是否进 desktop.9 | 全收 / 只收 4.2+4.3 / 逐项 | 4.2+4.3 先做（改动小、观感提升最大）；DPI 等多屏实机 |
| D3 | 失败卡补丁是否回贡上游 | PR / 仅 fork 补丁 / 等上游 | **PR**：本轮复核确认 `main@ab3f0585` 的 `TimelineOutput.tsx` 与锁定基线该文件 **逐字节相同**（补丁能干净套用即为证），缺陷在最新上游仍在；网页版同样中枪。`patches/timeline-output-dismiss.patch` 是干净的 `git diff`，可直接转 PR，建议连 `verification/timeline_output_dismiss.mjs`（精简旅程）一起给 |
| D4 | 渲染节流（§4.1） | PowerRequest 保活 / 离屏 WebView / 暂不做 | 先 PowerRequest + 托盘进度 |
| D5 | WebCodecs 缺失指引 | 归入失败卡文案（前端）/ 宿主预检 | 前端：与双语目录同处维护，桌面壳不掺业务文案 |
| D6 | 签名 | 继续无签名+SHA-256 文档 / 申请证书 | 面向非技术用户分发时证书优先级要提上来 |
| D7 | 上游「节点在视口外时隐藏多选工具栏」 | 提上游修 / 验收脚本自己 `Shift+1` | 验收脚本已自适应（每碰一次节点先 `Shift+1`）。但 **渲染把相机移到输出位 → 失败卡关掉后原节点常在视口外**，用户点不到工具栏是真实papercut；建议单独开上游 issue，不在本补丁里夹带 |

---

## 7. 同类产品对照（为什么「失败必须有出口」是这一品的及格线）

本轮按你的要求看了同类产品的失败态工艺。要点不是「他们也这么做」，而是这条 **产品语义**：
在画布/节点式创作工具里，一次失败是「可编辑状态」，不是「需要被消掉的弹窗」——
所以每个进行中/失败的节点都必须自带出口，且出口要指回可修的对象。

| 产品 | 节点式画布 + Agent | 失败/拒绝时的呈现 | 对我们的启发 |
| --- | --- | --- | --- |
| TapNow（tapnow.ai，「Agentic Creative Canvas」） | 文本/图/视频/音频节点 + 连线，Agent 作为「执行导演」逐步推进 | 节点保留在画布上、失败标记在节点内，用户改参数/换模型后在同一节点重跑；社区模板（TapTV）可克隆复用 | 「编辑来源 → 原地重试」这条最短回路；我们把它做成 `编辑时间线` 按钮，正是同一语义 |
| Topview Canvas / Motivoo / OiiOii 2.0（智能画布） | Agent 直接在生产画布上落子，用户接受/拒绝/改写 | 以「接受/拒绝/改写」为一等操作，失败与不满意共用同一组动作 | 「拒绝」（= 丢弃这次结果、回到干净状态）必须是显式动作；我们的 `关闭卡片` 就是它 |
| 开源 `basketikun/infinite-canvas` 系（同类中文开源工作台） | 无限画布 + 生图/生视频 + 本地 Agent/MCP | 生成工作台有「失败详情」面板与缩略图留存 | 失败详情要能复制/留存（我们的错误块已 `user-select:text`）；后续可加「复制错误」到卡片 |
| opencode（你给的定位坐标） | — | TUI 里任何一次工具调用失败都保留可退出路径与重试入口，绝不出现只能杀进程的状态 | 「harness 的可信度来自可退出性」：本仓库把这条写进规范（§3）并配守卫建议 |

一句话结论：这次修的是一张卡，但真正对齐的是 **失败态工艺**。所以 §3 的三条规范 + 守卫建议，
比补丁本身更值得进上游。

---

### 附：desktop.9 变更清单

- `patches/timeline-output-dismiss.patch`：空时间线用 toast 回答（不落覆盖层）；真失败给
  `编辑时间线 / 重试输出 / 关闭卡片`；进入失败相把焦点放到 ✕，`Esc` 在 document capture 阶段接管；
  `useTimelineOutput().dismiss()`；`notice` 改为必填；双语键 `timeline.output.edit` / `timeline.output.dismiss`。
  不触碰渲染、发布、存储与互斥的既有业务语义。
- `verification/reel.mjs`（新）：无 ffmpeg 的录像通路（CDP 截流 → 浏览器 H.264 编码 → MP4）。
- `verification/timeline_output_reel.mjs`（新）：同一条旅程在打补丁前后各录一次，并打印判据 JSON。
- `verification/timeline_output_dismiss.mjs`：加键盘判据（焦点落点、`Esc` 生效）；步骤 (3) 前先让卡片再失败一次。
- `verification/browser-engine.mjs`（新）：优先复用上游 `tests/browser/engine.mjs` 的启动策略，容器内退化为同参数本地实现。
- 基线推进：`scripts/package.py` 的 `SHA` → `ab3f0585`，`desktop/VERSION` → `0.1.4-desktop.9`。

---

## 8. 下一步计划（按「谁必须参与」分类）

判断依据：这一轮把「交互层的失败态」做成了一个可复现口径（补丁 + 旅程 + 录像 + 独立 CI 车道），
`desktop.9` 也已在 `windows-2022` 上出包并通过 `smoke.ps1`。剩下的事按**能不能在 CI 里自动判定**切开。

### A. 我这边可以直接推进（不需要你介入）

| # | 事项 | 做法 | 完成判据 |
| --- | --- | --- | --- |
| A1 | 把「导出中」从 DOM 类名耦合里解耦 | 上游侧统一挂 `data-od-exporting=""`，`Host.cs` 优先读它、读不到再退回今天的选择器；写进 `docs/architecture` 式契约 + `check-browser-manifest.mjs` 一样的静态守卫 | 契约测试断言「存在 `data-od-exporting` 时 `Host` 计数正确」；把选择器改坏会让 CI 红，而不是靠人记 |
| A2 | 失败态普查落地 | 按 §3 的清单逐个补出口，每个都配一条旅程（像本轮的 `timeline_output_dismiss.mjs`），统一进 `reel` 之外的常驻车道 | 清单里没有「只有『重试』一条路」的失败态；每条旅程可在干净检出上跑通 |
| A3 | 安装包体积审计 | 在 `package.py` 里输出一份装配清单（每个来源目录的字节数 + 排除原因），与 desktop.7 的 138,799,603 B 对齐差异 | 能说清 +40% 落在哪几项；无解释的增量要么排除、要么写进 README 的体积说明 |
| A4 | 录像车道补齐对照面 | `reel` 车道加跑 §3 的其它失败态，产物按失败态分文件上传；同时把 `check-mp4` 的「解码回来读一遍」做成硬断言 | 每条录像都有「帧能解码 + 字幕可读」的自动判定，不依赖人眼看 |
| A5 | 上游报告 | 把这条 bug（最小复现 + 根因 + 本补丁）整理成 issue/PR 文案投给 `ThinkFlowLab/OpenDirector`；上游 accept 后本仓库的补丁降级为「历史兼容层」 | 文案含可复现步骤与录像链接；上游回应前，本仓库口径始终以补丁为准 |

### B. 需要你或一次真实桌面才能判定（自动化到不了的地方）

| # | 事项 | 为什么自动化不了 | 需要你做的 |
| --- | --- | --- | --- |
| B1 | 双击安装 → 首次启动 → 退出确认的肉眼验收 | runner 是服务会话：截图只证明像素可读，不证明「人点得动」；中文 IME 的合成框、`Alt+Tab`、DPI 缩放同理 | 在 Win11/Win10 家庭版各装一次 `Windows-installer-x64`，重点看：UAC 措辞、卸载页、中文界面下的退出确认弹窗文案、时间线空素材时那条 toast |
| B2 | 未签名 EXE 的 SmartScreen 体验 | 需要真实的下载来源与 Mark-of-the-Web | 你决定：走自签证书、还是接受「仍要运行」的教育成本；这决定发布页要不要放图示说明 |
| B3 | 12 小时检查节流的真实手感 | 需要跨重启、跨时区的长时间在线 | 你日常用几天，看更新提示出现/不出现得是否符合预期；异常时把 `updates.log` 给我 |
| B4 | `delivery/windows-*.png` 这批装机证据的取用 | 沙箱到 `*.blob.core.windows.net` 被代理截断，我拉不下工件 | 在 run 44519092194 页面下载 `Windows-native-evidence`，如果想让它进交付包，丢回 `delivery/` 我来补 SHA256 与文档口径 |
| B5 | Imoon 的对照 | 我搜不到你指的那家（只搜到同名动画生成器与无关榜单） | 给我一个 URL 或全名，我把它的交互逐项并进来对比 |

### C. 我建议暂时不做（以及理由）

- **不做 Electron 外壳**：#397 那条路要背上自己的渲染层与打包栈；`WebView2 + Host 单口` 是已经装机验证过的通道。本轮反而从 #397 借到了更值钱的东西——契约文档与冒烟分层（见 §5）。
- **不在桌面壳里做任何「Windows 专属 UI」**：失败卡、toast、快捷键都留在 React 层，Windows 只改宿主行为。本轮补丁就是这条纪律的执行样本。
- **不把 `timeline node output` 的 409 预检分支做成确定性断言**：它取决于测试机有没有 `ffprobe`（见 §0 的翻车记录）。要稳定复现得给夹具注入假探针，那是夹具工程，不是产品缺口。

> 优先级建议：**B1 > A1 > A3 > A2 > B4 > 其余**。B1 决定「能不能说 desktop.9 已交付」；A1/A3 是下次发版前必须收的两笔技术债；A2 是同类产品的交互面差距。

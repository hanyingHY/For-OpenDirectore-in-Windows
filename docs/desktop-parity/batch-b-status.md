# desktop.14 · Batch B 状态（A1 简洁/进阶模式、A2 首次选择、C1 快捷键与持久化）

更新日期：2026-11-22 · 分支：`arena/1d7b4478-for-opendirectore-in-windows`

## 1. 已提交内容

| 提交 | 内容 |
| --- | --- |
| `ac4d3b0` | A1 MVP：顶部切换按钮；简洁模式对话居中、隐藏侧栏、画布减弱；偏好存 `opendirector.work-mode.v1` |
| `fd21be7` | 进度记录与沙箱注意事项 |
| `9f60aa4` | A2：首次运行选择框（非模态，欢迎框关闭后出现一次，直到选择为止） |
| `28135fd` | 批次 B 录屏（中、英）与进度说明 |
| `a117380` | A1 补充：简洁模式系统预设抽屉（4 个预设填入草稿，可在输入框编辑）与添加参考图按钮 |

交付位置：
- 补丁：`patches/work-mode.patch`（接在既有 7 张补丁之后，已接入 `scripts/package.py`、画布 workflow 与 `tests/test_export_signal_contract.py`）
- 验证脚本：`verification/work_mode.mjs`（支持 `LOCALE=zh-CN|en-US`、`RECORD_DIR`、`SLOWMO`）
- 录屏：`delivery/desktop14-work-mode-zh.mp4`（24.5 s）、`delivery/desktop14-work-mode-en.mp4`（22.2 s），已写入 `delivery/SHA256SUMS.txt`

## 2. 已验证

- `work_mode.mjs` 在 zh-CN 与 en-US 下均通过：选择框出现与选择、面板居中、画布减弱、预设填入草稿、回复在切换模式后完成、刷新后偏好保持、选择框不再重现。
- `npm run check:i18n`：3284 个键，0 问题。
- `npm run build` 通过；`tsc --noEmit` 通过。
- 补丁在干净基线上 `git apply` 通过。

## 3. 未解决的问题

### 3.1 选择框拦截点击（已确认，尚未修复）
- 现象：选择框（`.cw-work-mode-picker`，`position: fixed; top: 72px`，居中）拦截了画布中央的点击。完整套件中 `timeline node output` 报错：`.cw-selection-toolbar` 的「Output video」按钮被选择框的子树拦截。
- 影响：这不只是测试问题，真实界面里选择框也会遮住顶部中央区域。
- 计划修复（尚未编码）：
  1. 把选择框移到左下角（`left: 72px; bottom: 64px`），避开画布中央与顶部工具区；
  2. 用户在选择框之外按下指针时，选择框自动收起（不写入偏好，默认仍为进阶模式）。
- 修复后需要重新生成补丁，并重跑完整套件。

### 3.2 完整浏览器套件（最近一次，未完成）
最近一次运行在非夹具 API（全新数据根）上进行，因被中止未跑完。已记录的结果：

- 通过：large video import、example canvas picker、locale、assistant activity、generation reference、provider settings、capability discovery、cross canvas paste、context menu dismissal、project list overflow、zh/en reload 与 second-window refusal、session lease、mp4 export、canvas switch、tool/stack rejected save。
- 失败：timeline node output（选择框拦截，见 3.1）、creation closure（`dragged reference committed` 超时，jobs 为空）、minimax h3（waitForFunction 超时）、created node focus（`operation_rejected`）、reference reconnect（waitForFunction 超时）、editor save（`operation_rejected`）、canvas crop、canvas text Markdown、canvas layers。
- 注意：这些失败中，有些与选择框拦截有关，有些是既有的沙箱问题。我还没有逐个确认哪些是 A1/A2 引起的。需要修复 3.1 后再分类。

### 3.3 `operation_rejected`（既有问题，已定位到代码路径）
- 原始回执：「工程已关闭或会话已过期，请重新打开后保存。」（`creation_projects.py` 的 `_lease`）。
- 含义：写入时找不到该 session 的未过期租约。租约 60 秒，页面心跳每 15 秒续一次（`src/backend/projects.ts`）。
- 基线上同样复现，因此不是 A1/A2 引起的。原因很可能是测试 harness 的 session 与页面不一致，尚未修复。

### 3.4 其他环境问题
- `timeline_workflow`：系统 Python 的 sqlite3 缺少符号 `sqlite3_trace_v2`，需要换用项目的 venv。
- `timeline_node_output` 的取消按钮超时：已确认与 3.1 相关。

## 4. 尚未完成的范围
- A1 结果卡片（result cards）：未实现。
- 批次 B 的完整录屏：当前录屏只覆盖选择框、切换、预设与回复运行，尚未包含结果卡片。
- 3.1 的修复与完整套件的复跑。

## 5. 约束与待确认事项

- 用户决定（2026-11-22）：简洁模式使用系统预设，并提供可编辑抽屉与参考图上传。已实现预设与参考图入口，预设填入草稿后可编辑。
- 用户决定：desktop.14 先发布 draft 供用户评审，公开 Release 之前需要用户确认。
- **待确认**：用户决定中写明基线为 `dd80424c`（desktop.13），但当前补丁基于上游 tarball `8584cc96…`。两者的关系需要确认，否则补丁可能不适用于 desktop.13。

## 6. 沙箱环境（不持久化，需要时重建）
- `verification/sandbox/setup.sh` 重建上游树、七张补丁、依赖与 Chromium 131。
- Playwright 需要的两个路径已软链：`~/.cache/ms-playwright/chromium_headless_shell-1208/...` 与 `~/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux`。
- API 必须使用全新的数据根，且路径位于系统临时目录下、名称以 `opendirector-creation-` 开头。
- `/tmp/src` 不是 git 仓库时，`canvas_switch` 会失败（它依赖 `git rev-parse HEAD`），需要先在该目录 `git init` 并提交快照。

## 7. 下一步（按顺序）
1. 修复选择框位置与自动收起（3.1），重新生成 `patches/work-mode.patch`，中英文旅程复跑。
2. 在全新数据根上完整复跑套件，逐个分类失败项：A1/A2 引起 / 基线也失败。
3. 诊断 `operation_rejected` 的 harness session 问题（3.3）。
4. 实现 A1 结果卡片，并重录批次 B 录屏（包含结果卡片）。
5. 确认 `dd80424c` 与 `8584cc96` 的关系（第 5 节）。
6. 生成 desktop.14 draft 供用户评审，等待确认后才公开 Release。

## 8. 交接说明（给接手的窗口）

### 8.1 起点
- 分支：`arena/1d7b4478-for-opendirectore-in-windows`，远端与本地同为 `fa61310`，工作区干净。
- 不要切换或新建分支；所有提交都推送到当前分支。
- 先读本文件第 3 节（未解决问题）和第 7 节（下一步）。

### 8.2 关键文件
| 路径 | 用途 |
| --- | --- |
| `patches/work-mode.patch` | A1/A2/预设的全部改动，接在 7 张既有补丁之后。修改源码后必须重新生成。 |
| `verification/work_mode.mjs` | 模式旅程验证（选择框、居中、减弱、预设、回复、刷新）。`LOCALE=zh-CN\|en-US`。 |
| `src/canvas/workMode.ts`、`WorkModePicker.tsx`、`SimplePresets.tsx`、`work-mode.css` | 上游树中的新文件（补丁内）。 |
| `src/canvas/workspace/WorkspaceView.tsx`、`src/canvas/AssistantPanel.tsx` | 上游文件的改动点：顶部切换按钮、`simple` 属性、选择框挂载。 |
| `docs/desktop-parity/progress.md` | 进度记录（入口）。 |
| `delivery/desktop14-work-mode-{zh,en}.mp4` | 批次 B 录屏（尚不含结果卡片）。 |

### 8.3 重新生成补丁的方法（必须遵守）
1. 从上游 tarball 解压到 `/tmp/base`，依次应用 7 张既有补丁，并 `git init` 后提交为基线。
2. 复制 `/tmp/src` 中的 8 个改动文件到基线副本（见 `fa61310` 之前的提交说明，或直接比对 `git show a117380 --stat`）。
3. `git add -A && git diff --cached` 得到补丁正文，前面保留补丁头注释。
4. 在干净基线上 `git apply --check` 通过后再提交。

### 8.4 复现环境（不持久化，需要重建）
- 运行 `verification/sandbox/setup.sh` 重建上游树、依赖与 Chromium 131。
- Playwright 需要两条软链（沙箱重建后要重新做）：
  - `~/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell` → `/tmp/chromium`
  - `~/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux` → `~/bin/ffmpeg`
- API：`python3 tests/browser/creation_server.py --port 8019 --root /tmp/opendirector-creation-<新名字>`（不带 `--assistant-fixture` 用于套件；带该参数用于 `work_mode.mjs`）。根目录必须位于系统临时目录下，名称以 `opendirector-creation-` 开头。
- Web：Vite 在 5179，并设置 `OPENDIRECTOR_API_URL=http://127.0.0.1:8019`。
- 环境变量：`PLAYWRIGHT_MODULE`、`BROWSER_PATH=/tmp/chromium`、`LD_LIBRARY_PATH=/tmp/libs/lib`、`CREATION_WEB_URL`、`CREATION_API_URL`。
- 旅程脚本依赖 `tests/` 下的 `engine.mjs`（上游文件，不在本仓库）。

### 8.5 已知陷阱
- `/tmp` 内容不持久化：`/tmp/src`、`/tmp/base`、套件日志都可能丢失。
- `/tmp/src` 不是 git 仓库时 `canvas_switch` 会失败，需先 `git init` 并提交快照。
- 同一 API 数据根反复使用会产生 `operation_rejected` 的残留状态，每次复跑都用新根。
- 后台启动 API 时，用 `start_process` 托管；用 `setsid nohup` 启动的进程在命令结束后可能被回收。
- `gh run view --log-failed` 在此沙箱返回 EOF，用 `gh run view --json jobs` 代替。

### 8.6 接手后的第一步
1. 修复选择框（3.1）：移到左下角，并在选择框外按下指针时收起；重新生成补丁，中英文旅程复跑。
2. 在全新数据根上完整复跑套件；把失败分为「A1/A2 引起」「基线也失败」两类，并记录在本文件。
3. 诊断 `operation_rejected`（3.3）的 harness session 问题。
4. 实现结果卡片，重录批次 B 录屏。
5. 核对 `dd80424c` 与 `8584cc96` 的关系（第 5 节）。
6. 生成 desktop.14 draft 供用户评审，未经确认不公开 Release。

### 8.7 不要重复的尝试
- 把选择框做成全屏遮罩（会阻断大量现有测试）。
- 用 `page.getByText` 直接点击 `.cw-chat-button` 之外的顶部按钮（已被选择框遮挡时会超时）。
- 为修 `operation_rejected` 而反复重启 API 而不换数据根。

# 基线推进评估：ddea4d0 → 0.1.5（8584cc9）

结论：**可行，风险集中在 4 个文件；推进后 open-elsewhere 与 bundled-agent 两张补丁需要语义去重。**

## 上游变更概览（7 个提交，141 个文件，+9817/−277）

| 提交 | 内容 | 对我们的影响 |
| --- | --- | --- |
| bf47361 #397 | Electron 桌面应用（macOS+Windows）、项目侧栏、双语默认标题、示例画布下载、终端命令注册 | 与我们重叠最大的一块：`agent/native.py`、`localization.py`、workspace 文件均被改动；桌面壳本身我们不用（WebView2 路线） |
| 0b83f97 #416 | 再生成节点保持 busy 直到新结果出现 | pending 结果语义，涉及 useWorkspaceDocument |
| 84d1211 #417 | 只结束本会话亲见启动的 delivery | 会话观看边界，涉及 workspace 状态 |
| 1ee7d9c #415 | 分组工具栏、分组颜色、取消节点锁定 | useWorkspaceInteraction 大改（224 行级） |
| ffa16c4 #414 | 版本号 0.1.5 | 打包脚本版本 |
| 8754c77 #413 | 官网双语下载页（RFC D6） | P6 公开 Release 可直接对接 |
| 8584cc9 #400 | 资产选择器重开 bugfix | 小修 |

## 与六张补丁的重叠矩阵

| 补丁 | 触点 | 上游同文件变更 | 评估 |
| --- | --- | --- | --- |
| agent-gateway-terminal-failure | `model_gateway.py`、`tests/test_model_gateway.py` | 无 | **干净适用** |
| canvas-placement | `automaticPlacement.ts`、`subjectLibraryImport.ts` | 无 | **干净适用** |
| canvas-placement（交互部分） | `useWorkspaceInteraction.tsx`、`useWorkspaceTransfer.ts` | 有（#415 分组工具栏） | **需重排**：自动落位只挂自动创建路径，预计是小冲突 |
| timeline-output-dismiss | `TimelineOutput.tsx`、`timeline-output.css`、`WorkspaceView.tsx`、timeline i18n | `WorkspaceView.tsx` 有（#415/#417） | 主体干净；**WorkspaceView 需重排** |
| export-signal-contract | `DirectorStage.tsx`、`TimelineEditor.tsx`、`TimelineOutput.tsx`、`exportSignal.ts`、errors i18n | 无 | **干净适用**（含 Host.cs 读取序，不涉及上游） |
| open-elsewhere-autoretry | `WorkspaceView.tsx`、`state.ts`、`useWorkspaceDocument.ts`、canvasWorkspace i18n、`base.css` | `useWorkspaceDocument.ts`、`WorkspaceView.tsx`、canvasWorkspace i18n 有 | **需语义去重**（见下） |
| bundled-agent | `agent/native.py`、`agent/bundled_profile.py`、`agent/skills.py`、`localization.py` | `native.py`、`localization.py` 有（#397 内置 Agent 运行时） | **需语义去重**：上游 #397 已内置 Agent runtime，逐项核对我们 bundled-profile 的差异化部分 |

## 语义去重要点

1. **open-elsewhere**：上游 0.1.5 已有「Reconnect / Back to canvas home」出口与 unload 时 `DELETE /api/creation/sessions/{id}`（实测日志确认）。我们的增量价值是 **75 秒倒计时自动重连（零点击进入）+ SessionJournal 崩溃释放**。推进后：保留倒计时自动重连与崩溃释放，出口按钮与上游对齐（避免两套 UI）。
2. **bundled-agent**：上游 #397 的 Agent runtime 打包与我们 bundled_profile 目标一致。推进后逐项对比（数据目录隔离 `agent-runtime/opencode-v1`、技能路径、本地化），仅保留上游没有的差异化部分，防止双份逻辑。
3. **WorkspaceView.tsx**（224 行上游变更）：两张补丁都动它（失败卡挂载点、open-elsewhere 覆盖层）。以手工重排为主，完成后跑上游 `npm test`（930+）与我方 `tests/` 双回归。

## 推进步骤（P1 执行清单）

1. 以 8584cc9 为新固定基线更新 `scripts/package.py` 的 SHA 与依赖版本校验；
2. 按序重放补丁：gateway → placement → export-signal → timeline-dismiss → open-elsewhere（重排）→ bundled-agent（去重后）；
3. 逐张补丁后跑 `npm run build` + `tsc --noEmit` + `check:i18n`；
4. 全量：上游 `npm test`、`python -m unittest discover -s tests`、verification 三条旅程；
5. Windows 工作流冒烟 + 全量旅程 mp4 归档，progress.md 记录。

风险缓解：补丁重排期间保留 desktop.11 全部语义（失败卡三出口、导出信号契约、自愈等待、节点落位），任何语义丢失视为回归。

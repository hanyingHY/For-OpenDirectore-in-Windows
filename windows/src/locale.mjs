/**
 * Bilingual UI strings for the Windows desktop shell.
 * Kept complete in both locales: every menu item, dialog and notification is
 * verified in the full functional simulation (docs/validation.md).
 */
export const messages = {
  'en-US': {
    app: 'OpenDirector',
    startup: 'OpenDirector could not start',
    startupDetail: 'The bundled service failed to become ready. Retry, or open the diagnostics folder for details.',
    retry: 'Retry', quit: 'Quit', cancel: 'Cancel', close: 'Close', save: 'Save file',
    interrupted: 'The local service stopped. Restart OpenDirector to reconnect. Existing remote jobs are not automatically cancelled.',
    running: 'Agent, generation or export work is active, or its status could not be checked. Quitting interrupts local work. Remote jobs may continue and incur charges. Quit now?',
    quitNow: 'Quit now', keepRunning: 'Keep running',
    edit: 'Edit', view: 'View', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste',
    selectAll: 'Select all', fullscreen: 'Toggle fullscreen', devtools: 'Developer tools',
    menu: 'File', logs: 'Open diagnostics folder', data: 'Open data folder', command: 'Manage terminal command',
    diagnostics: 'Copy diagnostics summary', checkUpdates: 'Check for updates',
    install: 'Install', remove: 'Removal instructions', commandDone: 'Terminal command installed. Open a new terminal to use it.',
    commandAlreadyInstalled: 'The terminal command is already installed.',
    commandRemoveHelp: 'To uninstall the command, inspect the entry at this path and remove it manually if it belongs to OpenDirector.',
    collision: 'This path is already in use. To repair a previous OpenDirector installation, inspect and manually remove its old entry before installing again.',
    failed: 'Operation failed',
    // Windows shell
    trayShow: 'Show OpenDirector', trayNew: 'New project', trayQuit: 'Quit',
    trayMinimize: 'Minimize to tray when closed', trayOpenData: 'Open data folder',
    newProject: 'New project', recentProjects: 'Recent projects', jumpNew: 'New project',
    jumpData: 'Open data folder', jumpLogs: 'Open diagnostics folder',
    notifyExportTitle: 'Export finished', notifyExportBody: 'The MP4 is ready in your export folder.',
    notifyGenerationTitle: 'Generation finished', notifyGenerationBody: 'New assets are available on the canvas.',
    updateAvailable: 'Update available',
    updateAvailableDetail: 'OpenDirector {version} is available (you have {current}). Download and install now? The app restarts to finish the update.',
    updateDownload: 'Download and install', updateLater: 'Later',
    updateNone: 'You are up to date', updateNoneDetail: 'OpenDirector {current} is the latest version.',
    updateFailed: 'Update failed', updateFailedDetail: 'Could not fetch update information: {error}',
    exportActive: 'Export running — keeping the device awake',
  },
  'zh-CN': {
    app: 'OpenDirector',
    startup: 'OpenDirector 无法启动',
    startupDetail: '捆绑服务未能就绪。可重试，或打开诊断目录查看详情。',
    retry: '重试', quit: '退出', cancel: '取消', close: '关闭', save: '保存文件',
    interrupted: '本地服务已停止，请重启 OpenDirector 重新连接。已有远端任务不会自动取消。',
    running: 'Agent、生成或导出任务仍在运行，或无法确认任务状态。退出会中断本地工作；远端任务可能继续运行并产生费用。是否退出？',
    quitNow: '立即退出', keepRunning: '继续运行',
    edit: '编辑', view: '视图', undo: '撤销', redo: '重做', cut: '剪切', copy: '复制', paste: '粘贴',
    selectAll: '全选', fullscreen: '切换全屏', devtools: '开发者工具',
    menu: '文件', logs: '打开诊断目录', data: '打开数据目录', command: '管理终端命令',
    diagnostics: '复制诊断摘要', checkUpdates: '检查更新',
    install: '安装', remove: '移除说明', commandDone: '终端命令已安装，请打开新终端使用。',
    commandAlreadyInstalled: '终端命令已安装。',
    commandRemoveHelp: '如需卸载终端命令，请检查此路径下的入口，确认它属于 OpenDirector 后手动移除。',
    collision: '此路径已被占用。如需修复旧版 OpenDirector 的终端命令，请检查并手动移除旧入口，再重新安装。',
    failed: '操作失败',
    // Windows shell
    trayShow: '显示 OpenDirector', trayNew: '新建项目', trayQuit: '退出',
    trayMinimize: '关闭窗口时最小化到托盘', trayOpenData: '打开数据目录',
    newProject: '新建项目', recentProjects: '最近项目', jumpNew: '新建项目',
    jumpData: '打开数据目录', jumpLogs: '打开诊断目录',
    notifyExportTitle: '导出完成', notifyExportBody: 'MP4 已保存到导出目录。',
    notifyGenerationTitle: '生成完成', notifyGenerationBody: '画布上已有新的素材。',
    updateAvailable: '发现新版本',
    updateAvailableDetail: 'OpenDirector {version} 已发布（当前 {current}）。是否下载并安装？应用将重启完成更新。',
    updateDownload: '下载并安装', updateLater: '稍后',
    updateNone: '已是最新版本', updateNoneDetail: '当前版本 {current} 已是最新。',
    updateFailed: '更新失败', updateFailedDetail: '无法获取更新信息：{error}',
    exportActive: '导出进行中——已阻止设备休眠',
  },
};

export const localeFor = value => value?.startsWith('zh') ? 'zh-CN' : 'en-US';

/** Replace {placeholders} in a message template. */
export function format(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
}

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('openclawDesktop', {
  async getDefaults() {
    return ipcRenderer.invoke('openclawdeploy:getDefaults');
  },
  async run(options) {
    const result = await ipcRenderer.invoke('openclawdeploy:run', options);
    if (!result.ok) throw new Error(result.error || '启动失败');
    return result;
  },
  async getRun(runId) {
    const result = await ipcRenderer.invoke('openclawdeploy:getRun', runId);
    if (!result.ok) throw new Error(result.error || '读取任务状态失败');
    return result;
  },
});

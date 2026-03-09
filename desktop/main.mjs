import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { createRun, getRun } from '../scripts/run-manager.mjs';
import { discoverCatalog } from '../scripts/discovery.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 900,
    minWidth: 980,
    minHeight: 760,
    title: 'OpenClawDeploy 安装器',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(projectRoot, 'gui', 'index.html'));
}

ipcMain.handle('openclawdeploy:getDefaults', async () => ({
  platform: process.platform,
  mode: 'desktop',
}));

ipcMain.handle('openclawdeploy:getCatalog', async (_event, options) =>
  discoverCatalog({
    projectRoot,
    workspace: options?.workspace || '~/.openclaw/workspace',
    remote: options?.remote !== false,
    networkPreset: options?.networkPreset || 'global',
    providerManifestUrl: options?.providerManifestUrl || '',
    skillsManifestUrl: options?.skillsManifestUrl || '',
  }),
);

ipcMain.handle('openclawdeploy:run', async (_event, options) => {
  try {
    const runId = createRun(projectRoot, options || {}, {
      label: 'openclawdeploy-desktop',
      env: {
        OPENCLAWDEPLOY_NODE: process.execPath,
        ELECTRON_RUN_AS_NODE: '1',
      },
    });
    return { ok: true, runId };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('openclawdeploy:getRun', async (_event, runId) => {
  const run = getRun(runId);
  if (!run) return { ok: false, error: 'run not found' };
  return { ok: true, ...run };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  dialog.showErrorBox('OpenClawDeploy 启动失败', error.stack || error.message);
});

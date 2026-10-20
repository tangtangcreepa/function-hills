const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 备份导出：弹出保存对话框，把 JSON 写到用户选择的位置
ipcMain.handle('backup:save', async (evt, json) => {
  const p = n => String(n).padStart(2, '0');
  const d = new Date();
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
    title: '导出存档备份',
    defaultPath: `函数丘陵备份-${stamp}.json`,
    filters: [{ name: 'JSON 备份文件', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  try {
    fs.writeFileSync(filePath, String(json), 'utf8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { error: err && err.message ? err.message : String(err) };
  }
});

// 备份导入：弹出打开对话框，读回 JSON 内容
ipcMain.handle('backup:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    title: '导入存档备份',
    filters: [{ name: 'JSON 备份文件', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths || !filePaths.length) return { canceled: true };
  try {
    const content = fs.readFileSync(filePaths[0], 'utf8');
    return { ok: true, content };
  } catch (err) {
    return { error: err && err.message ? err.message : String(err) };
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '函数丘陵',
    backgroundColor: '#ececec',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

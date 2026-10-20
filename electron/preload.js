const { contextBridge, ipcRenderer } = require('electron');

// 只读应用信息
contextBridge.exposeInMainWorld('appInfo', {
  name: '函数丘陵',
  version: '1.1.2',
});

// 存档备份：导出/导入（经主进程原生对话框读写 .json）
contextBridge.exposeInMainWorld('backup', {
  save: (json) => ipcRenderer.invoke('backup:save', json),
  open: () => ipcRenderer.invoke('backup:open'),
});

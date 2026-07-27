const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rtIpc', (name, arg) => ipcRenderer.invoke('rt-ipc', name, arg));
contextBridge.exposeInMainWorld('rtFertig', (fehler) => ipcRenderer.send('rt-fertig', fehler));

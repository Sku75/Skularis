/**
 * Skularis 0.1 — Electron Main Process
 */
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const VERSION = 'Skularis 0.09';
let mainWindow = null;

// Single Instance Lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', (_event, argv) => {
    const xmlFile = argv.find(a => a.endsWith('.xml'));
    if (xmlFile && mainWindow) {
      mainWindow.webContents.send('skularis:datei-von-cli', { pfad: xmlFile });
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function getBasisPfad() {
  if (app.isPackaged) {
    return path.dirname(process.execPath);
  }
  return path.resolve(__dirname, '..');
}

function getAppPfad() {
  if (app.isPackaged) {
    return app.getAppPath(); // → resources/app/
  }
  return path.resolve(__dirname, '..');
}

// Bibliothek für gespeicherte Charaktere (Sephrasto-.xml)
function getCharOrdner() {
  return path.join(getBasisPfad(), 'Charakter-Dateien');
}

// Ordner für Abenteuer-Spielstände (Skularis-eigenes JSON-Format)
function getAbenteuerOrdner() {
  return path.join(getBasisPfad(), 'Abenteuer-Daten');
}

// Verzeichnis mit Regeldaten (datenbank.xml + CharakterAssistent)
function getDatenPfad() {
  return path.join(getAppPfad(), 'daten');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    title: VERSION,
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
    show: false,
  });

  // Kein natives Menü — die Bedienung läuft komplett über barrierefreie
  // Bildschirm-Menüs (Pfeiltasten + Eingabetaste + Escape).
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.on('console-message', (_e, level, msg, line, source) => {
    if (level >= 2) console.error(`[Renderer] ${source}:${line} — ${msg}`);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.webContents.send('skularis:vor-schliessen');
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// IPC Handlers
require('./ipc-handlers');

app.whenReady().then(() => {
  createWindow();
  const xmlFile = process.argv.find(a => a.endsWith('.xml'));
  if (xmlFile) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('skularis:datei-von-cli', { pfad: xmlFile });
    });
  }
});

app.on('window-all-closed', () => { app.quit(); });

// Expose for ipc-handlers
module.exports = {
  getMainWindow: () => mainWindow,
  getBasisPfad, getAppPfad, getCharOrdner, getAbenteuerOrdner, getDatenPfad, VERSION,
};

/**
 * Skularis 0.1 — Electron Main Process
 */
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const VERSION = 'Skularis 0.12';
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

let _basisCache = null;

function istBeschreibbar(dir) {
  try {
    const probe = path.join(dir, '.skularis-schreibtest');
    fs.writeFileSync(probe, 'x');
    fs.unlinkSync(probe);
    return true;
  } catch { return false; }
}

/**
 * Ort der Nutzerdaten (Charaktere, Abenteuer, Einstellungen).
 * Portabel-Struktur: die Exe liegt im Programmordner "Skularis x.xx", die
 * Nutzerdaten liegen EINE Ebene höher im übergeordneten Portable-Ordner —
 * daneben, nicht darin. So kann ein Update den Programmordner austauschen, ohne
 * die Daten zu berühren. Ist der übergeordnete Ordner nicht beschreibbar
 * (z. B. unter Programme), bleibt es beim Programmordner.
 */
function getBasisPfad() {
  if (!app.isPackaged) return path.resolve(__dirname, '..');
  if (_basisCache) return _basisCache;
  const programm = path.dirname(process.execPath);
  const portable = path.dirname(programm);
  _basisCache = istBeschreibbar(portable) ? portable : programm;
  return _basisCache;
}

/**
 * Einmalige Übernahme: frühere Versionen (0.08/0.09) legten die Daten IM
 * Programmordner ab. Liegen sie dort und noch nicht am neuen Ort, werden sie
 * einmalig übernommen, damit nichts verloren geht.
 */
function migriereNutzerdaten() {
  if (!app.isPackaged) return;
  const alt = path.dirname(process.execPath);
  const neu = getBasisPfad();
  if (path.resolve(alt) === path.resolve(neu)) return;
  try {
    for (const name of ['Charakter-Dateien', 'Abenteuer-Daten']) {
      const q = path.join(alt, name), z = path.join(neu, name);
      if (fs.existsSync(q) && !fs.existsSync(z)) fs.cpSync(q, z, { recursive: true });
    }
    const cfgA = path.join(alt, 'skularistool_config.json');
    const cfgN = path.join(neu, 'skularistool_config.json');
    if (fs.existsSync(cfgA) && !fs.existsSync(cfgN)) fs.copyFileSync(cfgA, cfgN);
  } catch (e) { console.error('Nutzerdaten-Migration:', e); }
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
  migriereNutzerdaten();
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

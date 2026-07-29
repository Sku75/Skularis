/**
 * Skularis Alpha 0.02.03 — IPC Handler Registration
 */
const { ipcMain, app } = require('electron');
const path = require('path');
const fileOps = require('./file-operations');
const settings = require('./settings');

ipcMain.handle('skularis:datei-oeffnen', (event) => {
  const { getMainWindow, getCharOrdner } = require('./main');
  return fileOps.dateiOeffnenDialog(getMainWindow(), getCharOrdner());
});

ipcMain.handle('skularis:datei-speichern', (_event, data) => {
  return fileOps.dateiSpeichern(data.pfad, data.inhalt);
});

ipcMain.handle('skularis:datei-speichern-als', (event) => {
  const { getMainWindow, getCharOrdner } = require('./main');
  const data = event;
  return null; // handled via renderer sending full data
});

ipcMain.handle('skularis:datei-speichern-als-dialog', (_event, data) => {
  const { getMainWindow, getCharOrdner } = require('./main');
  return fileOps.dateiSpeichernAlsDialog(
    getMainWindow(), getCharOrdner(), data.vorschlag, data.inhalt
  );
});

ipcMain.handle('skularis:datei-exportieren', (_event, data) => {
  const { getMainWindow, getCharOrdner } = require('./main');
  return fileOps.dateiExportierenDialog(
    getMainWindow(), getCharOrdner(), data.vorschlag, data.text
  );
});

ipcMain.handle('skularis:datenbank-laden', () => {
  const { getDatenPfad } = require('./main');
  return fileOps.ladeDatenbank(getDatenPfad());
});

ipcMain.handle('skularis:config-lesen', () => {
  return { config: settings.laden() };
});

ipcMain.handle('skularis:config-schreiben', (_event, data) => {
  settings.setWert(data.key, data.value);
});

ipcMain.handle('skularis:letzte-dateien', () => {
  return fileOps.letzteDateienLaden(settings);
});

ipcMain.handle('skularis:letzte-datei-merken', (_event, data) => {
  settings.letzteDateiMerken(data.pfad);
});

ipcMain.handle('skularis:datei-direkt-laden', (_event, data) => {
  return fileOps.dateiDirektLaden(data.pfad);
});

ipcMain.handle('skularis:oeffne-regelwerk', () => {
  const { getAppPfad } = require('./main');
  fileOps.oeffneRegelwerk(getAppPfad());
});

ipcMain.handle('skularis:app-info', () => {
  const { getAppPfad, VERSION } = require('./main');
  return { version: VERSION, basisPfad: getAppPfad() };
});

// --- Charakter-Bibliothek ---
ipcMain.handle('skularis:bibliothek-liste', () => {
  const { getCharOrdner } = require('./main');
  return fileOps.bibliothekListe(getCharOrdner());
});

ipcMain.handle('skularis:bibliothek-speichern', (_event, data) => {
  const { getCharOrdner } = require('./main');
  return fileOps.bibliothekSpeichern(getCharOrdner(), data.name, data.inhalt);
});

ipcMain.handle('skularis:bibliothek-loeschen', (_event, data) => {
  return fileOps.bibliothekLoeschen(data.pfad);
});

ipcMain.handle('skularis:bibliothek-schreiben', (_event, data) => {
  const { getCharOrdner } = require('./main');
  return fileOps.bibliothekSchreiben(getCharOrdner(), data.dateiname, data.inhalt);
});

// --- Abenteuer-Spielstände ---
ipcMain.handle('skularis:abenteuer-liste', () => {
  const { getAbenteuerOrdner } = require('./main');
  return fileOps.abenteuerListe(getAbenteuerOrdner());
});

ipcMain.handle('skularis:abenteuer-speichern', (_event, data) => {
  const { getAbenteuerOrdner } = require('./main');
  return fileOps.abenteuerSpeichern(getAbenteuerOrdner(), data.name, data.inhalt);
});

ipcMain.handle('skularis:abenteuer-laden', (_event, data) => {
  return fileOps.abenteuerLaden(data.pfad);
});

ipcMain.handle('skularis:abenteuer-loeschen', (_event, data) => {
  return fileOps.abenteuerLoeschen(data.pfad);
});

// --- Erschaffungspakete ---
ipcMain.handle('skularis:pakete-liste', (_event, data) => {
  const { getDatenPfad } = require('./main');
  return fileOps.paketeListe(getDatenPfad(), data.kategorie);
});

ipcMain.handle('skularis:paket-laden', (_event, data) => {
  const { getDatenPfad } = require('./main');
  return fileOps.paketLaden(getDatenPfad(), data.pfad);
});

ipcMain.on('skularis:schliessen-antwort', (_event, darfSchliessen) => {
  if (darfSchliessen) {
    const { getMainWindow } = require('./main');
    const win = getMainWindow();
    if (win) {
      win.removeAllListeners('close');
      win.close();
    }
    app.quit();
  }
});

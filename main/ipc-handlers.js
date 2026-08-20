/**
 * Skularis — IPC Handler Registration
 */
const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const fileOps = require('./file-operations');
const settings = require('./settings');
const boxTransfer = require('./box-transfer');

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

// Charakterbogen-Transfer über die accountlose Box (ntfy). Netzwerk läuft im
// Hauptprozess, damit keine CSP/CORS-Grenzen des Renderers greifen.
ipcMain.handle('skularis:box-hochladen', (_event, data) => boxTransfer.uploadBogen(data.code, data.inhalt));
ipcMain.handle('skularis:box-abholen', (_event, data) => boxTransfer.downloadBogen(data.code));
// Abruf-Post (seit 1.20): Nachrichten unter Tisch-Code plus Empfaenger ablegen
// und aktiv abholen (Strg B). Gleiches accountloses ntfy-Muster wie die Box.
ipcMain.handle('skularis:post-senden', (_event, data) => boxTransfer.postSenden(data.code, data.empfaenger, data.daten));
ipcMain.handle('skularis:post-abrufen', (_event, data) => boxTransfer.postAbrufen(data.code, data.empfaenger));

// Diagnose-Mitschnitt (still): haengt eine Zeile mit Zeitstempel an
// <basis>/skularis-diagnose.log. Nur zum Aufspueren des Post-Ton-Problems bei
// Reconnects; stoert das Spiel nicht (kein Ton, keine Ansage, nur Datei).
ipcMain.handle('skularis:diag-log', (_event, data) => {
  try {
    const { getBasisPfad } = require('./main');
    const zeit = new Date().toLocaleTimeString('de-DE');
    const zeile = `[${zeit}] ${(data && data.text) ? String(data.text) : ''}\n`;
    fs.appendFileSync(path.join(getBasisPfad(), 'skularis-diagnose.log'), zeile, 'utf-8');
  } catch (e) { /* Diagnose darf nie stoeren */ }
  return true;
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

// Patchnotes aus dem Programmordner (wird beim Update mitgetauscht, also immer
// zur laufenden Version passend).
ipcMain.handle('skularis:patchnotes', () => {
  const { getAppPfad } = require('./main');
  const fs = require('fs');
  try { return fs.readFileSync(path.join(getAppPfad(), 'Patchnotes.txt'), 'utf-8'); }
  catch { return ''; }
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

// --- Meisterabenteuer (eigener Ordner) ---
ipcMain.handle('skularis:meister-liste', () => {
  const { getMeisterOrdner } = require('./main');
  return fileOps.meisterListe(getMeisterOrdner());
});

ipcMain.handle('skularis:meister-speichern', (_event, data) => {
  const { getMeisterOrdner } = require('./main');
  return fileOps.meisterSpeichern(getMeisterOrdner(), data.name, data.inhalt);
});

ipcMain.handle('skularis:meister-laden', (_event, data) => {
  return fileOps.meisterLaden(data.pfad);
});

ipcMain.handle('skularis:meister-loeschen', (_event, data) => {
  return fileOps.meisterLoeschen(data.pfad);
});

// --- Abenteuertexte (Ordner waehlen, txt lesen) ---
ipcMain.handle('skularis:ordner-waehlen', (_event, data) => {
  const { getMainWindow } = require('./main');
  return fileOps.ordnerWaehlen(getMainWindow(), data && data.titel);
});

ipcMain.handle('skularis:textdateien-liste', (_event, data) => {
  return fileOps.textDateienListe(data.ordner);
});

ipcMain.handle('skularis:textdatei-laden', (_event, data) => {
  return fileOps.textDateiLaden(data.pfad);
});

// --- Globale Gegner-Bibliothek ---
function gegnerBibPfad() {
  const { getBasisPfad } = require('./main');
  return path.join(getBasisPfad(), 'Gegner-Bibliothek.json');
}
ipcMain.handle('skularis:gegnerbib-laden', () => {
  return fileOps.gegnerBibLaden(gegnerBibPfad());
});
ipcMain.handle('skularis:gegnerbib-speichern', (_event, data) => {
  return fileOps.gegnerBibSpeichern(gegnerBibPfad(), data.inhalt);
});

// --- Szenenpacks (Ordner "Meister Daten") ---
function szenenpacksPfad() {
  const { getMeisterDatenOrdner } = require('./main');
  return path.join(getMeisterDatenOrdner(), 'Szenenpacks.json');
}
ipcMain.handle('skularis:szenenpacks-laden', () => {
  return fileOps.jsonLaden(szenenpacksPfad());
});
ipcMain.handle('skularis:szenenpacks-speichern', (_event, data) => {
  return fileOps.jsonSpeichern(szenenpacksPfad(), data.inhalt);
});

// --- Audio-Playlists (Verweise auf Sounds, im Ordner "Meister\Daten-sets") ---
function playlistsPfad() {
  const { getMeisterDatenOrdner } = require('./main');
  return path.join(getMeisterDatenOrdner(), 'Playlists.json');
}
ipcMain.handle('skularis:playlists-laden', () => {
  return fileOps.jsonLaden(playlistsPfad());
});
ipcMain.handle('skularis:playlists-speichern', (_event, data) => {
  return fileOps.jsonSpeichern(playlistsPfad(), data.inhalt);
});

// --- Audio (Musik, Hintergrundstimmung, Spontansounds) ---
ipcMain.handle('skularis:audio-wurzeln', () => {
  const { getAudioOrdner } = require('./main');
  const wurzel = getAudioOrdner();
  // Gespeicherten "Meine Audios"-Pfad nur zurueckgeben, wenn er noch existiert.
  // Ist der Ordner verschwunden (verschoben/geloescht/umbenannt), die Einstellung
  // leeren, damit kein toter Eintrag im Menue stehen bleibt.
  let meine = settings.laden().audio_meine_pfad || null;
  if (meine && !fs.existsSync(meine)) {
    settings.setWert('audio_meine_pfad', null);
    meine = null;
  }
  return {
    audioDaten: wurzel,
    musik: path.join(wurzel, 'Musik'),
    stimmung: path.join(wurzel, 'Hintergrundstimmung'),
    spontan: path.join(wurzel, 'Spontansounds'),
    meineAudios: meine,
  };
});
ipcMain.handle('skularis:audio-inhalt', (_event, data) => {
  return fileOps.audioInhalt(data.ordner);
});
ipcMain.handle('skularis:audio-datei', (_event, data) => {
  const { getAudioOrdner } = require('./main');
  const meine = settings.laden().audio_meine_pfad || null;
  return fileOps.audioDatei(data.pfad, [getAudioOrdner(), meine]);
});
ipcMain.handle('skularis:audio-meine-waehlen', () => {
  const { getMainWindow } = require('./main');
  const r = fileOps.ordnerWaehlen(getMainWindow(), 'Ordner mit deinen Audios waehlen');
  if (r && r.pfad) settings.setWert('audio_meine_pfad', r.pfad);
  return r;
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

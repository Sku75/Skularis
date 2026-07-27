// Tests im echten Electron-Renderer (DOM, DOMParser vorhanden).
// Aufruf über package.json "main"; die zu ladende Seite steht in SKU_TESTSEITE.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const appDir = path.join(__dirname, '..');
const seite = process.env.SKU_TESTSEITE || 'rt.html';

function ladeDatenbank() {
  const { XMLParser } = require(path.join(appDir, 'node_modules', 'fast-xml-parser'));
  const parser = new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: '', textNodeName: '_text',
    processEntities: { maxTotalExpansions: 100000, maxExpandedLength: 500000 },
    isArray: (n) => ['Attribut', 'AbgeleiteterWert', 'Energie', 'Vorteil', 'Fertigkeit', 'Talent',
      'ÜbernatürlicheFertigkeit', 'FreieFertigkeit', 'Waffe', 'Waffeneigenschaft', 'Rüstung',
      'Regel', 'Einstellung'].includes(n),
  });
  return parser.parse(fs.readFileSync(path.join(appDir, 'daten', 'datenbank.xml'), 'utf-8'));
}

function paketeListe(kategorie) {
  const wurzel = path.join(appDir, 'daten', 'CharakterAssistent', 'Ilaris', kategorie);
  if (!fs.existsSync(wurzel)) return [];
  const raus = [];
  const gehe = (dir, gruppe) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) gehe(p, e.name);
      else if (e.name.endsWith('.xml') && !e.name.endsWith('_var.xml')) {
        raus.push({ name: e.name.replace(/\.xml$/i, ''), pfad: p, gruppe });
      }
    }
  };
  gehe(wurzel, '');
  return raus;
}

ipcMain.handle('rt-ipc', (e, name, arg) => {
  switch (name) {
    case 'datenbankLaden': return ladeDatenbank();
    case 'paketeListe': return paketeListe(arg);
    case 'paketLaden': return { inhalt: fs.readFileSync(arg, 'utf-8') };
    case 'bibliothekSpeichern': return { pfad: 'TEST', name: arg && arg.name };
    case 'dateiLesen': return fs.readFileSync(arg, 'utf-8');
    case 'configLesen': return { config: {} };
    case 'configSchreiben': return true;
    default: return null;
  }
});

// app.exit() statt app.quit(): beendet auch die Hilfsprozesse sofort, sonst
// bleiben sie an der Ausgabe hängen und der Aufrufer wartet ewig.
let code = 1;
const beende = () => setTimeout(() => app.exit(code), 50);
ipcMain.on('rt-fertig', (e, fehler) => { code = fehler ? 1 : 0; beende(); });

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, 'rt-preload.cjs') },
  });
  win.webContents.on('console-message', (...args) => {
    const ev = args[0];
    const text = (ev && typeof ev === 'object' && 'message' in ev) ? ev.message : args[2];
    console.log(String(text));
  });
  win.webContents.on('render-process-gone', (e, d) => { console.log('RENDERER WEG ' + JSON.stringify(d)); beende(); });
  win.loadFile(path.join(__dirname, seite));
  setTimeout(() => { console.log('ZEITUEBERSCHREITUNG'); beende(); }, 60000);
});

app.on('window-all-closed', () => beende());

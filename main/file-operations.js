/**
 * Skularis Alpha 0.02.03 — File Operations (Main Process)
 */
const { dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');

function dateiOeffnenDialog(win, charOrdner) {
  const result = dialog.showOpenDialogSync(win, {
    title: 'Charakter öffnen',
    defaultPath: charOrdner,
    filters: [
      { name: 'Ilaris-Charakter', extensions: ['xml'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (!result || result.length === 0) return null;
  const pfad = result[0];
  try {
    const inhalt = fs.readFileSync(pfad, 'utf-8');
    return { pfad, inhalt };
  } catch (e) {
    throw new Error(`Datei konnte nicht gelesen werden: ${e.message}`);
  }
}

function dateiSpeichern(pfad, inhalt) {
  const dir = path.dirname(pfad);
  if (dir) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pfad, inhalt, 'utf-8');
  return { pfad };
}

function dateiSpeichernAlsDialog(win, charOrdner, vorschlag, inhalt) {
  const result = dialog.showSaveDialogSync(win, {
    title: 'Charakter speichern',
    defaultPath: path.join(charOrdner, vorschlag),
    filters: [
      { name: 'Ilaris-Charakter', extensions: ['xml'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  });
  if (!result) return null;
  dateiSpeichern(result, inhalt);
  return { pfad: result };
}

function dateiExportierenDialog(win, charOrdner, vorschlag, text) {
  const result = dialog.showSaveDialogSync(win, {
    title: 'Charakter exportieren',
    defaultPath: path.join(charOrdner, vorschlag),
    filters: [
      { name: 'Textdatei', extensions: ['txt'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  });
  if (!result) return null;
  fs.writeFileSync(result, text, 'utf-8');
  return { pfad: result };
}

function dateiDirektLaden(pfad) {
  const inhalt = fs.readFileSync(pfad, 'utf-8');
  return { inhalt };
}

function ladeDatenbank(basisPfad) {
  const xmlPfad = path.join(basisPfad, 'datenbank.xml');
  if (!fs.existsSync(xmlPfad)) return { db: null };
  const xml = fs.readFileSync(xmlPfad, 'utf-8');
  const { XMLParser } = require('fast-xml-parser');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '_text',
    processEntities: {
      maxTotalExpansions: 100000,
      maxExpandedLength: 500000,
    },
    isArray: (name) => {
      // Top-Level-Elementtypen der Sephrasto-datenbank.xml
      const arrays = ['Attribut', 'AbgeleiteterWert', 'Energie', 'Vorteil',
        'Fertigkeit', 'Talent', 'ÜbernatürlicheFertigkeit', 'FreieFertigkeit',
        'Waffe', 'Waffeneigenschaft', 'Rüstung', 'Regel', 'Einstellung'];
      return arrays.includes(name);
    },
  });
  const parsed = parser.parse(xml);
  return { db: parsed };
}

function oeffneRegelwerk(basisPfad) {
  const pdfPfad = path.join(basisPfad, 'dokumente', 'ilaris.pdf');
  if (fs.existsSync(pdfPfad)) {
    shell.openPath(pdfPfad);
  }
}

function letzteDateienLaden(settings) {
  const liste = settings.get('letzte_dateien') || [];
  return liste.filter(p => fs.existsSync(p));
}

// --- Charakter-Bibliothek ("Meine Charaktere") ---

function bibliothekListe(ordner) {
  if (!fs.existsSync(ordner)) return [];
  return fs.readdirSync(ordner)
    .filter(f => f.toLowerCase().endsWith('.xml'))
    .map(f => ({ name: f.replace(/\.xml$/i, ''), pfad: path.join(ordner, f) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function bibliothekSpeichern(ordner, name, inhalt) {
  fs.mkdirSync(ordner, { recursive: true });
  const sicher = String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Charakter';
  const pfad = path.join(ordner, sicher + '.xml');
  fs.writeFileSync(pfad, inhalt, 'utf-8');
  return { pfad, name: sicher };
}

function bibliothekLoeschen(pfad) {
  if (pfad && fs.existsSync(pfad)) fs.unlinkSync(pfad);
  return { ok: true };
}

function bibliothekSchreiben(ordner, dateiname, inhalt) {
  fs.mkdirSync(ordner, { recursive: true });
  const sicher = String(dateiname || '').replace(/[\\/:*?"<>|]/g, '_') || 'Datei';
  const pfad = path.join(ordner, sicher);
  fs.writeFileSync(pfad, inhalt, 'utf-8');
  return { pfad };
}

// --- Erschaffungspakete (Spezies/Kultur/Profession) ---

function paketeListe(datenPfad, kategorie) {
  const base = path.join(datenPfad, 'CharakterAssistent', 'Ilaris', kategorie);
  const out = [];
  const walk = (dir, gruppe) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, e.name);
      else if (e.name.toLowerCase().endsWith('.xml')) {
        out.push({ name: e.name.replace(/\.xml$/i, ''), pfad: p, gruppe: gruppe || '' });
      }
    }
  };
  walk(base, '');
  out.sort((a, b) => (a.gruppe + a.name).localeCompare(b.gruppe + b.name, 'de'));
  return out;
}

function paketLaden(datenPfad, pfad) {
  const norm = path.normalize(pfad);
  if (!norm.startsWith(path.normalize(datenPfad))) throw new Error('Ungültiger Paketpfad');
  return { inhalt: fs.readFileSync(norm, 'utf-8') };
}

// --- Abenteuer-Spielstände (JSON) ---

function abenteuerListe(ordner) {
  if (!fs.existsSync(ordner)) return [];
  return fs.readdirSync(ordner)
    .filter(f => f.toLowerCase().endsWith('.json'))
    .map(f => ({ name: f.replace(/\.json$/i, ''), pfad: path.join(ordner, f) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function abenteuerSpeichern(ordner, name, inhalt) {
  fs.mkdirSync(ordner, { recursive: true });
  const sicher = String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Abenteuer';
  const pfad = path.join(ordner, sicher + '.json');
  // Atomar: erst in eine Zwischendatei, dann umbenennen.
  const tmp = pfad + '.tmp';
  fs.writeFileSync(tmp, inhalt, 'utf-8');
  fs.renameSync(tmp, pfad);
  return { pfad, name: sicher };
}

function abenteuerLaden(pfad) {
  return { inhalt: fs.readFileSync(pfad, 'utf-8') };
}

function abenteuerLoeschen(pfad) {
  if (pfad && fs.existsSync(pfad)) fs.unlinkSync(pfad);
  return { ok: true };
}

module.exports = {
  dateiOeffnenDialog,
  dateiSpeichern,
  dateiSpeichernAlsDialog,
  dateiExportierenDialog,
  dateiDirektLaden,
  ladeDatenbank,
  oeffneRegelwerk,
  letzteDateienLaden,
  bibliothekListe,
  bibliothekSpeichern,
  bibliothekLoeschen,
  bibliothekSchreiben,
  paketeListe,
  paketLaden,
  abenteuerListe,
  abenteuerSpeichern,
  abenteuerLaden,
  abenteuerLoeschen,
};

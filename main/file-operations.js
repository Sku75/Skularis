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
//
// Jedes Abenteuer wohnt in einem EIGENEN Ordner (nie lose Dateien im
// Abenteuer-Verzeichnis). Im Ordner liegt der Spielstand als <Name>.json, und
// man kann dort beliebige eigene Dateien ablegen (Texte, Notizen, Material).
// Alte, lose gespeicherte Abenteuer werden beim Auflisten in ihren Ordner
// umgezogen.

function abenteuerMigriere(ordner) {
  if (!fs.existsSync(ordner)) return;
  for (const f of fs.readdirSync(ordner)) {
    if (!f.toLowerCase().endsWith('.json')) continue;
    const alt = path.join(ordner, f);
    if (!fs.statSync(alt).isFile()) continue;
    const name = f.replace(/\.json$/i, '');
    const ziel = path.join(ordner, name);
    if (fs.existsSync(ziel)) continue; // gleichnamiger Ordner existiert schon
    fs.mkdirSync(ziel, { recursive: true });
    fs.renameSync(alt, path.join(ziel, f));
  }
}

// Den Spielstand (.json) in einem Abenteuer-Ordner finden, bevorzugt <Ordner>.json.
function abenteuerDateiImOrdner(ordnerPfad, name) {
  const dateien = fs.readdirSync(ordnerPfad).filter(f => f.toLowerCase().endsWith('.json'));
  if (!dateien.length) return null;
  const bevorzugt = dateien.find(f => f.toLowerCase() === (name + '.json').toLowerCase());
  return path.join(ordnerPfad, bevorzugt || dateien[0]);
}

function abenteuerListe(ordner) {
  if (!fs.existsSync(ordner)) return [];
  abenteuerMigriere(ordner);
  const eintraege = [];
  for (const name of fs.readdirSync(ordner)) {
    const unter = path.join(ordner, name);
    if (!fs.statSync(unter).isDirectory()) continue;
    const pfad = abenteuerDateiImOrdner(unter, name);
    if (!pfad) continue; // Ordner ohne Spielstand ueberspringen
    eintraege.push({ name, pfad, ordner: unter });
  }
  return eintraege.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function abenteuerSpeichern(ordner, name, inhalt) {
  const sicher = String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Abenteuer';
  const unter = path.join(ordner, sicher);
  fs.mkdirSync(unter, { recursive: true });
  const pfad = path.join(unter, sicher + '.json');
  // Atomar: erst in eine Zwischendatei, dann umbenennen.
  const tmp = pfad + '.tmp';
  fs.writeFileSync(tmp, inhalt, 'utf-8');
  fs.renameSync(tmp, pfad);
  return { pfad, name: sicher, ordner: unter };
}

function abenteuerLaden(pfad) {
  return { inhalt: fs.readFileSync(pfad, 'utf-8') };
}

function abenteuerLoeschen(pfad) {
  if (!pfad || !fs.existsSync(pfad)) return { ok: true };
  // Liegt der Spielstand in seinem eigenen Abenteuer-Ordner, den ganzen Ordner
  // entfernen (samt hineingelegter Texte); als Rueckfall nur die Datei.
  const eltern = path.dirname(pfad);
  if (path.basename(eltern) && path.basename(path.dirname(eltern)) === 'Abenteuer-Daten') {
    fs.rmSync(eltern, { recursive: true, force: true });
  } else {
    fs.unlinkSync(pfad);
  }
  return { ok: true };
}

// --- Meisterabenteuer (eigener Ordner, sonst wie Abenteuer) ---

function meisterListe(ordner) {
  if (!fs.existsSync(ordner)) return [];
  return fs.readdirSync(ordner)
    .filter(f => f.toLowerCase().endsWith('.json'))
    .map(f => ({ name: f.replace(/\.json$/i, ''), pfad: path.join(ordner, f) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function meisterSpeichern(ordner, name, inhalt) {
  fs.mkdirSync(ordner, { recursive: true });
  const sicher = String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Meisterabenteuer';
  const pfad = path.join(ordner, sicher + '.json');
  const tmp = pfad + '.tmp';
  fs.writeFileSync(tmp, inhalt, 'utf-8');
  fs.renameSync(tmp, pfad);
  return { pfad, name: sicher };
}

function meisterLaden(pfad) {
  return { inhalt: fs.readFileSync(pfad, 'utf-8') };
}

function meisterLoeschen(pfad) {
  if (pfad && fs.existsSync(pfad)) fs.unlinkSync(pfad);
  return { ok: true };
}

// --- Abenteuertexte: Ordner waehlen, txt-Dateien lesen ---

function ordnerWaehlen(win, titel) {
  const result = dialog.showOpenDialogSync(win, {
    title: titel || 'Ordner mit Abenteuertexten waehlen',
    properties: ['openDirectory'],
  });
  if (!result || result.length === 0) return null;
  return { pfad: result[0] };
}

function textDateienListe(ordner) {
  if (!ordner || !fs.existsSync(ordner)) return [];
  return fs.readdirSync(ordner, { withFileTypes: true })
    .filter(e => e.isFile() && /\.(txt|md)$/i.test(e.name))
    .map(e => ({ name: e.name.replace(/\.(txt|md)$/i, ''), datei: e.name, pfad: path.join(ordner, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function textDateiLaden(pfad) {
  try { return { inhalt: fs.readFileSync(pfad, 'utf-8') }; }
  catch (e) { return { inhalt: '', fehler: e.message }; }
}

// --- Globale Gegner-Bibliothek (eigene Gegner, ueber alle Meisterabenteuer) ---

function gegnerBibLaden(pfad) {
  try { return { inhalt: fs.readFileSync(pfad, 'utf-8') }; }
  catch { return { inhalt: '' }; }
}

function gegnerBibSpeichern(pfad, inhalt) {
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  const tmp = pfad + '.tmp';
  fs.writeFileSync(tmp, inhalt, 'utf-8');
  fs.renameSync(tmp, pfad);
  return { pfad };
}

// --- Audio-Dateien (Musik, Hintergrundstimmung, Spontansounds) ---

const AUDIO_ENDUNGEN = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|webm)$/i;

// Inhalt eines Audio-Ordners: Unterordner (zum Weiterblaettern) und abspielbare
// Audio-Dateien. Nur lesen, nichts wird veraendert.
function audioInhalt(ordner) {
  if (!ordner || !fs.existsSync(ordner)) return { ordner: [], dateien: [] };
  let eintraege = [];
  try { eintraege = fs.readdirSync(ordner, { withFileTypes: true }); } catch { return { ordner: [], dateien: [] }; }
  const unterordner = eintraege.filter(e => e.isDirectory())
    .map(e => ({ name: e.name, pfad: path.join(ordner, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const dateien = eintraege.filter(e => e.isFile() && AUDIO_ENDUNGEN.test(e.name))
    .map(e => ({ name: e.name.replace(AUDIO_ENDUNGEN, ''), datei: e.name, pfad: path.join(ordner, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { ordner: unterordner, dateien };
}

// Eine Audio-Datei als Bytes lesen — aber nur, wenn sie unter einer erlaubten
// Wurzel liegt (Audio-Daten oder der vom Meister gewaehlte Ordner). So kann das
// Menue keine beliebigen Dateien vom Rechner auslesen.
function audioDatei(pfad, wurzeln) {
  const ziel = path.resolve(pfad || '');
  const erlaubt = (wurzeln || []).some((w) => {
    if (!w) return false;
    const wr = path.resolve(w);
    return ziel === wr || ziel.startsWith(wr + path.sep);
  });
  if (!erlaubt) return { fehler: 'nicht erlaubt' };
  try {
    const buf = fs.readFileSync(ziel);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return { bytes: ab };
  } catch (e) { return { fehler: e.message }; }
}

// --- Szenenpacks (Meister-Vorbereitung, im Ordner "Meister Daten") ---

function jsonLaden(pfad) {
  try { return { inhalt: fs.readFileSync(pfad, 'utf-8') }; }
  catch { return { inhalt: '' }; }
}

function jsonSpeichern(pfad, inhalt) {
  fs.mkdirSync(path.dirname(pfad), { recursive: true });
  const tmp = pfad + '.tmp';
  fs.writeFileSync(tmp, inhalt, 'utf-8');
  fs.renameSync(tmp, pfad);
  return { pfad };
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
  meisterListe,
  meisterSpeichern,
  meisterLaden,
  meisterLoeschen,
  ordnerWaehlen,
  textDateienListe,
  textDateiLaden,
  gegnerBibLaden,
  gegnerBibSpeichern,
  jsonLaden,
  jsonSpeichern,
  audioInhalt,
  audioDatei,
};

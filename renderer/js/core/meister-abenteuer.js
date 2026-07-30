/**
 * Skularistool — Datenmodell des Meisterabenteuers.
 *
 * Anders als das Spieler-Abenteuer (ein Charakter) fuehrt der Meistertisch eine
 * ganze Gruppe: mehrere Charakterboegen, dazu Gegner und freundliche NPC als
 * schlanke Statbloecke, ein Spieltisch mit Kampfkarten, Meister-Notizen und
 * Vorlesetexte, sowie die Merker fuer den Abenteuertexte-Betrachter.
 *
 * Gespeichert wird als eigenes JSON im Ordner Meisterabenteuer (getrennt vom
 * Spielertisch). Beim Abschluss werden KEINE Punkte in die Charakterboegen
 * geschrieben; die vergebenen Erfahrungspunkte gehen nur ins Protokoll.
 */
import { abgeleiteteWerte, waffenwerte } from './regeln.js';
import { leseInventar, istFernkampf, SLOTS, SET_WAFFENLOS } from './ausruestung.js';

export const SCHEMA_VERSION = 1;

/** Fortlaufende, speicherbare Id fuer Karten und Statbloecke. */
export function naechsteId(a) {
  a._nextId = (a._nextId || 0) + 1;
  return a._nextId;
}

export function createMeisterAbenteuer(name) {
  return {
    schemaVersion: SCHEMA_VERSION,
    typ: 'meister',
    name: name || 'Neues Meisterabenteuer',
    spieltag: 1,
    _nextId: 0,
    charaktere: [],        // { name, pfad, bogen }
    nsc: [],               // Gegner-Statbloecke
    freundlicheNsc: [],    // freundliche Meister-NPC (gleiche Form)
    tisch: { karten: [] },
    journal: [],
    meisterNotizen: [],    // { titel, inhalt, spieltag }
    vorlesetexte: [],      // { titel, inhalt }
    textOrdner: '',        // zuletzt gewaehlter Abenteuertexte-Ordner
    textLesezeichen: {},   // pfad -> { zeile }
    protokoll: [],
    apProtokoll: [],       // { spieltag, text } — vergebene EP je Abend
  };
}

/** Leerer schlanker Statblock (Gegner oder freundlicher NPC). */
export function leererStatblock(a) {
  return {
    id: naechsteId(a),
    name: '',
    ws: 4, rs: 0, ini: 0,
    notizen: '',
    angriffe: [],          // { name, wert, wuerfel, seiten, bonus }
  };
}

export function parseMeisterAbenteuer(text) {
  const a = JSON.parse(text);
  a.typ = 'meister';
  a.spieltag = a.spieltag || 1;
  a._nextId = a._nextId || 0;
  a.charaktere = Array.isArray(a.charaktere) ? a.charaktere : [];
  a.nsc = Array.isArray(a.nsc) ? a.nsc : [];
  a.freundlicheNsc = Array.isArray(a.freundlicheNsc) ? a.freundlicheNsc : [];
  a.tisch = a.tisch && typeof a.tisch === 'object' ? a.tisch : { karten: [] };
  a.tisch.karten = Array.isArray(a.tisch.karten) ? a.tisch.karten : [];
  a.journal = Array.isArray(a.journal) ? a.journal : [];
  a.meisterNotizen = Array.isArray(a.meisterNotizen) ? a.meisterNotizen : [];
  a.vorlesetexte = Array.isArray(a.vorlesetexte) ? a.vorlesetexte : [];
  a.textOrdner = a.textOrdner || '';
  a.textLesezeichen = a.textLesezeichen && typeof a.textLesezeichen === 'object' ? a.textLesezeichen : {};
  a.protokoll = Array.isArray(a.protokoll) ? a.protokoll : [];
  a.apProtokoll = Array.isArray(a.apProtokoll) ? a.apProtokoll : [];
  return a;
}

/** Protokoll-Eintrag (neueste oben). Eigen gehalten, damit unabhaengig vom Spielertisch. */
export function protokolliere(a, text) {
  let zeit = '';
  try { zeit = new Date().toLocaleString('de-DE'); } catch { zeit = ''; }
  a.protokoll.unshift({ spieltag: a.spieltag, zeit, text });
}

// --- Kampfkarten ---------------------------------------------------------

/** Waffe je Slot (wie am Spielertisch): erstes echtes Set, sonst einsortiert. */
function slotWaffen(bogen, db) {
  const findW = (n) => (n ? (bogen.waffen || []).find(x => x.name === n) || null : null);
  const inv = leseInventar(bogen);
  const echte = (inv.waffenSets || []).filter(s => s.name !== SET_WAFFENLOS);
  if (echte.length) {
    const set = echte[0];
    return { Haupthand: findW(set.haupthand), Nebenhand: findW(set.nebenhand), Fernkampf: findW(set.fernkampf) };
  }
  const res = { Haupthand: null, Nebenhand: null, Fernkampf: null };
  for (const wa of (bogen.waffen || []).filter(x => x.name)) {
    if (istFernkampf(db, wa)) { if (!res.Fernkampf) res.Fernkampf = wa; }
    else if (!res.Haupthand) res.Haupthand = wa;
    else if (!res.Nebenhand) res.Nebenhand = wa;
  }
  return res;
}

/** Angriffe eines Charakters fuer die Kampfkarte (Name, Attacke, Schaden). */
function charAngriffe(bogen, db) {
  const w = abgeleiteteWerte(bogen);
  const out = [];
  if (!db) return out;
  const sw = slotWaffen(bogen, db);
  for (const slot of SLOTS) {
    const waffe = sw[slot];
    if (!waffe) continue;
    const k = waffenwerte(bogen, db, waffe);
    if (k.at === null && k.vt === null) continue;
    out.push({
      name: `${slot} ${waffe.name}`,
      wert: k.at !== null ? k.at : k.vt,
      wuerfel: waffe.wuerfel || 0,
      seiten: waffe.wuerfelSeiten || 6,
      bonus: (k.tp || 0) + w.SB,
    });
  }
  return out;
}

/** Kampfkarte (Kurzform) aus einem Charakterbogen. */
export function baueSpielerKarte(a, bogen, db) {
  const w = abgeleiteteWerte(bogen);
  return {
    id: naechsteId(a),
    art: 'spieler',
    name: bogen.name || 'Held',
    ws: w.WS, rs: w.RS, ini: w.INI,
    wunden: 0,
    angriffe: charAngriffe(bogen, db),
    notizen: '',
    zuOrt: null,
  };
}

/** Kampfkarte aus einem Statblock (Gegner oder Freund). */
export function baueStatblockKarte(a, sb, art) {
  return {
    id: naechsteId(a),
    art: art || 'gegner',
    name: sb.name || (art === 'freund' ? 'NPC' : 'Gegner'),
    ws: sb.ws || 0, rs: sb.rs || 0, ini: sb.ini || 0,
    wunden: 0,
    angriffe: (sb.angriffe || []).map(x => ({ ...x })),
    notizen: sb.notizen || '',
    zuOrt: null,
  };
}

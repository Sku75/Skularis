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
    // Geteilte Vitalitaet je Charakter (Name -> { wunden, erschoepfung }). EINE
    // Quelle fuer die Spielerinfos-Uebersicht UND den Spieltisch-Kampf: aendert
    // sich hier etwas, sieht man es dort und umgekehrt.
    vitalitaet: {},
    charNotizen: {},       // Name -> freie Notiz zum Charakter
    nsc: [],               // Gegner-Statbloecke
    gegnerKategorien: [],  // eigene Gegner-Kategorien dieses Abenteuers (frei benannt)
    freundlicheNsc: [],    // freundliche Meister-NPC (gleiche Form)
    tisch: { karten: [] },
    szenen: [],            // Szenen dieses Abenteuers (durchnummeriert S-1, S-2 ...): { name?, karten: [] }
    journal: [],
    meisterNotizen: [],    // { titel, inhalt, spieltag }
    vorlesetexte: [],      // { titel, inhalt }
    textOrdner: '',        // zuletzt gewaehlter Abenteuertexte-Ordner
    textLesezeichen: {},   // pfad -> { zeile }
    protokoll: [],
    apProtokoll: [],       // { spieltag, text } — vergebene EP je Abend
    // Audio-Schnelltasten. Je Abenteuer eigene Belegung: 24 Plaetze (Block 1
    // Strg+1..Strg+´, Block 2 Strg+Shift+1..Strg+Shift+´), jeder null (frei) oder
    // { name, pfad, modus, loop, lautstaerke }. modus: 'einspielen' | 'abspielen'
    // | 'hintergrund'. lautstaerke: null = Kanal-Standard, sonst 0..100. Neues
    // Abenteuer startet mit leeren Schnelltasten.
    kurztasten: Array.from({ length: 24 }, () => null),
  };
}

/**
 * Geteilte Vitalitaet eines Charakters (nach Name). Legt den Eintrag bei Bedarf
 * an. Wunden und Erschoepfung stehen hier EINMAL: die Spielerinfos-Uebersicht und
 * der Spieltisch-Kampf lesen und schreiben denselben Wert.
 */
export function vitalitaet(a, name) {
  a.vitalitaet = a.vitalitaet || {};
  if (!a.vitalitaet[name]) a.vitalitaet[name] = { wunden: 0, erschoepfung: 0 };
  const v = a.vitalitaet[name];
  if (typeof v.wunden !== 'number') v.wunden = 0;
  if (typeof v.erschoepfung !== 'number') v.erschoepfung = 0;
  return v;
}

/** Leerer schlanker Statblock (Gegner oder freundlicher NPC). */
export function leererStatblock(a) {
  return {
    id: naechsteId(a),
    name: '',
    kategorie: '',
    ws: 4, rs: 0, ini: 0,
    ausweichen: 0,         // passive Verteidigung (Monsterwurf), vom Meister gepflegt
    angriffe: [],          // { name, at, pa, wuerfel, seiten, bonus }
    vorteile: [],          // Faehigkeiten/Vorteile, die der Gegner beherrscht
    manoever: [],          // Manoever, die der Gegner beherrscht
    notizen: '',
  };
}

/** Angriffszeile lesbar (unterstuetzt neues at/pa und altes wert). */
export function angriffText(ang) {
  const at = ang.at != null ? ang.at : ang.wert;
  const paTeil = ang.pa != null ? `, Parade ${ang.pa}` : '';
  const schaden = `Schaden ${ang.wuerfel || 0} W ${ang.seiten || 6}${ang.bonus ? ' plus ' + ang.bonus : ''}`;
  return `${ang.name}, Attacke ${at != null ? at : 0}${paTeil}, ${schaden}`;
}

/** Alle Angriffe einer Karte/eines Statblocks als Satz. */
export function angriffeText(karte) {
  return (karte.angriffe || []).map(angriffText).join('. ');
}

/**
 * Eine Bibliotheks-Vorlage (Bestiarium oder eigene Bibliothek) tief in einen
 * neuen Statblock fuer die Auswahl des Abenteuers kopieren (mit frischer Id).
 */
export function statblockAusVorlage(a, vorlage) {
  return {
    id: naechsteId(a),
    name: vorlage.name || 'Gegner',
    kategorie: vorlage.kategorie || '',
    ws: vorlage.ws || 0, rs: vorlage.rs || 0, ini: vorlage.ini || 0,
    ausweichen: vorlage.ausweichen || 0,
    angriffe: (vorlage.angriffe || []).map(x => ({ ...x })),
    vorteile: Array.isArray(vorlage.vorteile) ? [...vorlage.vorteile] : [],
    manoever: Array.isArray(vorlage.manoever) ? [...vorlage.manoever] : [],
    notizen: vorlage.notizen || '',
  };
}

export function parseMeisterAbenteuer(text) {
  const a = JSON.parse(text);
  a.typ = 'meister';
  a.spieltag = a.spieltag || 1;
  a._nextId = a._nextId || 0;
  a.charaktere = Array.isArray(a.charaktere) ? a.charaktere : [];
  a.vitalitaet = (a.vitalitaet && typeof a.vitalitaet === 'object') ? a.vitalitaet : {};
  a.charNotizen = (a.charNotizen && typeof a.charNotizen === 'object') ? a.charNotizen : {};
  a.nsc = Array.isArray(a.nsc) ? a.nsc : [];
  a.gegnerKategorien = Array.isArray(a.gegnerKategorien) ? a.gegnerKategorien : [];
  a.freundlicheNsc = Array.isArray(a.freundlicheNsc) ? a.freundlicheNsc : [];
  a.tisch = a.tisch && typeof a.tisch === 'object' ? a.tisch : { karten: [] };
  a.tisch.karten = Array.isArray(a.tisch.karten) ? a.tisch.karten : [];
  a.szenen = Array.isArray(a.szenen) ? a.szenen : [];
  a.journal = Array.isArray(a.journal) ? a.journal : [];
  a.meisterNotizen = Array.isArray(a.meisterNotizen) ? a.meisterNotizen : [];
  a.namensErgebnisse = Array.isArray(a.namensErgebnisse) ? a.namensErgebnisse : []; // Namensgenerator

  a.vorlesetexte = Array.isArray(a.vorlesetexte) ? a.vorlesetexte : [];
  a.textOrdner = a.textOrdner || '';
  a.textLesezeichen = a.textLesezeichen && typeof a.textLesezeichen === 'object' ? a.textLesezeichen : {};
  a.protokoll = Array.isArray(a.protokoll) ? a.protokoll : [];
  a.apProtokoll = Array.isArray(a.apProtokoll) ? a.apProtokoll : [];
  // Audio-Schnelltasten: immer genau 24 Plaetze (fehlende mit null auffuellen).
  // Aeltere Datensaetze mit 12 Plaetzen werden so auf 24 erweitert (Block 2 leer).
  a.kurztasten = Array.isArray(a.kurztasten) ? a.kurztasten.slice(0, 24) : [];
  while (a.kurztasten.length < 24) a.kurztasten.push(null);
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
      at: k.at,
      pa: k.vt,
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
    kategorie: sb.kategorie || '',
    ws: sb.ws || 0, rs: sb.rs || 0, ini: sb.ini || 0,
    ausweichen: sb.ausweichen || 0,
    wunden: 0,
    angriffe: (sb.angriffe || []).map(x => ({ ...x })),
    vorteile: Array.isArray(sb.vorteile) ? [...sb.vorteile] : [],
    manoever: Array.isArray(sb.manoever) ? [...sb.manoever] : [],
    notizen: sb.notizen || '',
    zuOrt: null,
  };
}

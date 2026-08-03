/**
 * Skularistool — Abenteuer-Datenmodell (Spielsitzung).
 *
 * Ein Abenteuer ist ein eigener Spielstand (JSON). Der Charakter nimmt teil:
 * beim Erstellen wird eine Momentaufnahme übernommen (nur zum Ansehen), der
 * Sitzungszustand (Ressourcen, Inventar, Notizen, Tagebuch, Mitspieler, Protokoll,
 * Spieltag, verdiente EP) ist veränderlich und wird gespeichert.
 */
import { abgeleiteteWerte } from './regeln.js';
import { leseInventar, schreibeInventar, ORT_MANN, ORT_RUCKSACK } from './ausruestung.js';

export const SCHEMA_VERSION = 1;

/** Ressourcen aus dem Charakter ableiten (Maxima aus dem Bogen, Stand = voll). */
export function ressourcenAusCharakter(char) {
  const w = abgeleiteteWerte(char);
  const res = {
    Wunden: { aktuell: 0 },
    Erschoepfung: { aktuell: 0 },
    SchiP: { aktuell: w.SchiP, max: w.SchiP },
  };
  for (const k of ['AsP', 'KaP', 'GuP']) {
    const e = char.energien && char.energien[k];
    if (e) {
      const max = (e.basis || 0) + (e.gekauft || 0);
      if (max > 0) res[k] = { aktuell: max, max };
    }
  }
  // Astralspeicher eines Zauberstabs: der im Editor eingestellte Wert (0 bis 50)
  // ist das Maximum. Im Abenteuer startet der Speicher voll und wird als eigener
  // Zaehler verwaltet; drueber geht nicht (die Ressourcen-Zeile klemmt auf max).
  const stab = char.astralspeicherStab || 0;
  if (stab > 0) res.AstralspeicherStab = { aktuell: stab, max: stab };
  return res;
}

/**
 * Ressourcen-Zähler mit dem (frischen) Bogen abgleichen. Wird beim Öffnen eines
 * Abenteuers genutzt: Der Bogen ist König für die MAXIMA (z. B. neu gesteigerte
 * Energien), der bisherige Spielstand liefert die AKTUELLEN Werte.
 *
 * - Zähler mit Maximum (SchiP, AsP, KaP, GuP, AstralspeicherStab): Maximum neu
 *   aus dem Bogen, aktuellen Wert aus dem alten Stand behalten und auf das neue
 *   Maximum begrenzen.
 * - Zähler ohne Maximum (Wunden, Erschöpfung): aktuellen Wert behalten.
 * - Neu hinzugekommene Zähler (im Editor erst neu gekauft) bleiben voll.
 * - Zähler, die es nicht mehr gibt (Energie wieder auf 0), fallen weg.
 */
export function mergeRessourcen(altRes, char) {
  const neu = ressourcenAusCharakter(char); // frische Maxima, aktuell = voll
  const alt = altRes || {};
  for (const key of Object.keys(neu)) {
    const a = alt[key];
    if (!a) continue; // neuer Zähler: bleibt voll
    if (neu[key].max != null) {
      const max = neu[key].max;
      const aktuell = Math.max(0, Math.min(max, a.aktuell != null ? a.aktuell : max));
      neu[key] = { aktuell, max };
    } else {
      neu[key] = { aktuell: a.aktuell || 0 };
    }
  }
  return neu;
}

/**
 * Inventar aus dem Charakter übernehmen: die Münzbörse aus char.geldboerse, die
 * Gegenstände aus der ECHTEN Ausrüstungsliste des Charakterbogens
 * (char.ausruestung über leseInventar). "Am Mann" (ORT_MANN) wird zum Gürtel,
 * ORT_RUCKSACK zum Rucksack. So kommen die im Editor eingetragenen Gegenstände
 * korrekt ins Abenteuer. Waffen- und Rüstungssets bleiben am Bogen.
 */
export function inventarAusCharakter(char) {
  const g = (char && char.geldboerse) || {};
  const inv = leseInventar(char || {});
  const rucksack = [];
  const guertel = [];
  for (const item of inv.gegenstaende) {
    if (item.ort === ORT_RUCKSACK) rucksack.push(item.text);
    else guertel.push(item.text);
  }
  return {
    geldboerse: { dukaten: g.dukaten || 0, silber: g.silber || 0, kupfer: g.kupfer || 0 },
    rucksack, guertel,
  };
}

/**
 * Beim Spieltag-Abschluss zurück in den Charakterbogen: die im Abenteuer
 * veränderte Münzbörse und die Gegenstände werden übernommen. Die Gegenstände
 * gehen zurück in char.ausruestung (über schreibeInventar), die Waffen- und
 * Rüstungssets des Bogens bleiben dabei erhalten. So transportiert der
 * Charakterbogen das Inventar in beide Richtungen.
 */
export function uebernehmeAbenteuerdaten(char, a) {
  const inv = (a && a.inventar) || {};
  char.geldboerse = { ...(inv.geldboerse || { dukaten: 0, silber: 0, kupfer: 0 }) };
  // Einträge können Strings (aktuelles Abenteuer-Modell) oder alte {text}-Objekte sein.
  const alsText = (x) => (typeof x === 'string' ? x : (x && x.text) || '');
  const gegenstaende = [];
  for (const x of (inv.guertel || [])) { const t = alsText(x).trim(); if (t) gegenstaende.push({ text: t, ort: ORT_MANN }); }
  for (const x of (inv.rucksack || [])) { const t = alsText(x).trim(); if (t) gegenstaende.push({ text: t, ort: ORT_RUCKSACK }); }
  const vorhanden = leseInventar(char); // Waffen-/Rüstungssets erhalten
  schreibeInventar(char, { gegenstaende, waffenSets: vorhanden.waffenSets, ruestungsSets: vorhanden.ruestungsSets });
}

export function createAbenteuer(char, name, charakterName, charakterPfad) {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: name || 'Neues Abenteuer',
    spieltag: 1,
    charakterName: charakterName || char.name || '',
    charakterPfad: charakterPfad || '',
    charakter: char,
    ressourcen: ressourcenAusCharakter(char),
    inventar: inventarAusCharakter(char),
    mitspieler: [],
    // Gemeinsamer, chronologischer Strom aus Notizen und Tagebuch-Einträgen.
    // Jeder Eintrag: { typ:'notiz'|'tagebuch', titel, inhalt, spieltag }.
    journal: [],
    protokoll: [],
    apGesamt: 0,
  };
}

export function serialisiereAbenteuer(a) {
  return JSON.stringify(a, null, 2);
}

export function parseAbenteuer(text) {
  const a = JSON.parse(text);
  // Weiche Absicherung fehlender Felder (Vorwärtskompatibilität).
  a.spieltag = a.spieltag || 1;
  a.ressourcen = a.ressourcen || {};
  a.inventar = a.inventar || { geldboerse: { dukaten: 0, silber: 0, kupfer: 0 }, rucksack: [], guertel: [] };
  a.inventar.geldboerse = a.inventar.geldboerse || { dukaten: 0, silber: 0, kupfer: 0 };
  a.inventar.rucksack = a.inventar.rucksack || [];
  a.inventar.guertel = a.inventar.guertel || [];
  a.mitspieler = a.mitspieler || [];
  a.protokoll = a.protokoll || [];
  a.apGesamt = a.apGesamt || 0;

  // Nachruesten: hat der Charakter einen Astralspeicher-Stab, aber das Abenteuer
  // kennt die Ressource noch nicht (aelterer Spielstand), dann einmalig voll anlegen.
  const stab = (a.charakter && a.charakter.astralspeicherStab) || 0;
  if (stab > 0 && !a.ressourcen.AstralspeicherStab) {
    a.ressourcen.AstralspeicherStab = { aktuell: stab, max: stab };
  }

  // Journal aus altem Format (a.tagebuch[] + a.notizen-String) migrieren.
  if (!Array.isArray(a.journal)) {
    a.journal = [];
    for (const e of a.tagebuch || []) {
      a.journal.push({ typ: 'tagebuch', titel: `Spieltag ${e.spieltag}`, inhalt: e.text || '', spieltag: e.spieltag || 1 });
    }
    for (const z of String(a.notizen || '').split('\n').filter(Boolean)) {
      a.journal.push({ typ: 'notiz', titel: z.slice(0, 40), inhalt: z, spieltag: a.spieltag });
    }
  }
  // Alte Felder nicht mehr führen; Journal ist ab jetzt die Quelle.
  delete a.tagebuch;
  delete a.notizen;
  return a;
}

/** Protokoll-Eintrag hinzufügen (neueste oben). */
export function protokolliere(a, text) {
  let zeit = '';
  try { zeit = new Date().toLocaleString('de-DE'); } catch { zeit = ''; }
  a.protokoll.unshift({ spieltag: a.spieltag, zeit, text });
}

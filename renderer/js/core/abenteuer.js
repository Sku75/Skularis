/**
 * Skularistool — Abenteuer-Datenmodell (Spielsitzung).
 *
 * Ein Abenteuer ist ein eigener Spielstand (JSON). Der Charakter nimmt teil:
 * beim Erstellen wird eine Momentaufnahme übernommen (nur zum Ansehen), der
 * Sitzungszustand (Ressourcen, Inventar, Notizen, Tagebuch, Mitspieler, Protokoll,
 * Spieltag, verdiente AP) ist veränderlich und wird gespeichert.
 */
import { abgeleiteteWerte } from './regeln.js';

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
  return res;
}

/**
 * Inventar aus dem Charakter übernehmen: Münzbörse und Spielinventar stammen
 * aus den eigenen Skularis-Feldern des Charakterbogens (char.geldboerse,
 * char.spielinventar). Fehlen sie (älterer Bogen), beginnt das Abenteuer leer.
 */
export function inventarAusCharakter(char) {
  const g = (char && char.geldboerse) || {};
  const si = (char && char.spielinventar) || {};
  return {
    geldboerse: { dukaten: g.dukaten || 0, silber: g.silber || 0, kupfer: g.kupfer || 0 },
    rucksack: Array.isArray(si.rucksack) ? si.rucksack.map(x => ({ ...x })) : [],
    guertel: Array.isArray(si.guertel) ? si.guertel.map(x => ({ ...x })) : [],
  };
}

/**
 * Beim Spieltag-Abschluss zurück in den Charakterbogen: die im Abenteuer
 * veränderte Münzbörse und das Spielinventar werden übernommen. So bleibt der
 * Charakterbogen der eine aktuelle Stand für das nächste Abenteuer.
 */
export function uebernehmeAbenteuerdaten(char, a) {
  const inv = (a && a.inventar) || {};
  char.geldboerse = { ...(inv.geldboerse || { dukaten: 0, silber: 0, kupfer: 0 }) };
  char.spielinventar = {
    rucksack: Array.isArray(inv.rucksack) ? inv.rucksack.map(x => ({ ...x })) : [],
    guertel: Array.isArray(inv.guertel) ? inv.guertel.map(x => ({ ...x })) : [],
  };
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

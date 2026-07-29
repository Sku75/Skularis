/**
 * Skularistool — Live-Spiel-Menüs: Aktionen, Manöver und Zauber.
 *
 * Aufbau in zwei Ebenen: das jeweilige Menü zeigt zuerst die Regelbuch-Kategorien
 * als Untermenüs; erst darin stehen die einzelnen Einträge (nicht alles auf einer
 * Ebene). Aktionen sind reine Nachschlage-Einträge, Manöver und Zauber haben
 * Würfelfunktionen: Enter würfelt mit den echten Werten des Charakters.
 */
import * as sprache from '../sprache.js';
import * as screen from '../ui/screen.js';
import { menuScreen } from '../ui/menu-screen.js';
import { getDb } from '../core/db-laden.js';
import { fertigkeitProbenwert, waffenwerte } from '../core/regeln.js';
import { leseInventar, SET_WAFFENLOS } from '../core/ausruestung.js';
import { talentGruppen, talentDetail } from '../editor/talente.js';
import { getAbenteuer } from './state.js';
import { kampfProbe } from './wuerfel-kern.js';
import {
  AKTIONEN, AKTION_GRUPPEN, MANOEVER, MANOEVER_GRUPPEN, ZAUBER_MODIFIKATOREN,
} from '../daten/kampf-listen.js';

export const GRUNDREGEL_AKTIONEN = 'Pro Initiativephase kannst du eine volle oder bis zu zwei '
  + 'einfache Aktionen ausführen. Bei zwei einfachen Aktionen sind alle Proben darin um 4 erschwert. '
  + 'Dazu kommen beliebig viele verschiedene Freie Aktionen.';

// --- Aktionen (Kategorien als Untermenüs) --------------------------------

export function aktionenScreen() {
  const items = AKTION_GRUPPEN.map(g => ({
    label: g.titel,
    hint: `${AKTIONEN.filter(a => a.typ === g.typ).length} Aktionen`,
    detail: g.titel + '. ' + GRUNDREGEL_AKTIONEN,
    onSelect: () => screen.push(aktionListe(g)),
  }));
  return menuScreen({
    title: 'Aktionen',
    subtitle: 'Wähle eine Art von Aktion. Escape zurück.',
    items, filter: false,
  });
}

function aktionListe(g) {
  const items = AKTIONEN.filter(a => a.typ === g.typ).map(ak => ({
    label: ak.name,
    detail: ak.tooltip,
    onSelect: () => sprache.sage(`${ak.name}. ${ak.tooltip}`),
  }));
  return menuScreen({
    title: g.titel,
    subtitle: 'Enter oder Shift und Pfeil-runter liest die Erklärung. Escape zurück.',
    items, filter: items.length >= 10,
  });
}

// --- Manöver (Kategorien als Untermenüs, mit Würfelfunktion) --------------

// Je Manöver: würfelt es eine Attacke oder eine Verteidigung, und welcher feste
// Aufschlag gilt. Variable Anteile (minus X, minus BE) trägt der Spieler bei der
// Erschwernis-Abfrage nach; der Tooltip nennt sie.
const MANOEVER_PROBE = {
  'Ausweichen': ['VT', -2], 'Binden': ['VT', 0], 'Entfernung verändern': ['AT', 0],
  'Entwaffnen': ['AT', -4], 'Gezielter Schlag': ['AT', -2], 'Umreißen': ['AT', 0], 'Wuchtschlag': ['AT', 0],
  'Auflaufen lassen': ['VT', -4], 'Rüstungsbrecher': ['AT', -4], 'Schildspalter': ['AT', 2],
  'Stumpfer Schlag': ['AT', 0], 'Umklammern': ['AT', 0],
  'Ausfall': ['AT', -2], 'Befreiungsschlag': ['AT', -4], 'Doppelangriff': ['AT', -4], 'Hammerschlag': ['AT', -8],
  'Klingentanz': ['AT', -4], 'Niederwerfen': ['AT', -4], 'Todesstoß': ['AT', -8], 'Riposte': ['VT', -4],
  'Schildwall': ['VT', -4], 'Sturmangriff': ['AT', 0], 'Überrennen': ['AT', 0], 'Unterlaufen': ['VT', -4],
};

/** Waffe, mit der Manöver-Proben gewürfelt werden: die Haupthand des ersten echten Sets, sonst die erste Waffe. */
function primaerWaffe(char, db) {
  const inv = leseInventar(char);
  const echte = (inv.waffenSets || []).filter(s => s.name !== SET_WAFFENLOS);
  const name = echte[0] && echte[0].haupthand;
  let waffe = name ? (char.waffen || []).find(x => x.name === name) : null;
  if (!waffe) waffe = (char.waffen || []).find(x => x.name);
  return waffe ? { waffe, k: waffenwerte(char, db, waffe) } : null;
}

export function manoeverScreen() {
  const items = MANOEVER_GRUPPEN.map(g => ({
    label: g.titel,
    hint: `${MANOEVER.filter(m => m.kategorie === g.kategorie).length} Manöver`,
    detail: `${g.titel}. Manöver werden vor Attacke oder Verteidigung angesagt und erschweren die Probe, versprechen dafür eine besondere Wirkung.`,
    onSelect: () => screen.push(manoeverListe(g)),
  }));
  return menuScreen({
    title: 'Manöver',
    subtitle: 'Wähle eine Art von Manöver. Escape zurück.',
    items, filter: false,
  });
}

function manoeverListe(g) {
  const a = getAbenteuer();
  const char = a.charakter;
  const db = getDb();
  const pw = primaerWaffe(char, db);
  let idx = 0;
  const items = MANOEVER.filter(m => m.kategorie === g.kategorie).map((m) => {
    const [art, modFix] = MANOEVER_PROBE[m.name] || ['AT', 0];
    const vokabel = art === 'VT' ? 'Verteidigung' : 'Attacke';
    const basis = pw ? (art === 'VT' ? pw.k.vt : pw.k.at) : null;
    const id = `man-${g.kategorie}-${idx++}`;
    if (basis === null || basis === undefined) {
      // Keine passende Waffe (oder Probe verboten): nur Nachschlag.
      return { label: `${m.name}, ${m.mod}`, detail: m.tooltip, onSelect: () => sprache.sage(`${m.name}, ${m.mod}. ${m.tooltip}`) };
    }
    const eff = basis + modFix;
    const rechnung = modFix ? ` (${basis} ${modFix > 0 ? 'plus ' + modFix : 'minus ' + (-modFix)})` : '';
    return {
      label: `${m.name}: ${vokabel} ${eff}${rechnung}`,
      hint: `Enter würfelt die ${vokabel}-Probe mit ${pw.waffe.name}`,
      detail: `${m.mod}. ${m.tooltip}`,
      ergebnisId: id,
      onSelect: () => kampfProbe({
        id, titel: `${m.name} mit ${pw.waffe.name}`, vokabel, probenwert: basis, extraMod: modFix,
      }),
    };
  });
  return menuScreen({
    title: g.titel,
    subtitle: 'Enter würfelt, Shift und Pfeil-runter liest die Wirkung. Variable Anteile über die Erschwernis. Escape zurück.',
    items, filter: items.length >= 10,
  });
}

// --- Zauber und Rituale (Traditionen/Fertigkeiten als Untermenüs) ---------

function kuerzeTradition(name) {
  let s = String(name).replace(/\s+(I|II|III|IV|V)$/i, '').trim();
  s = s.replace(/^Tradition\s+(der|des|von)\s+/i, '').trim();
  return s;
}

/** Kurzer Traditionsname aus den Vorteilen (magisch 5, karmal 7, dämonisch 8). */
export function traditionName(char, db) {
  if (!db) return null;
  for (const v of char.vorteile || []) {
    const name = typeof v === 'string' ? v : v.name;
    const def = db.vorteilByName[name];
    if (def && [5, 7, 8].includes(Number(def.typ))) return kuerzeTradition(name);
  }
  return null;
}

/** Iteriert die bekannten Zauber je übernatürlicher Fertigkeit. */
function bekannteZauber(char, db) {
  const gruppen = [];
  for (const uname of Object.keys(char.uebernatuerlich || {})) {
    const udef = db.uebernatByName[uname];
    if (!udef) continue;
    const { gewaehlt } = talentGruppen(char, db, uname);
    if (!gewaehlt || !gewaehlt.length) continue;
    const fw = char.uebernatuerlich[uname].wert || 0;
    const pw = fertigkeitProbenwert(char, udef, fw, true);
    gruppen.push({ uname, udef, pw, zauber: gewaehlt });
  }
  return gruppen;
}

/** Hat der Charakter überhaupt bekannte Zauber? (für die Menü-Sichtbarkeit) */
export function zauberVorhanden(char, db) {
  return !!db && bekannteZauber(char, db).length > 0;
}

/** Menü-Beschriftung für die Zauber-Kategorie (dynamisch mit Tradition). */
export function zauberKategorieLabel(char, db) {
  const trad = traditionName(char, db);
  return trad ? `Zauber und Rituale, ${trad}` : 'Zauber und Rituale';
}

export function zauberScreen() {
  const a = getAbenteuer();
  const char = a.charakter;
  const db = getDb();
  const gruppen = bekannteZauber(char, db);
  const items = gruppen.map(g => ({
    label: `${g.uname}, Probenwert ${g.pw}`,
    hint: `${g.zauber.length} Zauber`,
    detail: g.udef.text || `Zauberfertigkeit ${g.uname}.`,
    onSelect: () => screen.push(zauberListe(g)),
  }));
  return menuScreen({
    title: zauberKategorieLabel(char, db),
    subtitle: 'Wähle eine Zauberfertigkeit. Escape zurück.',
    items, filter: items.length >= 10, leer: 'Keine Zauber bekannt.',
  });
}

function zauberListe(g) {
  const a = getAbenteuer();
  const char = a.charakter;
  const db = getDb();
  let idx = 0;
  const items = g.zauber.map((z) => {
    const name = typeof z === 'string' ? z : z.name;
    const id = `zauber-${g.uname}-${idx++}`;
    return {
      label: name,
      hint: 'Enter zum Zaubern',
      detail: talentDetail(char, db, name, g.udef.steigerungsfaktor),
      ergebnisId: id,
      onSelect: () => kampfProbe({
        id, titel: `Zauber ${name}`, vokabel: g.uname, probenwert: g.pw, modListe: ZAUBER_MODIFIKATOREN,
      }),
    };
  });
  return menuScreen({
    title: `${g.uname}, Probenwert ${g.pw}`,
    subtitle: 'Enter startet die Zauberprobe: Würfelwahl, Modifikatoren, Erschwernis. Escape zurück.',
    items, filter: items.length >= 10,
  });
}

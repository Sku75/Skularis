/**
 * Skularistool — Live-Spiel-Menüs: Aktionen, Manöver und Zauber.
 *
 * Aktionen und Manöver sind Nachschlage-Listen aus dem Ilaris-Regelwerk, nach
 * den Regelbuch-Kategorien gruppiert, jede Zeile mit Tooltip. Enter liest den
 * Tooltip vor. Die Zauberliste zeigt die bekannten Zauber des Charakters je
 * Tradition mit ihrem Probenwert; Enter startet die Zauberprobe.
 */
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { getDb } from '../core/db-laden.js';
import { fertigkeitProbenwert } from '../core/regeln.js';
import { talentGruppen, talentDetail } from '../editor/talente.js';
import { getAbenteuer } from './state.js';
import { kampfProbe } from './wuerfel-kern.js';
import {
  AKTIONEN, AKTION_GRUPPEN, MANOEVER, MANOEVER_GRUPPEN, ZAUBER_MODIFIKATOREN,
} from '../daten/kampf-listen.js';

// --- Aktionen -------------------------------------------------------------

export function aktionenScreen() {
  const items = [];
  items.push({
    label: 'Grundregel der Initiativephase',
    detail: 'Pro Initiativephase eine volle oder bis zu zwei einfache Aktionen. Bei zwei '
      + 'einfachen Aktionen sind alle Proben darin um 4 erschwert. Dazu beliebig viele '
      + 'verschiedene Freie Aktionen.',
    onSelect() {
      sprache.sage('Grundregel: eine volle oder zwei einfache Aktionen pro Initiativephase, '
        + 'bei zwei einfachen alle Proben um 4 erschwert, dazu beliebig viele Freie Aktionen.');
    },
  });
  for (const g of AKTION_GRUPPEN) {
    items.push({ label: g.titel, ueberschrift: true, onSelect() {} });
    for (const ak of AKTIONEN.filter(a => a.typ === g.typ)) {
      items.push({ label: ak.name, detail: ak.tooltip, onSelect: () => sprache.sage(`${ak.name}. ${ak.tooltip}`) });
    }
  }
  return menuScreen({
    title: 'Aktionen',
    subtitle: 'Was du in deiner Initiativephase tun kannst. Oben filtern, Shift und Pfeil-runter liest den Tooltip. Escape zurück.',
    items, filter: true,
  });
}

// --- Manöver --------------------------------------------------------------

export function manoeverScreen() {
  const items = [];
  for (const g of MANOEVER_GRUPPEN) {
    items.push({ label: g.titel, ueberschrift: true, onSelect() {} });
    for (const m of MANOEVER.filter(x => x.kategorie === g.kategorie)) {
      items.push({
        label: `${m.name}, ${m.mod}`,
        detail: m.tooltip,
        onSelect: () => sprache.sage(`${m.name}, ${m.mod}. ${m.tooltip}`),
      });
    }
  }
  return menuScreen({
    title: 'Manöver',
    subtitle: 'Nahkampf-Manöver, vor Attacke oder Verteidigung ansagen. Oben filtern, Shift und Pfeil-runter liest den Tooltip. Escape zurück.',
    items, filter: true,
  });
}

// --- Zauber und Rituale ---------------------------------------------------

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
  const items = [];
  let index = 0;

  for (const g of bekannteZauber(char, db)) {
    items.push({ label: `${g.uname}, Probenwert ${g.pw}`, ueberschrift: true, detail: g.udef.text || '', onSelect() {} });
    for (const z of g.zauber) {
      const name = typeof z === 'string' ? z : z.name;
      const id = `zauber-${index++}`;
      const tip = talentDetail(char, db, name, g.udef.steigerungsfaktor);
      items.push({
        label: name,
        hint: 'Enter zum Zaubern',
        detail: tip,
        ergebnisId: id,
        onSelect: () => kampfProbe({
          id, titel: `Zauber ${name}`, vokabel: g.uname, probenwert: g.pw, modListe: ZAUBER_MODIFIKATOREN,
        }),
      });
    }
  }

  return menuScreen({
    title: zauberKategorieLabel(char, db),
    subtitle: 'Enter startet die Zauberprobe: Würfelwahl, Modifikatoren, Erschwernis. Oben filtern, Shift und Pfeil-runter liest den Tooltip. Escape zurück.',
    items, filter: true, leer: 'Keine Zauber bekannt.',
  });
}

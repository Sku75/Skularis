/**
 * Skularistool — Live-Spiel-Menüs: Aktionen, Manöver und Zauber.
 *
 * Einheitliches Muster: jede Kategorie ist EINE lange, filterbare Liste. Manöver
 * und Zauber sind würfelbare Felder (Enter würfelt mit den echten Werten des
 * Charakters), Aktionen sind Nachschlage-Einträge. Tooltips zeigen zuerst die
 * Spielwerte, dann die Wirkung, unten die Herkunft.
 */
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { getDb } from '../core/db-laden.js';
import { fertigkeitProbenwert, waffenwerte, abgeleiteteWerte } from '../core/regeln.js';
import { leseInventar, SET_WAFFENLOS } from '../core/ausruestung.js';
import { talentGruppen } from '../editor/talente.js';
import { bauInfo } from '../core/infotext.js';
import { zahlDialog } from '../ui/dialog.js';
import { getAbenteuer } from './state.js';
import { kampfProbe, mitLetztemWurf } from './wuerfel-kern.js';
import { AKTIONEN, MANOEVER } from '../daten/kampf-listen.js';

const TYP_NAME = { einfach: 'einfache Aktion', voll: 'volle Aktion', frei: 'freie Aktion' };

export const GRUNDREGEL_AKTIONEN = 'Pro Initiativephase kannst du eine volle oder bis zu zwei '
  + 'einfache Aktionen ausführen. Bei zwei einfachen Aktionen sind alle Proben darin um 4 erschwert. '
  + 'Dazu kommen beliebig viele verschiedene Freie Aktionen.';

// --- Aktionen (eine filterbare Liste) ------------------------------------

export function aktionenScreen() {
  const items = AKTIONEN.map(ak => ({
    label: `${ak.name}, ${TYP_NAME[ak.typ] || ak.typ}`,
    detail: ak.tooltip,
    onSelect: () => sprache.sage(`${ak.name}. ${ak.tooltip}`),
  }));
  return menuScreen({
    title: 'Aktionen',
    subtitle: 'Filtern, Enter oder Shift und Pfeil-runter liest die Erklärung. Escape zurück.',
    items, filter: true,
  });
}

// --- Manöver (eine filterbare Liste, würfelbar) --------------------------

// Je Manöver: würfelt es Attacke oder Verteidigung, welcher feste Aufschlag gilt,
// ob die Behinderung abzuziehen ist (be) und ob ein variabler Wert X abgefragt
// werden muss (x).
const MANOEVER_PROBE = {
  'Ausweichen': { art: 'VT', modFix: -2, be: true }, 'Binden': { art: 'VT', modFix: 0, x: true },
  'Entfernung verändern': { art: 'AT', modFix: 0, be: true }, 'Entwaffnen': { art: 'AT', modFix: -4 },
  'Gezielter Schlag': { art: 'AT', modFix: -2 }, 'Umreißen': { art: 'AT', modFix: 0 },
  'Wuchtschlag': { art: 'AT', modFix: 0, x: true },
  'Auflaufen lassen': { art: 'VT', modFix: -4 }, 'Rüstungsbrecher': { art: 'AT', modFix: -4 },
  'Schildspalter': { art: 'AT', modFix: 2 }, 'Stumpfer Schlag': { art: 'AT', modFix: 0 },
  'Umklammern': { art: 'AT', modFix: 0, x: true },
  'Ausfall': { art: 'AT', modFix: -2, be: true }, 'Befreiungsschlag': { art: 'AT', modFix: -4 },
  'Doppelangriff': { art: 'AT', modFix: -4 }, 'Hammerschlag': { art: 'AT', modFix: -8 },
  'Klingentanz': { art: 'AT', modFix: -4 }, 'Niederwerfen': { art: 'AT', modFix: -4 },
  'Todesstoß': { art: 'AT', modFix: -8 }, 'Riposte': { art: 'VT', modFix: -4 },
  'Schildwall': { art: 'VT', modFix: -4 }, 'Sturmangriff': { art: 'AT', modFix: 0 },
  'Überrennen': { art: 'AT', modFix: 0 }, 'Unterlaufen': { art: 'VT', modFix: -4 },
};

/** Waffe, mit der Manöver gewürfelt werden: Haupthand des ersten echten Sets, sonst erste Waffe. */
function primaerWaffe(char, db) {
  const inv = leseInventar(char);
  const echte = (inv.waffenSets || []).filter(s => s.name !== SET_WAFFENLOS);
  const name = echte[0] && echte[0].haupthand;
  let waffe = name ? (char.waffen || []).find(x => x.name === name) : null;
  if (!waffe) waffe = (char.waffen || []).find(x => x.name);
  return waffe ? { waffe, k: waffenwerte(char, db, waffe) } : null;
}

export function manoeverScreen() {
  const a = getAbenteuer();
  const char = a.charakter;
  const db = getDb();
  const pw = primaerWaffe(char, db);
  const w = abgeleiteteWerte(char);
  let idx = 0;
  const items = MANOEVER.map((m) => {
    const info = MANOEVER_PROBE[m.name] || { art: 'AT', modFix: 0 };
    const vokabel = info.art === 'VT' ? 'Verteidigung' : 'Attacke';
    const basis = pw ? (info.art === 'VT' ? pw.k.vt : pw.k.at) : null;
    const id = `man-${idx++}`;
    const detail = `${m.mod}. ${m.tooltip}`;
    if (basis === null || basis === undefined) {
      return { label: `${m.name}, ${m.kategorie}, ${m.mod}`, detail, onSelect: () => sprache.sage(`${m.name}, ${m.mod}. ${m.tooltip}`) };
    }
    const festMod = info.modFix + (info.be ? -w.BE : 0);
    const eff = basis + festMod;
    const rech = festMod ? ` (${basis}${festMod > 0 ? ' plus ' + festMod : ' minus ' + (-festMod)})` : '';
    return {
      label: `${m.name}: ${vokabel} ${eff}${rech}`,
      hint: `${m.kategorie}. Enter würfelt${info.x ? ', fragt den Wert X ab' : ''}`,
      detail: mitLetztemWurf(id, detail),
      ergebnisId: id,
      onSelect: async () => {
        let extra = festMod;
        if (info.x) {
          const x = await zahlDialog({ titel: `${m.name}, Wert X`, label: 'Wie viel X? 0 wenn keiner', wert: 0, min: 0, max: 20 });
          if (x === null) return;
          extra = festMod - x;
        }
        kampfProbe({ id, titel: `${m.name} mit ${pw.waffe.name}`, vokabel, probenwert: basis, extraMod: extra });
      },
    };
  });
  return menuScreen({
    title: 'Manöver',
    subtitle: 'Filtern, Enter würfelt mit den echten Werten. Shift und Pfeil-runter liest die Wirkung. Escape zurück.',
    items, filter: true,
  });
}

// --- Zauber (eine filterbare Liste, würfelbar) ---------------------------

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

// Feste Wertelabels im Zaubertext. Der Text vor dem ersten Label ist die Wirkung.
// "Mächtige Magie" steht bei vielen Zaubern direkt hinter dem Wirkungssatz und
// ist ein eigener Zusatz (was mächtige Magie bewirkt), gehört also NICHT in die
// Wirkung — deshalb als eigenes Label, damit es abgeschnitten wird.
const ZAUBER_LABELS = ['Probenschwierigkeit', 'Modifikationen', 'Mächtige Magie',
  'Vorbereitungszeit', 'Ziel', 'Reichweite', 'Wirkungsdauer', 'Kosten', 'Verbreitung',
  'Merkmale', 'Voraussetzungen', 'Fertigkeiten', 'Erlernen'];

function parseZauberText(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const treffer = [];
  for (const lab of ZAUBER_LABELS) {
    const i = t.indexOf(lab + ':');
    if (i >= 0) treffer.push({ lab, i });
  }
  treffer.sort((a, b) => a.i - b.i);
  const felder = {};
  const beschreibung = treffer.length ? t.slice(0, treffer[0].i).trim() : t;
  for (let k = 0; k < treffer.length; k++) {
    const start = treffer[k].i + treffer[k].lab.length + 1;
    const ende = k + 1 < treffer.length ? treffer[k + 1].i : t.length;
    felder[treffer[k].lab] = t.slice(start, ende).trim();
  }
  return { beschreibung, felder };
}

/** Tooltip eines Zaubers: Spielwerte oben, Wirkung, dann Herkunft unten. */
function zauberTooltip(def, pw, felder, beschreibung) {
  const abschnitte = [[def.name, `Zauber, Probenwert ${pw}.`]];
  // Beschreibung/Wirkung steht bewusst oben, direkt nach dem Namen.
  if (beschreibung) abschnitte.push(['Wirkung', beschreibung]);
  const werte = [
    ['Probe', felder['Probenschwierigkeit']],
    ['Kosten', felder['Kosten']],
    ['Reichweite', felder['Reichweite']],
    ['Wirkungsdauer', felder['Wirkungsdauer']],
    ['Ziel', felder['Ziel']],
    ['Vorbereitungszeit', felder['Vorbereitungszeit']],
  ];
  for (const [titel, wert] of werte) if (wert) abschnitte.push([titel, wert]);
  if (felder['Mächtige Magie']) abschnitte.push(['Mächtige Magie', felder['Mächtige Magie']]);
  if (felder['Modifikationen']) abschnitte.push(['Modifikationen', felder['Modifikationen']]);
  const herkunft = [];
  if (felder['Fertigkeiten']) herkunft.push(`Fertigkeiten: ${felder['Fertigkeiten']}.`);
  if (felder['Erlernen']) herkunft.push(`Erlernen: ${felder['Erlernen']}.`);
  if (def.referenzseite) herkunft.push(`Ilaris, Seite ${def.referenzseite}.`);
  if (herkunft.length) abschnitte.push(['Herkunft', ...herkunft]);
  return bauInfo(abschnitte);
}

export function zauberScreen() {
  const a = getAbenteuer();
  const char = a.charakter;
  const db = getDb();

  // Alle bekannten Zauber in EINE Liste, nach Name; ein Zauber unter mehreren
  // Fertigkeiten zählt einmal mit dem höchsten Probenwert.
  const proZauber = new Map();
  for (const g of bekannteZauber(char, db)) {
    for (const z of g.zauber) {
      const name = typeof z === 'string' ? z : z.name;
      const vor = proZauber.get(name);
      if (!vor || g.pw > vor.pw) proZauber.set(name, { name, pw: g.pw, fertigkeit: g.uname });
    }
  }
  const liste = [...proZauber.values()].sort((x, y) => x.name.localeCompare(y.name, 'de'));

  let idx = 0;
  const items = liste.map((s) => {
    const id = `zauber-${idx++}`;
    const def = db.talentByName[s.name] || { name: s.name };
    const { beschreibung, felder } = parseZauberText(def.text);
    const schwierRaw = (felder['Probenschwierigkeit'] || '').trim();
    const m = schwierRaw.match(/^(\d+)/);
    const schwierNum = m ? parseInt(m[1], 10) : null;
    const zusatz = [];
    if (schwierNum === null && schwierRaw) zusatz.push(`Vergleichende Probe gegen ${schwierRaw}.`);
    if (felder['Kosten']) zusatz.push(`Kosten ${felder['Kosten']}.`);
    return {
      label: s.name,
      hint: `${s.fertigkeit}, Probenwert ${s.pw}. Enter zum Zaubern`,
      detail: mitLetztemWurf(id, zauberTooltip(def, s.pw, felder, beschreibung)),
      ergebnisId: id,
      onSelect: () => kampfProbe({
        id, titel: `Zauber ${s.name}`, vokabel: s.fertigkeit, probenwert: s.pw,
        schwierigkeit: schwierNum, zusatz: zusatz.join(' '),
      }),
    };
  });

  return menuScreen({
    title: zauberKategorieLabel(char, db),
    subtitle: 'Filtern, Enter würfelt die Zauberprobe. Shift und Pfeil-runter liest die Werte. Escape zurück.',
    items, filter: true, leer: 'Keine Zauber bekannt.',
  });
}

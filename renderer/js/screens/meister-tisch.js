/**
 * Skularis — Meister-Tisch (dritter Hauptbereich).
 *
 * Erster Punkt ist das Regelnachschlagewerk: alle Regeln alphabetisch, mit
 * Filter. Hinter jedem Regelnamen steht, welche der geladenen Helden sie haben
 * — der Spielleiter sieht so auf einen Blick, wer am Tisch was kann.
 *
 * Als geladene Helden gelten die Charaktere aus "Meine Charaktere". Sie werden
 * beim Öffnen einmal eingelesen; wer nicht dabei sein soll, kann die Datei aus
 * dem Ordner nehmen. Eine eigene Auswahl der Runde kommt später.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { ladeDb } from '../core/db-laden.js';
import { parse } from '../core/sephrasto-xml.js';
import { regelnScreen } from './regeln.js';

const ipc = window.skularis?.ipc;

let _helden = null;

/** Alle gespeicherten Charaktere einlesen. Ergebnis wird gemerkt. */
async function ladeHelden(db) {
  if (_helden) return _helden;
  _helden = [];
  let liste = [];
  try { liste = await ipc.bibliothekListe(); } catch { liste = []; }
  for (const eintrag of liste) {
    try {
      const res = await ipc.dateiDirektLaden(eintrag.pfad);
      const c = parse(res.inhalt, db);
      _helden.push({ name: c.name || eintrag.name, charakter: c });
    } catch (e) {
      console.error('Held konnte nicht gelesen werden:', eintrag.name, e);
    }
  }
  return _helden;
}

export async function oeffne() {
  const db = await ladeDb();
  screen.push(await einstiegScreen(db));
}

async function einstiegScreen(db) {
  const helden = await ladeHelden(db);
  const wer = helden.length
    ? `${helden.length} Helden geladen: ${helden.map(h => h.name).join(', ')}`
    : 'Noch keine Helden gespeichert';

  /** Noch nicht gebaute Bereiche als Platzhalter, damit der Aufbau schon steht. */
  const platzhalter = (label, hint, was) => ({
    label, hint,
    detail: `${label}. ${was} Dieser Bereich ist noch ein Platzhalter.`,
    onSelect: () => sprache.sage(`${label}. Dieser Bereich ist noch ein Platzhalter.`),
  });

  return menuScreen({
    title: 'Meister-Tisch',
    subtitle: 'Escape kehrt zum Hauptmenü zurück.',
    filter: false,
    items: [
      {
        label: 'Helden der Runde',
        hint: wer,
        detail: 'Die Helden kommen aus Meine Charaktere und werden beim Öffnen des Meister-Tischs '
          + 'eingelesen. Eine gezielte Auswahl für eine bestimmte Runde kommt später.',
        onSelect: () => screen.push(heldenScreen(db, helden)),
      },
      {
        label: 'Helden neu einlesen',
        hint: 'Nach Änderungen an den Charakterdateien',
        onSelect: async () => {
          _helden = null;
          const neu = await ladeHelden(db);
          screen.replace(await einstiegScreen(db));
          sprache.sage(`${neu.length} Helden eingelesen.`);
        },
      },
      platzhalter('Abenteuer vorbereiten', 'Szenen, Begegnungen, Notizen',
        'Hier entsteht die Vorbereitung eines Spielabends.'),
      platzhalter('Abenteuer leiten', 'Laufendes Abenteuer führen',
        'Hier führt der Spielleiter das Abenteuer, mit Zugriff auf alle Helden.'),
      platzhalter('Gegner und Kreaturen', 'Werte für Nichtspielercharaktere',
        'Hier entsteht die Verwaltung von Gegnern mit ihren Kampfwerten.'),
      platzhalter('Proben stellen', 'Schwierigkeit wählen, Helden vergleichen',
        'Hier wird eine Probe für alle Helden auf einmal gestellt.'),
      platzhalter('Beute und Belohnung', 'Abenteuerpunkte und Fundstücke verteilen',
        'Hier werden Abenteuerpunkte und Beute an die Helden verteilt.'),
      {
        label: 'Regelnachschlagewerk',
        hint: 'Alle Regeln alphabetisch, mit Hinweis, welcher Held sie hat',
        detail: 'Die Liste nennt hinter jeder Regel, welche der geladenen Helden sie haben. '
          + 'Eingabetaste öffnet eine Regel zum Durchlesen, Shift und Pfeil-runter liest sie am Stück.',
        onSelect: () => screen.push(regelnScreen({ db, helden, titel: 'Regelnachschlagewerk' })),
      },
    ],
  });
}

/** Übersicht der geladenen Helden mit ihren wichtigsten Werten. */
function heldenScreen(db, helden) {
  const items = helden.map(h => {
    const c = h.charakter;
    return {
      label: `${h.name}, ${c.spezies || 'ohne Spezies'}`,
      hint: `${c.erfahrung?.gesamt || 0} EP gesamt`,
      detail: `${h.name}. Spezies ${c.spezies || 'keine'}, Heimat ${c.heimat || 'keine'}, `
        + `Kultur ${c.kultur || 'keine'}, Profession ${c.profession || 'keine'}. `
        + `${c.erfahrung?.gesamt || 0} Erfahrungspunkte gesamt, ${c.erfahrung?.ausgegeben || 0} ausgegeben. `
        + `${(c.vorteile || []).length} Vorteile, ${(c.talente || []).length} Talente.`,
      onSelect: () => {},
    };
  });
  return menuScreen({
    title: `Helden der Runde, ${helden.length}`,
    subtitle: 'Shift und Pfeil-runter liest die Werte. Escape zurück.',
    items,
    leer: 'Noch keine Charaktere gespeichert.',
  });
}

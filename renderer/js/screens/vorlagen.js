/**
 * Skularis — Charaktererstellung aus Vorlage.
 *
 * Ebenen:
 *   Stufe wählen        Unerfahren 2000, Erprobt 2500, Erfahren 3000
 *   Held wählen         die Beispielhelden dieser Stufe, Steckbrief per
 *                       Shift und Pfeil-runter
 *   Held-Untermenü      auswählen, Charakterbogen betrachten
 *   Mini-Assistent      Name, Aussehen, Hintergrund, dann speichern
 *
 * Der Charakterbogen ist derselbe wie am Spieltisch (baueCharakterbogen), und
 * der Mini-Assistent nutzt dieselben Seiten wie der große Assistent. So bleibt
 * die Bedienung überall gleich.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { ladeDb } from '../core/db-laden.js';
import { parse } from '../core/sephrasto-xml.js';
import { STUFEN, stufeFuer, steckbrief, steckbriefText, kurzzeile } from '../core/vorlagen.js';
import { baueCharakterbogen } from '../abenteuer/charakterbogen.js';
import * as editor from '../editor/editor.js';

const ipc = window.skularis?.ipc;

let _db = null;
let _vorlagen = null; // [{ name, pfad, char }]

/** Alle Beispielhelden laden: Profession-Pakete mit Gesamt-EP über 1500. */
async function ladeVorlagen() {
  if (_vorlagen) return _vorlagen;
  _db = await ladeDb();
  _vorlagen = [];
  let liste = [];
  try { liste = await ipc.paketeListe('Profession'); } catch { liste = []; }
  for (const p of liste) {
    try {
      const res = await ipc.paketLaden(p.pfad);
      const char = parse(res.inhalt, _db);
      if ((char.erfahrung?.gesamt || 0) >= 1500) {
        _vorlagen.push({ name: char.name || p.name, pfad: p.pfad, char });
      }
    } catch (e) {
      console.error('Vorlage nicht lesbar:', p.name, e);
    }
  }
  _vorlagen.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return _vorlagen;
}

export async function oeffneVorlagen() {
  await ladeVorlagen();
  screen.push(stufenScreen());
}

// --- Stufe wählen --------------------------------------------------------

function stufenScreen() {
  const items = STUFEN.map((s) => {
    const helden = _vorlagen.filter(v => stufeFuer(v.char.erfahrung.gesamt).ep === s.ep);
    return {
      label: `${s.name}, ${s.ep} Erfahrungspunkte`,
      hint: `${helden.length} Vorlagen. ${s.hint}`,
      detail: `${s.name}. ${s.hint}. ${helden.length} Helden auf dieser Stufe: `
        + `${helden.map(h => h.name).join(', ')}.`,
      onSelect: () => screen.push(heldenScreen(s)),
    };
  });
  return menuScreen({
    title: 'Charakter aus Vorlage',
    subtitle: 'Wähle eine Erfahrungsstufe. Escape zurück.',
    filter: false,
    items,
  });
}

// --- Held wählen ---------------------------------------------------------

function heldenScreen(stufe) {
  const helden = _vorlagen.filter(v => stufeFuer(v.char.erfahrung.gesamt).ep === stufe.ep);
  const items = helden.map(v => ({
    label: kurzzeile(v.char),
    hint: `${v.char.spezies || ''}`.trim() || 'öffnen',
    detail: steckbrief(v.char, _db),
    onSelect: () => screen.push(heldScreen(v)),
  }));
  return menuScreen({
    title: `${stufe.name}, ${stufe.ep} Erfahrungspunkte`,
    subtitle: 'Shift und Pfeil-runter liest den Steckbrief. Eingabetaste öffnet den Helden. Escape zurück.',
    items,
    filter: helden.length >= 10,
    leer: 'Keine Vorlagen auf dieser Stufe.',
  });
}

// --- Ein Held: Untermenü -------------------------------------------------

function heldScreen(vorlage) {
  return menuScreen({
    title: vorlage.name,
    subtitle: 'Shift und Pfeil-runter liest den Steckbrief. Escape zurück.',
    filter: false,
    items: [
      {
        label: 'auswählen',
        hint: 'Diesen Helden zu einem eigenen Charakter machen',
        detail: 'Öffnet einen kurzen Assistenten: du gibst einen eigenen Namen und, wenn du '
          + 'magst, Aussehen und Hintergrund an. Danach wird der neue Held gespeichert und im '
          + 'Editor geöffnet, wo du alles weiter anpassen kannst.',
        onSelect: () => vorlageWaehlen(vorlage),
      },
      {
        label: 'Charakterbogen betrachten',
        hint: 'Alle Werte ansehen, wie am Spieltisch',
        detail: 'Zeigt den vollständigen Charakterbogen zum Durchlesen. Genau dieselbe Ansicht '
          + 'wie später am Spieltisch. Nichts wird dabei verändert.',
        onSelect: () => screen.push(baueCharakterbogen(vorlage.char, _db, `Bogen: ${vorlage.name}`)),
      },
      {
        // Der Steckbrief noch einmal als eigener Punkt, für Strg und I.
        label: 'Steckbrief vorlesen',
        hint: 'Stärken, Schwächen, Ausrüstung',
        detail: steckbrief(vorlage.char, _db),
        onSelect: () => sprache.sage(steckbriefText(vorlage.char, _db)),
      },
    ],
  });
}

// --- Vorlage übernehmen: Mini-Assistent ----------------------------------

async function vorlageWaehlen(vorlage) {
  // Eine frische Kopie der Vorlage parsen, damit die zwischengespeicherte
  // Vorschau unberührt bleibt.
  const res = await ipc.paketLaden(vorlage.pfad);
  const neu = parse(res.inhalt, _db);
  // Acht der generischen Vorlagen tragen kein Name-Feld; dort ist der
  // Vorlagenname die Identität. Damit das Namensfeld nicht leer startet, wird
  // er als Vorbelegung übernommen.
  if (!neu.name) neu.name = vorlage.name;
  await editor.uebernimmCharakter(neu);

  const m = await import('../editor/vorlage-assistent.js');
  m.starteVorlageAssistent(vorlage.name);
}

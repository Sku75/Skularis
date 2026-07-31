/**
 * Skularistool — Charakter-Datenmodell (Sephrasto-kompatibel)
 * Reine Datenstruktur + Fabrik + Neuberechnung. Die EP-/Werte-Logik liegt
 * in regeln.js; das Lesen/Schreiben der .xml in sephrasto-xml.js.
 */

import { gesamtEP, abgeleiteteWerte } from './regeln.js';
import { pruefe } from './voraussetzungen.js';
import { werteVorteilSkripte } from './skripte.js';

export const ATTRIBUTE = ['KO', 'MU', 'GE', 'KK', 'IN', 'KL', 'CH', 'FF'];

/**
 * Die Beschreibungsfelder, genau wie Sephrasto sie führt und wie sie auf dem
 * Charakterbogen stehen. Namen und Anzahl sind bewusst nicht erfunden, sondern
 * eins zu eins übernommen (Sephrasto: UI/CharakterBeschreibungDetails).
 *
 * Sephrasto zeigt: neun beschriftete Einzelfelder, darunter die Überschrift
 * "Aussehen" mit sechs freien Zeilen, darunter "Familie/Hintergrund/Herkunft"
 * mit neun freien Zeilen. Kultur und Profession setzt in Skularis der Assistent.
 *
 * ziel: das Element in Sephrastos <BeschreibungDetails>.
 * altXml: das Element, das Skularis 0.05 zwischenzeitlich benutzt hat. Wird nur
 *   noch gelesen, damit früher gespeicherte Dateien nichts verlieren.
 */
export const BESCHREIBUNG_FELDER = [
  { key: 'geschlecht', label: 'Geschlecht', ziel: 'Geschlecht' },
  { key: 'geburtsdatum', label: 'Geburtsdatum', ziel: 'Geburtsdatum', altXml: 'Alter', hint: 'auch ein Alter ist möglich, zum Beispiel 27 Jahre' },
  { key: 'groesse', label: 'Größe', ziel: 'Grösse', altXml: 'Körpergröße', hint: 'zum Beispiel 1,72 Schritt' },
  { key: 'gewicht', label: 'Gewicht', ziel: 'Gewicht', altXml: 'Gewicht', hint: 'zum Beispiel 68 Stein' },
  { key: 'haarfarbe', label: 'Haarfarbe', ziel: 'Haarfarbe', altXml: 'Haarfarbe' },
  { key: 'augenfarbe', label: 'Augenfarbe', ziel: 'Augenfarbe', altXml: 'Augenfarbe' },
  { key: 'titel', label: 'Titel', ziel: 'Titel', hint: 'zum Beispiel Junkerin von Wehrheim, Magistra, Bruder' },
];

/**
 * Die sechs freien Aussehen-Zeilen. In Sephrasto stehen sie ohne eigene
 * Beschriftung unter der Überschrift Aussehen; die Beispiele hier sind nur
 * Vorschläge für die Ansage und stehen nicht in der Datei.
 */
export const AUSSEHEN_ZEILEN = [
  'zum Beispiel Frisur und Bart',
  'zum Beispiel Narben, Tätowierungen, Schmuck',
  'zum Beispiel Statur und Haltung',
  'zum Beispiel Stimme und Sprechweise',
  'zum Beispiel Kleidung',
  'frei für alles Weitere',
];

/** Die neun freien Zeilen für Familie, Hintergrund und Herkunft. */
export const HINTERGRUND_ZEILEN = [
  'zum Beispiel Eltern und Geschwister',
  'zum Beispiel Geburtsort und Aufwachsen',
  'zum Beispiel Ausbildung und Lehrmeister',
  'zum Beispiel Beruf und Auskommen',
  'zum Beispiel Glaube und Ideale',
  'zum Beispiel Freunde und Verbündete',
  'zum Beispiel Feinde und offene Rechnungen',
  'zum Beispiel Ziele und Wünsche',
  'frei für alles Weitere',
];

export function leereZeilen(anzahl) {
  return Array.from({ length: anzahl }, () => '');
}

/** Buchstabe einer Eigenheit nach ihrer Position: A, B, C ... */
export function eigenheitBuchstabe(i) {
  return String.fromCharCode(65 + (i % 26));
}

/**
 * Neuen, leeren Charakter erzeugen. Initialisiert alle profanen Fertigkeiten
 * auf 0 (wie Sephrasto) und die Energien AsP/KaP.
 */
export function createCharakter(db, opts = {}) {
  const c = {
    // Beschreibung
    name: opts.name || '',
    spezies: '',
    kultur: '',            // Sephrasto: BeschreibungDetails/Kultur
    profession: '',        // Sephrasto: BeschreibungDetails/Profession
    heimat: 'Mittelreich',
    finanzen: 2,           // 0 Sehr Reich .. 2 Normal .. 4 Sehr Arm
    startkapital: 32,      // Dukaten der Finanz-Stufe "Normal"; steuert die Münzbörse
    geldboerse: { dukaten: 32, silber: 0, kupfer: 0 }, // Bargeld, anfangs = Startkapital
    status: 2,
    kurzbeschreibung: '',
    schipBonus: 0,         // durch Vorteile (Glück) modifiziert

    // Beschreibung, genau wie Sephrasto sie führt. Kostet keine EP.
    ...Object.fromEntries(BESCHREIBUNG_FELDER.map(f => [f.key, ''])),
    aussehen: leereZeilen(AUSSEHEN_ZEILEN.length),        // sechs freie Zeilen
    hintergrund: leereZeilen(HINTERGRUND_ZEILEN.length),  // neun freie Zeilen
    // Eigenheiten: { name, positiv, negativ } — Ilaris-Kern des Hintergrunds
    eigenheiten: [],

    // Werte
    attribute: Object.fromEntries(ATTRIBUTE.map(a => [a, 0])),
    vorteile: [],          // string | { name, kosten, kommentar }
    fertigkeiten: {},      // name -> { wert }
    uebernatuerlich: {},   // name -> { wert }
    // Talente führt der Charakter in einer einzigen Liste, wie Sephrasto.
    // Ein Talent gehört oft zu mehreren Fertigkeiten (474 von 938 Talenten,
    // etwa "Apport des Stabs" zu Stabzauber und Umwelt) und erscheint dann
    // unter jeder davon — aber nur einmal im Charakter und einmal bezahlt.
    talente: [],           // Talentnamen in Dateireihenfolge
    // Talente mit variablen Kosten (z. B. Adlerschwinge Wolfsgestalt): der
    // Preis steht am Charakter, nicht in der Datenbank. Ebenso der Kommentar,
    // in dem etwa die gewählten Tiere stehen.
    talentKosten: {},      // Talentname -> EP
    talentKommentar: {},   // Talentname -> Text
    // Talente, die ein Vorteil per Skript schenkt (Tiergeist-Vorteile), mit
    // dem Preis, den das Skript vorgibt — in aller Regel 0.
    geschenkteTalente: {}, // Talentname -> EP
    // Aufschläge auf abgeleitete Werte aus den Vorteil-Skripten
    wertMods: {},          // WS, MR, GS, SB, INI, DH, RS, BE, SchiP
    energien: { AsP: { gekauft: 0 }, KaP: { gekauft: 0 } },
    freieFertigkeiten: [], // { name, wert, kategorie }

    // Objekte
    waffen: [],
    ruestungen: [],
    ausruestung: [],

    // Erfahrung
    erfahrung: { gesamt: opts.gesamtEP || 0, ausgegeben: 0 },

    // Sephrasto-Einstellung: Voraussetzungen durchsetzen. Steht in der
    // Charakterdatei unter Einstellungen/VoraussetzungenPrüfen. Aus heißt:
    // Hausregel-Betrieb, dann bleibt alles wählbar.
    voraussetzungenPruefen: true,

    // Datei
    dateiname: opts.dateiname || null,
  };

  if (db) {
    for (const f of db.fertigkeiten) c.fertigkeiten[f.name] = { wert: 0 };
  }
  return c;
}

// --- Talente: eine Liste, viele Fertigkeiten ------------------------------

/** Talente des Charakters, die zu dieser Fertigkeit gehören. */
export function talenteFuer(c, db, fname) {
  return (c.talente || []).filter(n => (db.talentByName[n]?.fertigkeiten || []).includes(fname));
}

export function hatTalent(c, name) {
  return (c.talente || []).includes(name);
}

export function setzeTalent(c, name) {
  c.talente = c.talente || [];
  if (!c.talente.includes(name)) c.talente.push(name);
}

export function entferneTalent(c, name) {
  c.talente = (c.talente || []).filter(n => n !== name);
}

/** Ausgegebene EP neu berechnen und im Charakter ablegen. Gibt die Aufschlüsselung zurück. */
export function neuberechne(c, db) {
  synchronisiere(c, db);
  const b = gesamtEP(c, db);
  c.erfahrung.ausgegeben = b.total;
  return b;
}

/**
 * Den Charakter mit seinen Vorteilen in Einklang bringen — Sephrastos
 * checkVoraussetzungen. Erst die Skripte auswerten, dann die übernatürlichen
 * Fertigkeiten führen, dann die geschenkten Talente.
 */
export function synchronisiere(c, db) {
  aktualisiereVorteilEffekte(c, db);
  const fert = synchronisiereUebernatuerlich(c, db);
  const tal = synchronisiereGeschenkteTalente(c, db);
  return { ...fert, talenteNeu: tal.neu, talenteEntfernt: tal.entfernt };
}

/**
 * Talente, die ein Vorteil per Skript schenkt, eintragen und wieder entfernen,
 * wenn der Vorteil weg ist. Sephrasto macht das über addTalent im Vorteilsskript;
 * die Talente stehen danach ganz normal in der Charakterdatei.
 */
function synchronisiereGeschenkteTalente(c, db) {
  const neu = [];
  const entfernt = [];
  const jetzt = Object.keys(c.geschenkteTalente || {});
  const vorher = c._geschenktZuletzt || [];

  for (const name of jetzt) {
    if (!db.talentByName[name]) continue; // Hausregel-Datenbank ohne dieses Talent
    if (!hatTalent(c, name)) { setzeTalent(c, name); neu.push(name); }
  }
  // Nur zurücknehmen, was zuvor geschenkt war und jetzt nicht mehr geschenkt ist.
  for (const name of vorher) {
    if (jetzt.includes(name)) continue;
    if (hatTalent(c, name)) { entferneTalent(c, name); entfernt.push(name); }
  }
  c._geschenktZuletzt = jetzt;
  return { neu, entfernt };
}

/**
 * Übernatürliche Fertigkeiten führen, wie Sephrasto es tut
 * (Charakter.py, checkVoraussetzungen): Fertigkeiten, deren Voraussetzungen
 * erfüllt sind, werden von selbst angelegt; fallen die Voraussetzungen weg,
 * verschwinden sie wieder — aber nur, solange kein Talent mehr daran hängt und
 * kein Wert gesteigert wurde. Dadurch gibt es keine Auswahl "übernatürliche
 * Fertigkeit hinzufügen" mehr: die Tradition entscheidet.
 *
 * @returns {{ neu: string[], entfernt: string[] }}
 */
export function synchronisiereUebernatuerlich(c, db) {
  const neu = [];
  const entfernt = [];
  if (!db || !db.uebernat) return { neu, entfernt };
  c.uebernatuerlich = c.uebernatuerlich || {};

  // Ist die Prüfung abgeschaltet (Hausregeln), bleibt alles wie es ist.
  if (c.voraussetzungenPruefen === false) return { neu, entfernt };

  for (const u of db.uebernat) {
    const erlaubt = pruefe(c, db, u.voraussetzungen);
    const vorhanden = Object.prototype.hasOwnProperty.call(c.uebernatuerlich, u.name);
    if (erlaubt && !vorhanden) {
      c.uebernatuerlich[u.name] = { wert: 0 };
      neu.push(u.name);
    } else if (!erlaubt && vorhanden) {
      // Nichts wegwerfen, woran noch etwas hängt.
      const e = c.uebernatuerlich[u.name];
      if (talenteFuer(c, db, u.name).length === 0 && !(e.wert > 0)) {
        delete c.uebernatuerlich[u.name];
        entfernt.push(u.name);
      }
    }
  }
  return { neu, entfernt };
}

/**
 * Was verliert der Charakter, wenn dieser Vorteil wegfällt? Liefert die
 * Vorteile, Talente und übernatürlichen Fertigkeiten, deren Voraussetzungen
 * dann nicht mehr erfüllt wären (Sephrasto: findUnerfüllteVoraussetzungen).
 */
export function findeVerlorenes(c, db, ohneVorteil) {
  const probe = {
    ...c,
    vorteile: (c.vorteile || []).filter(v => (typeof v === 'string' ? v : v.name) !== ohneVorteil),
  };

  const vorteile = [];
  for (const eintrag of probe.vorteile) {
    const name = typeof eintrag === 'string' ? eintrag : eintrag.name;
    const def = db.vorteilByName[name];
    if (def && !pruefe(probe, db, def.voraussetzungen)) vorteile.push(name);
  }

  const talente = [];
  for (const tname of c.talente || []) {
    const def = db.talentByName[tname];
    if (def && !pruefe(probe, db, def.voraussetzungen)) talente.push(tname);
  }

  const fertigkeiten = [];
  for (const fname of Object.keys(c.uebernatuerlich || {})) {
    const def = db.uebernatByName[fname];
    if (def && !pruefe(probe, db, def.voraussetzungen)) fertigkeiten.push(fname);
  }
  return { vorteile, talente, fertigkeiten };
}

export function verfuegbareEP(c) {
  return (c.erfahrung.gesamt || 0) - (c.erfahrung.ausgegeben || 0);
}

export function werte(c) {
  return abgeleiteteWerte(c);
}

/**
 * Wertet die Skripte der gewählten Vorteile aus und legt die Ergebnisse am
 * Charakter ab: Aufschläge auf die abgeleiteten Werte, Grundwerte und
 * Aufschläge der Energien sowie die Talente, die ein Vorteil verschenkt.
 *
 * Bis 0.05 wurden nur fünf der Aufrufe erkannt; die übrigen dreizehn Vorteile
 * mit modifyMR, modifyGS, modifyBE, modifyDH, modifyWS, modifyINI und
 * modifyAsPMod wirkten gar nicht. Die Auswertung steckt jetzt in core/skripte.js.
 */
export function aktualisiereVorteilEffekte(c, db) {
  const { mods, talente, kampfstile } = werteVorteilSkripte(c, db);

  c.wertMods = {};
  for (const ziel of ['WS', 'MR', 'GS', 'SB', 'INI', 'DH', 'RS', 'BE', 'SchiP']) {
    c.wertMods[ziel] = mods[ziel] || 0;
  }

  c.energien = c.energien || {};
  for (const [name, basisSchluessel, modSchluessel] of [
    ['AsP', 'AsPBasis', 'AsPMod'], ['KaP', 'KaPBasis', 'KaPMod'], ['GuP', 'GuPBasis', 'GuPMod'],
  ]) {
    const basis = mods[basisSchluessel] || 0;
    const mod = mods[modSchluessel] || 0;
    if ((basis || mod) && !c.energien[name]) c.energien[name] = { gekauft: 0 };
    if (c.energien[name]) { c.energien[name].basis = basis; c.energien[name].mod = mod; }
  }

  c.geschenkteTalente = {};
  for (const t of talente) c.geschenkteTalente[t.name] = t.kosten;

  // Kampfstil-Aufschläge, wirken nur auf Waffen mit genau diesem Stil.
  c.kampfstilMods = kampfstile;

  // Ältere Felder, die anderswo noch gelesen werden.
  c.schipBonus = c.wertMods.SchiP;
  c.rsMod = c.wertMods.RS;
}

/**
 * Skularis — Assistierte Charaktererstellung (geführte Erstellung)
 *
 * Zehn Seiten, alle nach demselben Muster (siehe assistent-seite.js):
 *   Spezies, Kultur, Profession, Aussehen, Status, Finanzen,
 *   Eigenheiten, Attribute, Vorteile, Abschluss.
 *
 * Idempotent: Die Paket-Auswahlen (Spezies/Kultur/Profession) werden gemerkt
 * und der Charakter wird aus Basis (Name + Start-EP) plus allen gemerkten
 * Paketen neu berechnet. So verdoppelt sich nichts, auch wenn man zurückgeht
 * und neu wählt.
 *
 * Damit dabei nichts von Hand Eingetragenes verloren geht, merkt sich der
 * Assistent nach jedem Paket-Merge den reinen Paket-Stand (letzteBasis). Beim
 * Neuaufbau wird die Differenz zwischen dem aktuellen Charakter und diesem
 * Stand — also alles, was der Nutzer selbst gemacht hat — wieder aufgesetzt.
 */
import * as editor from './editor.js';
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { parse } from '../core/sephrasto-xml.js';
import { mergePaket } from '../core/paket.js';
import {
  createCharakter, BESCHREIBUNG_FELDER, AUSSEHEN_ZEILEN, HINTERGRUND_ZEILEN, leereZeilen,
} from '../core/character.js';
import { gesamtEP } from '../core/regeln.js';
import { assistentSeite, listenSchalter } from './assistent-seite.js';
import { aussehenInhalt } from './aussehen.js';
import { statusInhalt, finanzenInhalt, STATUS_STANDARD, FINANZEN_STANDARD } from './status-finanzen.js';
import { eigenheitenInhalt } from './eigenheiten.js';
import { attributeInhalt } from './attribute.js';
import { vorteileInhalt } from './vorteile.js';
import * as texte from './texte.js';

const ipc = window.skularis?.ipc;

const SCHRITTE = ['Spezies', 'Kultur', 'Profession', 'Aussehen', 'Status', 'Finanzen',
  'Eigenheiten', 'Attribute', 'Vorteile', 'Abschluss'];

let startName = '';
let startEP = 0;
let wahl = {};
let letzteBasis = null;
let index = 0;
const paketCache = {};

// --- Pakete ---------------------------------------------------------------

async function ladePaket(pfad) {
  if (paketCache[pfad]) return paketCache[pfad];
  const res = await ipc.paketLaden(pfad);
  const p = parse(res.inhalt, editor.getDb());
  paketCache[pfad] = p;
  return p;
}

function fasseZusammen(paket) {
  const db = editor.getDb();
  const t = [];
  const a = Object.entries(paket.attribute || {}).filter(([, v]) => v)
    .map(([k, v]) => `${k} ${v > 0 ? 'plus ' : ''}${v}`);
  if (a.length) t.push('Attribute: ' + a.join(', '));
  const v = (paket.vorteile || []).map(x => (typeof x === 'string' ? x : x.name));
  if (v.length) t.push('Vorteile: ' + v.join(', '));
  const f = Object.entries(paket.fertigkeiten || {}).filter(([, fe]) => fe.wert > 0)
    .map(([n, fe]) => `${n} ${fe.wert}`);
  if (f.length) t.push('Fertigkeiten: ' + f.join(', '));
  if ((paket.talente || []).length) t.push('Talente: ' + paket.talente.join(', '));
  t.push(`Kostet ${gesamtEP(paket, db).total} EP`);
  return t.join('. ');
}

// --- Neuaufbau ohne Datenverlust -----------------------------------------

function vName(v) { return typeof v === 'string' ? v : v.name; }

/** Vergleichsstand: nur die Felder, die Pakete überhaupt anfassen. */
function basisKopie(c) {
  return {
    attribute: { ...c.attribute },
    vorteile: (c.vorteile || []).map(vName),
    fertigkeiten: Object.fromEntries(Object.entries(c.fertigkeiten || {}).map(
      ([n, fe]) => [n, { wert: fe.wert || 0 }])),
    uebernatuerlich: Object.fromEntries(Object.entries(c.uebernatuerlich || {}).map(
      ([n, ue]) => [n, { wert: ue.wert || 0 }])),
    talente: [...(c.talente || [])],
    freieFertigkeiten: (c.freieFertigkeiten || []).map(f => f.name),
  };
}

/**
 * Alles, was der Nutzer über den alten Paket-Stand hinaus gemacht hat, auf den
 * neuen Paket-Stand aufsetzen.
 */
function uebertrageEigenes(alt, altBasis, neu) {
  // Reine Beschreibungsfelder: hier ist immer der Nutzer die Quelle.
  neu.status = alt.status;
  neu.finanzen = alt.finanzen;
  neu.kurzbeschreibung = alt.kurzbeschreibung;
  for (const feld of BESCHREIBUNG_FELDER) neu[feld.key] = alt[feld.key] || '';
  neu.aussehen = Array.isArray(alt.aussehen) ? alt.aussehen.slice() : leereZeilen(AUSSEHEN_ZEILEN.length);
  neu.hintergrund = Array.isArray(alt.hintergrund) ? alt.hintergrund.slice() : leereZeilen(HINTERGRUND_ZEILEN.length);
  neu.eigenheiten = alt.eigenheiten || [];
  neu.waffen = alt.waffen || [];
  neu.ruestungen = alt.ruestungen || [];
  neu.ausruestung = alt.ausruestung || [];

  // Attribute: die von Hand gesetzte Differenz erhalten.
  for (const [k, v] of Object.entries(alt.attribute || {})) {
    const delta = (v || 0) - (altBasis.attribute[k] || 0);
    if (delta) neu.attribute[k] = Math.max(0, (neu.attribute[k] || 0) + delta);
  }

  // Vorteile: alles, was nicht aus den alten Paketen kam.
  const ausAltenPaketen = new Set(altBasis.vorteile);
  const schonDa = new Set((neu.vorteile || []).map(vName));
  for (const eintrag of alt.vorteile || []) {
    const n = vName(eintrag);
    if (ausAltenPaketen.has(n) || schonDa.has(n)) continue;
    neu.vorteile.push(eintrag);
    schonDa.add(n);
  }

  // Fertigkeiten und übernatürliche Fertigkeiten: die von Hand gesetzte
  // Wert-Differenz erhalten.
  for (const feld of ['fertigkeiten', 'uebernatuerlich']) {
    for (const [n, eintrag] of Object.entries(alt[feld] || {})) {
      const basis = altBasis[feld][n] || { wert: 0 };
      const delta = (eintrag.wert || 0) - (basis.wert || 0);
      if (!delta) continue;
      if (!neu[feld][n]) neu[feld][n] = { wert: 0 };
      neu[feld][n].wert = Math.max(0, (neu[feld][n].wert || 0) + delta);
    }
  }

  // Talente: alles, was nicht aus den alten Paketen kam, wieder aufsetzen.
  const ausAltenPaketenTal = new Set(altBasis.talente || []);
  neu.talente = neu.talente || [];
  for (const t of alt.talente || []) {
    if (ausAltenPaketenTal.has(t) || neu.talente.includes(t)) continue;
    neu.talente.push(t);
  }

  // Preise und Kommentare von Talenten mit variablen Kosten: was schon aus den
  // neuen Paketen kommt, bleibt; alles selbst Gesetzte wird ergänzt.
  for (const [name, kosten] of Object.entries(alt.talentKosten || {})) {
    if (!(name in neu.talentKosten)) neu.talentKosten[name] = kosten;
  }
  for (const [name, text] of Object.entries(alt.talentKommentar || {})) {
    if (!(name in neu.talentKommentar)) neu.talentKommentar[name] = text;
  }

  // Freie Fertigkeiten: eigene übernehmen.
  const ffAusPaketen = new Set(altBasis.freieFertigkeiten);
  const ffNeu = new Set((neu.freieFertigkeiten || []).map(f => f.name));
  for (const ff of alt.freieFertigkeiten || []) {
    if (!ff.name || ffAusPaketen.has(ff.name) || ffNeu.has(ff.name)) continue;
    neu.freieFertigkeiten.push({ ...ff });
  }
}

async function rebuild() {
  const db = editor.getDb();
  const alt = editor.getChar();
  const neu = createCharakter(db, { name: startName, gesamtEP: startEP });

  for (const kat of ['Spezies', 'Kultur', 'Profession']) {
    const w = wahl[kat];
    if (w) mergePaket(neu, await ladePaket(w.pfad), kat, w.name);
  }

  const neueBasis = basisKopie(neu);
  if (alt && letzteBasis) uebertrageEigenes(alt, letzteBasis, neu);
  letzteBasis = neueBasis;

  editor.setChar(neu);
}

// --- Seitenwechsel --------------------------------------------------------

function gehe(zu) {
  index = Math.max(0, Math.min(SCHRITTE.length - 1, zu));
  zeigeSeite();
}

function zurueckOderRaus() {
  if (index === 0) { editor.oeffneNeuSeite(); return; }
  gehe(index - 1);
}

async function zeigeSeite() {
  screen.replace(await baueSeite(SCHRITTE[index]));
}

function rahmen(o) {
  return assistentSeite({
    schritt: index + 1,
    gesamt: SCHRITTE.length,
    onZurueck: zurueckOderRaus,
    onVor: () => gehe(index + 1),
    onBack: editor.darfVerlassen,
    ...o,
  });
}

async function baueSeite(key) {
  switch (key) {
    case 'Spezies': return paketSeite('Spezies', texte.SPEZIES_KURZ);
    case 'Kultur': return paketSeite('Kultur', texte.KULTUR_KURZ);
    case 'Profession': return paketSeite('Profession', texte.PROFESSION_KURZ);
    case 'Aussehen': return aussehenSeite();
    case 'Status': return statusSeite();
    case 'Finanzen': return finanzenSeite();
    case 'Eigenheiten': return eigenheitenSeite();
    case 'Attribute': return attributeSeite();
    case 'Vorteile': return vorteileSeite();
    default: return abschlussSeite();
  }
}

// --- Die einzelnen Seiten -------------------------------------------------

async function paketSeite(kategorie, info) {
  let liste = [];
  try { liste = await ipc.paketeListe(kategorie); } catch { liste = []; }

  return rahmen({
    titel: `${kategorie} wählen`,
    info,
    infoDetail: texte.PAKET_LANG,
    filter: true,
    filterLabel: `${kategorie} filtern`,
    zuruecksetzen: () => {
      delete wahl[kategorie];
      rebuild().then(() => { editor.aktualisiere(); screen.refresh(); });
    },
    inhalt: (box, q) => {
      const gewaehlt = wahl[kategorie];
      for (const p of liste) {
        // Ordner-Präfix "7 - " entfernen, sonst liest NVDA "sieben minus".
        const gruppe = p.gruppe ? p.gruppe.replace(/^\s*\d+\s*[-–]\s*/, '').trim() : '';
        const label = gruppe ? `${gruppe}: ${p.name}` : p.name;
        if (q && !label.toLowerCase().includes(q)) continue;
        box.appendChild(listenSchalter({
          label,
          detail: async () => fasseZusammen(await ladePaket(p.pfad)),
          gewaehlt: Boolean(gewaehlt && gewaehlt.pfad === p.pfad),
          onSelect: () => waehle(kategorie, p),
        }));
      }
      box.appendChild(listenSchalter({
        label: `${kategorie} überspringen`,
        hint: 'ohne Auswahl weiter',
        detail: 'Geht ohne Auswahl eine Seite weiter. Eine bereits getroffene Wahl bleibt bestehen.',
        onSelect: () => gehe(index + 1),
      }));
    },
  });
}

async function waehle(kategorie, info) {
  wahl[kategorie] = { pfad: info.pfad, name: info.name };
  await rebuild();
  const frei = editor.aktualisiere();
  sprache.sage(`${info.name} gewählt. ${frei} EP frei.`);
  gehe(index + 1);
}

function aussehenSeite() {
  let api = null;
  return rahmen({
    titel: 'Aussehen',
    info: texte.AUSSEHEN_KURZ,
    infoDetail: texte.AUSSEHEN_LANG,
    inhalt: (box) => { api = aussehenInhalt(box); },
    uebernehmen: () => api && api.uebernehmen(),
    zuruecksetzen: () => api && api.zuruecksetzen(),
  });
}

function statusSeite() {
  return rahmen({
    titel: 'Status festlegen',
    info: texte.STATUS_KURZ,
    infoDetail: texte.STATUS_LANG,
    // Wie bei Spezies, Kultur und Profession: die Wahl geht direkt weiter.
    inhalt: (box) => statusInhalt(box, '', () => gehe(index + 1)),
    zuruecksetzen: () => { editor.getChar().status = STATUS_STANDARD; },
  });
}

function finanzenSeite() {
  return rahmen({
    titel: 'Finanzen wählen',
    info: texte.FINANZEN_KURZ,
    infoDetail: texte.FINANZEN_LANG,
    inhalt: (box) => finanzenInhalt(box, '', () => gehe(index + 1)),
    zuruecksetzen: () => { editor.getChar().finanzen = FINANZEN_STANDARD; editor.aktualisiere(); },
  });
}

function eigenheitenSeite() {
  let api = null;
  return rahmen({
    titel: 'Eigenheiten beschreiben',
    info: texte.EIGENHEITEN_KURZ,
    infoDetail: texte.EIGENHEITEN_LANG,
    inhalt: (box) => { api = eigenheitenInhalt(box); },
    uebernehmen: () => api && api.uebernehmen(),
    zuruecksetzen: () => api && api.zuruecksetzen(),
    pruefe: () => (api ? api.pruefe() : ''),
  });
}

function attributeSeite() {
  return rahmen({
    titel: 'Attribute verteilen',
    info: texte.ATTRIBUTE_KURZ,
    infoDetail: texte.ATTRIBUTE_LANG,
    inhalt: (box) => attributeInhalt(box),
  });
}

function vorteileSeite() {
  return rahmen({
    titel: 'Vorteile wählen',
    info: texte.VORTEILE_KURZ,
    infoDetail: texte.VORTEILE_LANG,
    inhalt: (box) => vorteileInhalt(box),
  });
}

function abschlussSeite() {
  return rahmen({
    titel: 'Assistierte Führung abgeschlossen',
    info: texte.ABSCHLUSS_KURZ,
    infoDetail: texte.ABSCHLUSS_LANG,
    vorLabel: 'ein Schritt vor, speichern und weiter im freien Editor',
    onVor: async () => {
      await editor.speichere();
      editor.oeffneHub();
      editor.oeffneFertigkeiten();
    },
    inhalt: (box) => {
      const char = editor.getChar();
      const frei = editor.aktualisiere();
      const zeile = (text) => {
        const d = document.createElement('div');
        d.className = 'db-row ed-info';
        d.tabIndex = 0;
        d.textContent = text;
        d.setAttribute('data-sr-label', text);
        d.dataset.srValue = text;
        d.setAttribute('aria-label', text);
        box.appendChild(d);
      };
      zeile(`Name: ${char.name || 'ohne Namen'}`);
      zeile(`Spezies: ${char.spezies || 'keine'}, Heimat: ${char.heimat || 'keine'}`);
      zeile(`Eigenheiten: ${(char.eigenheiten || []).length}`);
      zeile(`Erfahrungspunkte: ${char.erfahrung.gesamt} gesamt, ${char.erfahrung.ausgegeben} ausgegeben, ${frei} frei`);
    },
  });
}

// --- Start ----------------------------------------------------------------

export async function starteAssistent() {
  const c = editor.getChar();
  startName = c.name;
  startEP = c.erfahrung.gesamt;
  wahl = {};
  index = 0;

  // Vorbelegung nach Ilaris-Standard: Unterschicht, Finanzen Normal.
  c.status = STATUS_STANDARD;
  c.finanzen = FINANZEN_STANDARD;
  letzteBasis = basisKopie(c);

  await zeigeSeite();
}

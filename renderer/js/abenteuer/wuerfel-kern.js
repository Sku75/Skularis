/**
 * Skularistool — Würfel- und Proben-Kern fürs Live-Spiel.
 *
 * Gemeinsam genutzt von den Würfelbecher-Schaltern, den Kampfproben (Attacke,
 * Verteidigung, Fernkampf) und den Zauberproben. Ilaris-Probe: entweder 1 W20
 * (Konflikt, im Kampf) oder 3 W20, von denen der mittlere zählt (entspannte
 * Probe). Dazu der Probenwert, mögliche Modifikatoren und eine Erschwernis.
 *
 * Ergebnis wird angesagt und in die Beschriftung des auslösenden Schalters
 * geschrieben (nachlesbar beim erneuten Anspringen).
 */
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import * as screen from '../ui/screen.js';
import { menuScreen } from '../ui/menu-screen.js';
import { knopfDialog, erschwernisDialog } from '../ui/dialog.js';
import { protokolliere } from '../core/abenteuer.js';
import { getAbenteuer, speichere } from './state.js';
import * as post from '../net/post.js';

/**
 * Einen Wurf ins verlustfreie Würfelprotokoll legen: Als Spieler wird er (mit
 * Sequenznummer) an den Meister gesendet und beim Reconnect erneut abgeglichen;
 * als Meister landet er unter "Meister" (verdeckte Würfe). Solo (ohne Sitzung)
 * passiert nichts.
 */
function protokolliereWurf(was, ergebnis, detail) {
  try {
    const r = (post.rolle && post.rolle()) || null;
    const rec = { was: String(was || ''), ergebnis: String(ergebnis || ''), detail: String(detail || '') };
    if (r === 'meister') post.meisterEigenerWurf(rec);
    else if (r === 'spieler') post.spielerWurf(rec);
  } catch { /* egal */ }
}

// Verdeckt-Modus: am Meistertisch (Charakteransicht Initiative-Phase) sollen die
// Würfe als verdeckte Meister-Würfe angesagt werden. Der Aufrufer schaltet ihn
// beim Öffnen ein und beim Verlassen wieder aus.
let _verdeckt = false;
export function setVerdeckt(v) { _verdeckt = !!v; }
function vd() { return _verdeckt ? 'Verdeckt. ' : ''; }

/** Der mittlere von drei Würfeln (Ilaris: der mittlere zählt). */
function mittel3(w) {
  const s = [...w].sort((a, b) => a - b);
  return s[1];
}

/**
 * Ergebnis rechts in die Zeile schreiben und in die Beschriftung des Schalters
 * übernehmen. Sehende sehen es neben dem Schalter, Blinde hören es beim
 * erneuten Anspringen.
 */
// Kurzergebnis je Schalter-Id merken, damit ein neu gezeichneter Schalter (z. B.
// beim Set-Wechsel) das letzte Ergebnis seines Sets sofort wieder anzeigen kann.
const _letztesKurz = {};
export function letztesKurz(id) { return _letztesKurz[id] || ''; }

// Gesprochener Ergebnis-Anhang je Schalter-Id (z. B. "Letztes Probenergebnis 14").
// Er wird HINTER die eigentliche Schalter-Beschriftung gehängt — die Beschriftung
// selbst bleibt immer zuerst hörbar ("Attacke oder Parade würfeln, Schalter,
// letztes Probenergebnis 14"), nie umgekehrt.
const _letzterAnhang = {};
export function letzterAnhang(id) { return _letzterAnhang[id] || ''; }

export function zeigeErgebnis(id, kurz, anhang) {
  if (!id) return;
  _letztesKurz[id] = kurz;
  if (anhang) _letzterAnhang[id] = anhang;
  const feld = document.querySelector(`[data-ergebnis="${id}"]`);
  if (feld) feld.textContent = kurz;
  const schalter = document.querySelector(`[data-ergebnis-ziel="${id}"]`);
  if (schalter) {
    // Basis-Beschriftung einmalig merken (ohne früheren Ergebnis-Anhang), dann
    // den Anhang HINTEN anfügen. So liest der Screenreader zuerst, was der
    // Schalter tut, und danach das letzte Ergebnis — nicht andersherum.
    if (!schalter.dataset.basisLabel) {
      const lab = schalter.querySelector('.db-menu__label');
      schalter.dataset.basisLabel = ((lab && lab.textContent) || schalter.getAttribute('aria-label') || '').trim();
    }
    const basis = schalter.dataset.basisLabel;
    const anh = _letzterAnhang[id];
    schalter.setAttribute('aria-label', anh ? `${basis}. ${anh}` : basis);
    // Tooltip-Zwischenspeicher verwerfen, damit mitLetztemWurf beim naechsten
    // Fokus/Abruf den frischen Wurf zeigt (sonst bleibt der alte Text stehen —
    // das war der Grund, warum das Zauber-Ergebnis nicht im Tooltip erschien).
    delete schalter.__detailText;   // Cache der sichtbaren Detailleiste (menu-screen)
    delete schalter.__detailCache;  // Cache des Vorlese-Tooltips (app.js)
  }
}

function fokusAufZiel(id) {
  const btn = document.querySelector(`[data-ergebnis-ziel="${id}"]`);
  if (btn) btn.focus();
}

/**
 * Einfacher Würfelwurf (Schnellwürfe, freier Wurf). Bei stumm kommt die Ansage
 * über den Fokus auf den Schalter, sonst direkt per aria-live.
 */
export function wuerfeln(anzahl, seiten, mod, id, stumm) {
  const a = getAbenteuer();
  const wuerfe = [];
  for (let i = 0; i < anzahl; i++) wuerfe.push(1 + Math.floor(Math.random() * seiten));
  const summe = wuerfe.reduce((s, n) => s + n, 0) + mod;
  const bez = `${anzahl} W ${seiten}${mod ? (mod > 0 ? ` plus ${mod}` : ` minus ${-mod}`) : ''}`;
  const summeText = mod ? `, Summe ${summe}` : '';
  sounds.playWuerfel();
  protokolliere(a, `Wurf ${bez}: ${wuerfe.join(', ')}${summeText}.`);
  speichere();
  const ansage = `${vd()}Gewürfelt, ${bez}, Ergebnis: ${wuerfe.join(', ')}${summeText}.`;
  // Auch einfache Wuerfe (Schnellwuerfe, freier Wurf) fuers Tooltip merken.
  if (id) _letzterWurf[id] = ['Letzter Wurf:', `${bez}: ${wuerfe.join(', ')}${summeText}`];
  zeigeErgebnis(id, mod ? `${wuerfe.join(' ')} = ${summe}` : wuerfe.join(' '), `Letzter Wurf ${wuerfe.join(', ')}${summeText}`);
  if (!stumm) { sprache.sage(ansage); protokolliereWurf(`Wurf ${bez}`, `${wuerfe.join(', ')}${summeText}`, ansage); }
}

// --- Erschwernis (gemerkt je Schalter) -----------------------------------
const _letzteErschwernis = {};

// Letzter Wurf je Schalter-Id, mehrzeilig fuer den Tooltip. Bleibt die Sitzung
// ueber erhalten (nur im Speicher, beim App-Start leer).
const _letzterWurf = {};

/**
 * Detail-Funktion, die den letzten Wurf (falls vorhanden) ueber den statischen
 * Tooltip stellt. Als item.detail nutzbar; wird beim Fokus frisch ausgewertet,
 * zeigt also immer den aktuellen Stand.
 */
export function mitLetztemWurf(id, basis) {
  return () => {
    const lw = _letzterWurf[id];
    if (!lw || !lw.length) return basis;
    const basisArr = basis == null || basis === '' ? [] : (Array.isArray(basis) ? basis : [basis]);
    return [...lw, '', ...basisArr];
  };
}

async function erschwernisAbfrage(id) {
  const vor = _letzteErschwernis[id] || 0;
  const e = await erschwernisDialog({ titel: 'Erschwernis', wert: vor });
  if (e !== null) _letzteErschwernis[id] = e;
  return e;
}

// Kurzer Titel OHNE Vorspann: der Screenreader sagt beim Öffnen nur "Würfel
// wählen" und dann sofort den fokussierten Knopf — die lange Herkunft (Waffe,
// Set) hat der Spieler gerade selbst gewählt und braucht sie nicht erneut.
async function wuerfelWahl() {
  return knopfDialog({
    titel: 'Würfel wählen',
    knoepfe: [
      { label: 'Mit 1 Würfel würfeln, Konflikt', wert: 1 },
      { label: 'Mit 3 Würfeln würfeln, entspannte Probe', wert: 3 },
    ],
  });
}

/**
 * Mehrfachauswahl von Modifikatoren (für Zauber). Enter schaltet einen
 * Modifikator um, "aktiviert" steht dann davor. Gibt die Summe der Wirkungen
 * und die Namen zurück, oder null bei Abbruch.
 * @returns {Promise<{summe:number, namen:string[]}|null>}
 */
export function modifikatorenWahl(modListe, titel) {
  return new Promise((resolve) => {
    let erledigt = false;
    const aktive = new Set();

    const abschluss = (ohne) => {
      if (erledigt) return;
      erledigt = true;
      if (ohne) aktive.clear();
      let summe = 0;
      const namen = [];
      [...aktive].sort((a, b) => a - b).forEach((i) => { summe += modListe[i].mod; namen.push(modListe[i].name); });
      screen.pop();
      resolve({ summe, namen });
    };

    const items = [];
    items.push({
      id: 'mod-ohne', label: 'Ohne Modifikator, direkt weiter',
      hint: 'keine Modifikation anwenden', onSelect: () => abschluss(true),
    });
    modListe.forEach((m, i) => {
      const basis = `${m.name}, ${m.modText}`;
      const it = {
        id: `mod-${i}`, label: basis, detail: m.tooltip,
        onSelect: () => {
          if (aktive.has(i)) aktive.delete(i); else aktive.add(i);
          it.label = `${aktive.has(i) ? 'aktiviert, ' : ''}${basis}`;
          sounds.playClick();
          screen.refresh(`#mod-${i}`);
        },
      };
      items.push(it);
    });
    items.push({
      id: 'mod-fertig', label: 'Fertig und weiter',
      hint: 'mit den gewählten Modifikatoren würfeln', onSelect: () => abschluss(false),
    });

    const scr = menuScreen({
      title: titel || 'Modifikatoren',
      subtitle: 'Enter schaltet einen Modifikator um. Fertig und weiter zum Würfeln. Escape bricht ab.',
      items, filter: false,
    });
    // Escape/Zurück bricht die Auswahl ab.
    scr.onBack = () => { if (!erledigt) { erledigt = true; resolve(null); } return true; };
    screen.push(scr);
  });
}

/**
 * Kampf- oder Zauberprobe mit Fokus-Führung. Fragt erst 1 oder 3 Würfel, bei
 * Zaubern dann die Modifikatoren, dann die Erschwernis, würfelt und sagt das
 * Ergebnis an. Der Fokus kehrt auf den auslösenden Schalter zurück, sodass das
 * Ergebnis beim Erreichen vorgelesen wird.
 *
 * @param {object} o
 * @param {string} o.id          eindeutige Ergebnis-Id des Schalters
 * @param {string} o.titel       Ansage-Vorspann, z. B. "Attacke Haupthand Säbel"
 * @param {string} o.vokabel     Name des Werts, z. B. "Attacke" oder "Feuer"
 * @param {number} o.probenwert  Probenwert
 * @param {Array}  [o.modListe]  Modifikatoren-Liste (nur Zauber)
 */
export async function kampfProbe(o) {
  const anzahl = await wuerfelWahl();
  if (anzahl === null) return;

  // Fester Modifikator (z. B. Manöver-Aufschlag) plus optional gewählte
  // Zauber-Modifikatoren.
  let extraMod = o.extraMod || 0;
  let modNamen = [];
  if (o.modListe && o.modListe.length) {
    const wahl = await modifikatorenWahl(o.modListe, `Modifikatoren, ${o.titel}`);
    if (wahl === null) return;
    extraMod += wahl.summe;
    modNamen = wahl.namen;
  }

  const ersch = await erschwernisAbfrage(o.id);
  if (ersch === null) return;

  const a = getAbenteuer();
  const wuerfe = [];
  for (let i = 0; i < anzahl; i++) wuerfe.push(1 + Math.floor(Math.random() * 20));
  const wert = anzahl === 3 ? mittel3(wuerfe) : wuerfe[0];
  const ew = wert + o.probenwert + extraMod - ersch;
  sounds.playWuerfel();

  const wuerfelText = anzahl === 3
    ? `drei W20 ${wuerfe.join(', ')}, der mittlere zählt ${wert}`
    : `ein W20 ${wert}`;
  const modText = extraMod ? (extraMod > 0 ? `, Modifikatoren plus ${extraMod}` : `, Modifikatoren minus ${-extraMod}`) : '';
  const erschText = ersch ? (ersch > 0 ? `, Erschwernis minus ${ersch}` : `, Erleichterung plus ${-ersch}`) : '';
  const modNamenText = modNamen.length ? ` Modifikatoren: ${modNamen.join(', ')}.` : '';
  // Bei fester Schwierigkeit gleich Erfolg oder Misserfolg ansagen; sonst der
  // vom Aufrufer mitgegebene Zusatz (z. B. vergleichende Probe, Kosten).
  let erfolgText = '';
  if (typeof o.schwierigkeit === 'number') {
    erfolgText = ` Gegen Schwierigkeit ${o.schwierigkeit}: ${ew >= o.schwierigkeit ? 'gelungen' : 'misslungen'}.`;
  }
  const zusatzText = o.zusatz ? ` ${o.zusatz}` : '';
  // Das Probenergebnis steht bewusst ganz vorn — das ist beim Würfeln die
  // wichtigste Zahl. Danach Erfolg/Misserfolg, dann Herkunft (Titel, Würfel,
  // Werte) und zuletzt die Zusätze (Kosten usw.).
  const ansage = `${vd()}Probenergebnis ${ew}.${erfolgText} ${o.titel}, ${wuerfelText}, plus dein ${o.vokabel}-Wert ${o.probenwert}${modText}${erschText}.${zusatzText}${modNamenText}`;

  // Letzten Wurf mehrzeilig fuer den Tooltip merken (bleibt die Sitzung ueber).
  _letzterWurf[o.id] = [
    'Letzter Wurf:',
    `Probenergebnis ${ew}${typeof o.schwierigkeit === 'number' ? (ew >= o.schwierigkeit ? ', gelungen' : ', misslungen') : ''}`,
    anzahl === 3 ? `Wurf drei W20 ${wuerfe.join(', ')}` : `Wurf ein W20 ${wuerfe[0]}`,
    anzahl === 3 ? `Mittlerer Wurf zaehlt ${wert}` : null,
    `Dein ${o.vokabel}-Wert ${o.probenwert}${modText}${erschText}`,
  ].filter(Boolean);

  protokolliere(a, `${o.titel}: ${wuerfelText}, ${o.vokabel} ${o.probenwert}${modText}${erschText}, Ergebnis ${ew}.${erfolgText}${modNamenText}`);
  speichere();
  zeigeErgebnis(o.id, `Ergebnis ${ew}`, `Letztes Probenergebnis ${ew}${typeof o.schwierigkeit === 'number' ? (ew >= o.schwierigkeit ? ', gelungen' : ', misslungen') : ''}`);
  // Fokus liegt nach dem Schließen der Dialoge schon wieder auf dem Schalter
  // (das ergibt keinen Fokuswechsel und damit keine Vorlesung), deshalb die
  // Ansage zuverlässig per aria-live. Der Schalter trägt das Ergebnis danach.
  fokusAufZiel(o.id);
  sprache.sage(ansage);
  protokolliereWurf(o.titel || o.vokabel || 'Probe', `Probenergebnis ${ew}`, ansage);
}

/**
 * Schadenswurf: Waffenwürfel plus Bonus (Waffen-TP plus Schadensbonus). Wird
 * direkt vom Schalter ausgelöst (kein Dialog), der Fokus bleibt dort, deshalb
 * Ansage per aria-live.
 */
export function schadenWurf(o) {
  const a = getAbenteuer();
  const anzahl = Math.max(0, o.wuerfel | 0);
  const seiten = o.seiten || 6;
  const wuerfe = [];
  for (let i = 0; i < anzahl; i++) wuerfe.push(1 + Math.floor(Math.random() * seiten));
  const summe = wuerfe.reduce((s, n) => s + n, 0) + (o.bonus || 0);
  sounds.playWuerfel();
  const wuerfelText = anzahl ? `${anzahl} W ${seiten} ${wuerfe.join(', ')}` : 'kein Schadenswürfel';
  const bText = o.bonus ? (o.bonus > 0 ? ` plus ${o.bonus}` : ` minus ${-o.bonus}`) : '';
  const zusatz = o.bonusText ? ` (${o.bonusText})` : '';
  // Erst das Ergebnis ansagen (Schaden X), dann die Rechnung.
  const ansage = `${vd()}Schaden ${summe}. ${o.name}. ${wuerfelText}${bText}${zusatz}.`;
  // Auch fuers Tooltip: oben das Ergebnis, danach die Rechnung.
  _letzterWurf[o.id] = [`Schaden Ergebnis ${summe}`, `${o.name}`, `${wuerfelText}${bText}`].filter(Boolean);
  protokolliere(a, `Schaden ${o.name}: ${wuerfelText}${bText}, gesamt ${summe}.`);
  speichere();
  zeigeErgebnis(o.id, `Schaden ${summe}`, `Letzter Schaden ${summe}`);
  sprache.sage(ansage);
  protokolliereWurf(`Schaden ${o.name}`, `Schaden ${summe}`, ansage);
}

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
import { zahlDialog, knopfDialog } from '../ui/dialog.js';
import { protokolliere } from '../core/abenteuer.js';
import { getAbenteuer, speichere } from './state.js';

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
export function zeigeErgebnis(id, kurz, ansage) {
  if (!id) return;
  const feld = document.querySelector(`[data-ergebnis="${id}"]`);
  if (feld) feld.textContent = kurz;
  const schalter = document.querySelector(`[data-ergebnis-ziel="${id}"]`);
  if (schalter) schalter.setAttribute('aria-label', ansage);
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
  const ansage = `Gewürfelt, ${bez}, Ergebnis: ${wuerfe.join(', ')}${summeText}.`;
  zeigeErgebnis(id, mod ? `${wuerfe.join(' ')} = ${summe}` : wuerfe.join(' '), ansage);
  if (!stumm) sprache.sage(ansage);
}

// --- Erschwernis (gemerkt je Schalter) -----------------------------------
const _letzteErschwernis = {};

async function erschwernisAbfrage(id) {
  const vor = _letzteErschwernis[id] || 0;
  const e = await zahlDialog({
    titel: 'Erschwernis',
    label: 'Erschwernis, 0 wenn keine. Eine Erleichterung als Minuszahl.',
    wert: vor, min: -100, max: 100,
  });
  if (e !== null) _letzteErschwernis[id] = e;
  return e;
}

async function wuerfelWahl(titel) {
  return knopfDialog({
    titel: titel ? `${titel}, Würfel wählen` : 'Würfel wählen',
    knoepfe: [
      { label: '1 Würfel, Konflikt im Kampf', wert: 1 },
      { label: '3 Würfel, entspannte Probe', wert: 3 },
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
  const anzahl = await wuerfelWahl(o.titel);
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
  const ansage = `${o.titel}. ${wuerfelText}, plus dein ${o.vokabel}-Wert ${o.probenwert}${modText}${erschText}. Probenergebnis ${ew}.${modNamenText}`;

  protokolliere(a, `${o.titel}: ${wuerfelText}, ${o.vokabel} ${o.probenwert}${modText}${erschText}, Ergebnis ${ew}.${modNamenText}`);
  speichere();
  zeigeErgebnis(o.id, `Ergebnis ${ew}`, ansage);
  // Fokus liegt nach dem Schließen der Dialoge schon wieder auf dem Schalter
  // (das ergibt keinen Fokuswechsel und damit keine Vorlesung), deshalb die
  // Ansage zuverlässig per aria-live. Der Schalter trägt das Ergebnis danach.
  fokusAufZiel(o.id);
  sprache.sage(ansage);
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
  const ansage = `Schaden ${o.name}. ${wuerfelText}${bText}${zusatz}. Gesamtschaden ${summe}.`;
  protokolliere(a, `Schaden ${o.name}: ${wuerfelText}${bText}, gesamt ${summe}.`);
  speichere();
  zeigeErgebnis(o.id, `Schaden ${summe}`, ansage);
  sprache.sage(ansage);
}

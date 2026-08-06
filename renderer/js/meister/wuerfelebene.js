/**
 * Skularistool — Meistertisch: Wuerfelebene des Spieltisches.
 *
 * Mittlere Ebene des Spielbretts, mit links/rechts erreichbar. Drei Eintraege:
 *   - Freier Wurf: die Schnellwuerfe (1W6, 2W6, 1W20, 3W20) und ein freier Wurf.
 *   - Monsterwurf: einen Gegner vom Tisch waehlen, dann Attacke, Parade, Schaden
 *     oder Ausweichen (Ausweichen aus dem Statblock-Feld).
 *   - Spielerwurf: einen Spieler oder freundlichen NPC vom Tisch waehlen, dann
 *     seine Angriffe (Attacke, Parade, Schaden) oder ein freier Wurf.
 *
 * Alle Wuerfe laufen ueber die verdeckten Meister-Wuerfel (mit Ansage und
 * Protokoll); am Tisch spielt sich das auf dem Rechner des Meisters ab.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { knopfDialog, zahlDialog, spinnerDialog } from '../ui/dialog.js';
import { getMeister } from './state.js';
import { angriffeText } from '../core/meister-abenteuer.js';
import { verdeckteProbe, verdeckterWurf } from './wuerfel.js';

function tischKarten() { const a = getMeister(); return (a && a.tisch && a.tisch.karten) || []; }
function gegnerAmTisch() { return tischKarten().filter(k => k.art === 'gegner'); }
function spielerAmTisch() { return tischKarten().filter(k => k.art === 'spieler' || k.art === 'freund'); }

// --- Freier Wurf ---------------------------------------------------------

export async function oeffneFreierWurf() {
  const wahl = await knopfDialog({
    titel: 'Freier Wurf', knoepfe: [
      { label: '1 W6', wert: 'w6' },
      { label: '2 W6', wert: 'w6x2' },
      { label: '1 W20', wert: 'w20' },
      { label: '3 W20', wert: 'w20x3' },
      { label: 'Freier Wurf', wert: 'frei' },
    ],
  });
  if (wahl === null) return;
  if (wahl === 'w6') verdeckterWurf(1, 6, 0, 'Wurf 1 W6');
  else if (wahl === 'w6x2') verdeckterWurf(2, 6, 0, 'Wurf 2 W6');
  else if (wahl === 'w20') verdeckterWurf(1, 20, 0, 'Wurf 1 W20');
  else if (wahl === 'w20x3') verdeckterWurf(3, 20, 0, 'Wurf 3 W20');
  else if (wahl === 'frei') {
    const anzahl = await zahlDialog({ titel: 'Freier Wurf', label: 'Anzahl der Wuerfel', wert: 1, min: 1, max: 50 });
    if (anzahl === null) return;
    const seiten = await spinnerDialog({ titel: 'Wuerfeltyp', optionen: [6, 20], index: 1, format: (v) => `W${v}` });
    if (seiten === null) return;
    const mod = await zahlDialog({ titel: 'Modifikator', label: 'Fester Zuschlag, 0 wenn keiner', wert: 0, min: -50, max: 50 });
    if (mod === null) return;
    verdeckterWurf(anzahl, seiten, mod, 'Freier Wurf');
  }
}

// --- Angriffs-Wuerfe (gemeinsam fuer Monster und Spieler) ----------------

function waehleAngriff(k) {
  const an = k.angriffe || [];
  if (!an.length) return Promise.resolve(null);
  if (an.length === 1) return Promise.resolve(an[0]);
  return knopfDialog({ titel: 'Welcher Angriff?', knoepfe: an.map((a2, i) => ({ label: a2.name, wert: i })) }).then(i => (i === null ? null : an[i]));
}

async function angriffWurf(k, art) {
  const ang = await waehleAngriff(k);
  if (!ang) { sprache.sage(`${k.name} hat keine Angriffe.`); return; }
  if (art === 'at') verdeckteProbe({ wer: k.name, was: `Attacke ${ang.name}`, probenwert: (ang.at != null ? ang.at : ang.wert || 0), anzahl: 1 });
  else if (art === 'pa') {
    if (ang.pa == null) { sprache.sage(`${ang.name} hat keine Parade.`); return; }
    verdeckteProbe({ wer: k.name, was: `Parade ${ang.name}`, probenwert: ang.pa, anzahl: 1 });
  } else if (art === 'sch') verdeckterWurf(ang.wuerfel || 0, ang.seiten || 6, ang.bonus || 0, `Schaden ${ang.name}`);
}

// --- Monsterwurf ---------------------------------------------------------

export function oeffneMonsterwurf() {
  screen.push(karteWaehlenScreen('Monsterwurf', gegnerAmTisch, monsterKarteMenue, 'Keine Gegner auf dem Spieltisch.'));
}

function monsterKarteMenue(k) {
  return {
    title: k.name,
    build() {
      return menuScreen({
        title: k.name,
        subtitle: 'Escape zurueck.',
        items: [
          { label: 'Attacke wuerfeln', onSelect: () => angriffWurf(k, 'at') },
          { label: 'Parade wuerfeln', onSelect: () => angriffWurf(k, 'pa') },
          { label: 'Schaden wuerfeln', onSelect: () => angriffWurf(k, 'sch') },
          { label: `Ausweichen wuerfeln (${k.ausweichen || 0})`, onSelect: () => verdeckteProbe({ wer: k.name, was: 'Ausweichen', probenwert: k.ausweichen || 0, anzahl: 1 }) },
        ],
      }).build();
    },
  };
}

// --- Spielerwurf ---------------------------------------------------------

export function oeffneSpielerwurf() {
  screen.push(karteWaehlenScreen('Spielerwurf', spielerAmTisch, spielerKarteMenue, 'Keine Spieler oder freundlichen NPC auf dem Spieltisch.'));
}

function spielerKarteMenue(k) {
  return {
    title: k.name,
    build() {
      const items = [
        { label: 'Attacke wuerfeln', onSelect: () => angriffWurf(k, 'at') },
        { label: 'Parade wuerfeln', onSelect: () => angriffWurf(k, 'pa') },
        { label: 'Schaden wuerfeln', onSelect: () => angriffWurf(k, 'sch') },
        { label: 'Freier Wurf', onSelect: () => oeffneFreierWurf() },
      ];
      return menuScreen({ title: k.name, subtitle: 'Escape zurueck.', items }).build();
    },
  };
}

// --- gemeinsamer Karten-Waehler ------------------------------------------

function karteWaehlenScreen(titel, quelleFn, menueFn, leer) {
  return {
    title: titel,
    build() {
      const karten = quelleFn();
      const items = karten.map(k => ({
        label: `${k.name}${k.wunden ? `, ${k.wunden} Wunden` : ''}`,
        detail: `${k.name}, Wundschwelle ${k.ws}, Ruestung ${k.rs}, Initiative ${k.ini}. ${angriffeText(k) || 'keine Angriffe'}`,
        hint: 'Enter: wuerfeln',
        onSelect: () => screen.push(menueFn(k)),
      }));
      return menuScreen({ title: titel, subtitle: 'Karte waehlen, dann wuerfeln. Escape zurueck.', items, leer, filter: karten.length >= 10 }).build();
    },
    onShow() { sprache.sage(titel + '.'); },
  };
}

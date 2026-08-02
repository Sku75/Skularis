/**
 * Skularistool — Meistertisch: Spieltisch im Stil von Magic the Gathering Arena.
 *
 * Auf dem Tisch liegen Kampfkarten: Helden (Kurzform aus dem Charakterbogen) und
 * Gegner beziehungsweise freundliche NPC (aus der Kartei). Jede Karte zeigt ihre
 * Kampfwerte und einen Wundenstand, den man mit Pfeil links und rechts erhoeht
 * und senkt. Gegner lassen sich einem Helden zuordnen; der Tisch gruppiert dann
 * je Held seine Gegner, so behaelt man im Kampf den Ueberblick. Am Ende steht
 * eine Gruppe Unverteilt fuer noch nicht zugewiesene Karten.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { auswahlScreen } from '../ui/auswahl-screen.js';
import { knopfDialog, jaNeinDialog } from '../ui/dialog.js';
import { wertZeile, infoZeile, aktionZeile, abschnittTitel, verbindeDetail } from '../editor/widgets.js';
import { getDb, ladeDb } from '../core/db-laden.js';
import { baueSpielerKarte, protokolliere, angriffeText, vitalitaet } from '../core/meister-abenteuer.js';
import { getMeister, speichere } from './state.js';
import { verdeckteProbe, verdeckterWurf } from './wuerfel.js';

function wundStatus(k) {
  if (!k.wunden) return `Wundschwelle ${k.ws}, unverletzt`;
  let s = `Wundschwelle ${k.ws}, ${k.wunden} Wunden`;
  if (k.wunden >= 5) s += ', kampfunfaehig';
  return s;
}

function artWort(k) { return k.art === 'spieler' ? 'Held' : (k.art === 'freund' ? 'Freund' : 'Gegner'); }

function karteDetail(k) {
  const faeh = [...(k.vorteile || []), ...(k.manoever || [])];
  return [
    `${k.name}, ${artWort(k)}${k.kategorie ? ', ' + k.kategorie : ''}.`,
    wundStatus(k) + '.',
    `Ruestung ${k.rs}, Initiative ${k.ini}.`,
    angriffeText(k) || 'Keine Angriffe.',
    faeh.length ? `Faehigkeiten: ${faeh.join(', ')}.` : '',
    k.notizen ? `Notizen: ${k.notizen}` : '',
  ].filter(Boolean).join(' ');
}

/**
 * Eine Kampfkarte in den Container zeichnen. Feste Zeilenfolge (Kartenstandard):
 * Kopf, Status (Wunden verstellbar), Widerstand, Angriffe, Faehigkeiten, Aktionen.
 */
function zeichneKarte(wrap, a, k, eingerueckt) {
  const p = eingerueckt ? '    ' : '';
  // 1. Kopf: Name, Art, Kategorie.
  wrap.appendChild(infoZeile(`${p}${k.name}, ${artWort(k)}${k.kategorie ? ', ' + k.kategorie : ''}`, karteDetail(k)));
  // 2. Status: Wunden mit Pfeil links und rechts, Wundschwelle dahinter.
  // Bei Heldenkarten kommen die Wunden aus der GETEILTEN Vitalitaet (a.vitalitaet)
  // — dieselbe Quelle wie die Spielerinfos-Uebersicht. So ist der Stand ueberall
  // gleich und wird mit dem Abenteuer gespeichert.
  const istHeld = k.art === 'spieler';
  wrap.appendChild(wertZeile({
    label: `${p}${k.name} Wunden`,
    get: () => (istHeld ? vitalitaet(a, k.name).wunden : (k.wunden || 0)),
    set: (v) => { if (istHeld) { vitalitaet(a, k.name).wunden = v; k.wunden = v; } else { k.wunden = v; } },
    min: 0, max: 99,
    suffix: () => wundStatus(k),
    detail: karteDetail(k),
    onChange: () => { speichere(); return wundStatus(k); },
  }));
  // 3. Widerstand.
  wrap.appendChild(infoZeile(`${p}Wundschwelle ${k.ws}, Ruestung ${k.rs}, Initiative ${k.ini}`, karteDetail(k)));

  if (k.art !== 'spieler') {
    // 4. Angriffe, je Waffe Attacke, Parade (falls vorhanden) und Schaden verdeckt.
    for (const ang of k.angriffe || []) {
      const at = ang.at != null ? ang.at : ang.wert || 0;
      wrap.appendChild(aktionZeile(`${p}${ang.name}: Attacke ${at} wuerfeln`, () => verdeckteProbe({ wer: k.name, was: `Attacke ${ang.name}`, probenwert: at, anzahl: 1 }), 'verdeckt'));
      if (ang.pa != null) wrap.appendChild(aktionZeile(`${p}${ang.name}: Parade ${ang.pa} wuerfeln`, () => verdeckteProbe({ wer: k.name, was: `Parade ${ang.name}`, probenwert: ang.pa, anzahl: 1 }), 'verdeckt'));
      wrap.appendChild(aktionZeile(`${p}${ang.name}: Schaden wuerfeln`, () => verdeckterWurf(ang.wuerfel, ang.seiten, ang.bonus, `Schaden ${ang.name}`), 'verdeckt'));
    }
    // 5. Faehigkeiten.
    const faeh = [...(k.vorteile || []), ...(k.manoever || [])];
    if (faeh.length) wrap.appendChild(infoZeile(`${p}Faehigkeiten: ${faeh.join(', ')}`, karteDetail(k)));
    // Aktionen.
    wrap.appendChild(aktionZeile(`${p}${k.name}: einem Helden zuweisen`, () => zuweisen(k), 'ordnet diese Karte einem Helden zu'));
    wrap.appendChild(aktionZeile(`${p}${k.name}: vom Tisch nehmen`, () => vomTisch(k), 'entfernt die Karte'));
  } else {
    if ((k.angriffe || []).length) wrap.appendChild(infoZeile(`${p}Angriffe: ${angriffeText(k)}`, karteDetail(k)));
    wrap.appendChild(aktionZeile(`${p}${k.name}: vom Tisch nehmen`, () => vomTisch(k), 'entfernt die Heldenkarte'));
  }
}

function zuweisen(k) {
  const a = getMeister();
  const helden = a.tisch.karten.filter(x => x.art === 'spieler');
  if (!helden.length) { sprache.sage('Keine Heldenkarte auf dem Tisch. Erst einen Helden auf den Tisch legen.'); return; }
  const knoepfe = helden.map(h => ({ label: h.name, wert: h.id }));
  knoepfe.push({ label: 'Unverteilt (keinem Helden)', wert: 0 });
  knopfDialog({ titel: `${k.name} zuweisen`, knoepfe }).then((ziel) => {
    if (ziel === null) return;
    k.zuOrt = ziel || null;
    protokolliere(a, `${k.name} ${ziel ? 'zugewiesen an ' + (helden.find(h => h.id === ziel)?.name || 'Held') : 'aus der Zuordnung geloest'}.`);
    speichere();
    screen.refresh();
    const zielName = ziel ? (helden.find(h => h.id === ziel)?.name || 'Held') : 'Unverteilt';
    sprache.sage(`${k.name} kaempft jetzt gegen ${zielName}.`);
  });
}

async function vomTisch(k) {
  const a = getMeister();
  if (!await jaNeinDialog({ titel: 'Vom Tisch nehmen', frage: `${k.name} vom Tisch nehmen?` })) return;
  a.tisch.karten = a.tisch.karten.filter(x => x !== k);
  // Zuweisungen auf diese Karte loesen.
  for (const x of a.tisch.karten) if (x.zuOrt === k.id) x.zuOrt = null;
  speichere();
  screen.refresh();
  sprache.sage(`${k.name} vom Tisch genommen.`);
}

async function heldAufTisch() {
  const a = getMeister();
  const db = await ladeDb();
  const drauf = new Set(a.tisch.karten.filter(k => k.art === 'spieler').map(k => k.name));
  const frei = (a.charaktere || []).filter(c => !drauf.has(c.name));
  if (!frei.length) { sprache.sage((a.charaktere || []).length ? 'Alle Helden liegen schon auf dem Tisch.' : 'Keine Helden in der Gruppe.'); return; }
  auswahlScreen({
    titel: 'Held auf den Tisch legen',
    eintraege: frei.map(c => ({ label: c.name, wert: c.name })),
    onWahl: (name) => {
      const c = (a.charaktere || []).find(x => x.name === name);
      if (!c) return;
      a.tisch.karten.push(baueSpielerKarte(a, c.bogen, db));
      protokolliere(a, `Held ${c.name} auf den Tisch gelegt.`);
      speichere();
      screen.refresh();
      sprache.sage(`${c.name} liegt auf dem Tisch.`);
    },
  });
}

function statblockAufTisch(art) {
  const a = getMeister();
  const arr = art === 'freund' ? a.freundlicheNsc : a.nsc;
  if (!arr.length) { sprache.sage(art === 'freund' ? 'Keine freundlichen NPC in der Kartei.' : 'Keine Gegner in der Kartei. Erst in der Gegnerkartei anlegen.'); return; }
  auswahlScreen({
    titel: art === 'freund' ? 'Freundlichen NPC auf den Tisch legen' : 'Gegner auf den Tisch legen',
    eintraege: arr.map((sb, i) => ({ label: sb.name, wert: i, detail: `Wundschwelle ${sb.ws}, Ruestung ${sb.rs}, Initiative ${sb.ini}.` })),
    bleibt: true,
    onWahl: async (i) => {
      const sb = arr[i];
      if (!sb) return;
      const { baueStatblockKarte } = await import('../core/meister-abenteuer.js');
      a.tisch.karten.push(baueStatblockKarte(a, sb, art));
      protokolliere(a, `${sb.name} auf den Tisch gelegt.`);
      speichere();
      sounds.playOeffnen();
      sprache.sage(`${sb.name} liegt auf dem Tisch.`);
    },
  });
}

function initiativeScreen() {
  return {
    title: 'Initiative-Reihenfolge',
    build() {
      const a = getMeister();
      const karten = [...a.tisch.karten].sort((x, y) => (y.ini || 0) - (x.ini || 0));
      const items = karten.map(k => ({
        label: `${k.name}: Initiative ${k.ini}${k.wunden ? `, ${k.wunden} Wunden` : ''}`,
        hint: k.art === 'spieler' ? 'Held' : (k.art === 'freund' ? 'Freund' : 'Gegner'),
        onSelect: () => {},
      }));
      return menuScreen({ title: this.title, subtitle: 'Hoechste Initiative oben. Escape zurueck.', items, leer: 'Keine Karten auf dem Tisch.' }).build();
    },
    onShow() {
      const a = getMeister();
      const karten = [...a.tisch.karten].sort((x, y) => (y.ini || 0) - (x.ini || 0));
      if (karten.length) sprache.sage('Initiative-Reihenfolge, hoechste oben. ' + karten.map(k => `${k.name} ${k.ini}`).join(', ') + '.');
    },
  };
}

export function spieltischScreen() {
  return {
    title: 'Spieltisch',
    build() {
      const a = getMeister();
      const karten = a.tisch.karten || [];
      this.title = `Spieltisch, ${karten.length} Karten`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Spieltisch'));

      // Aktionen oben.
      wrap.appendChild(aktionZeile('Held auf den Tisch legen', () => heldAufTisch(), 'aus der Gruppe'));
      wrap.appendChild(aktionZeile('Gegner auf den Tisch legen', () => statblockAufTisch('gegner'), 'aus der Gegnerkartei'));
      wrap.appendChild(aktionZeile('Freundlichen NPC auf den Tisch legen', () => statblockAufTisch('freund'), 'aus den freundlichen NPC'));
      wrap.appendChild(aktionZeile('Initiative-Reihenfolge anzeigen', () => screen.push(initiativeScreen()), 'nach Initiative sortiert'));
      if (karten.length) {
        wrap.appendChild(aktionZeile('Tisch leeren', async () => {
          if (!await jaNeinDialog({ titel: 'Tisch leeren', frage: 'Alle Karten vom Tisch nehmen?' })) return;
          a.tisch.karten = []; speichere(); screen.refresh(); sprache.sage('Tisch geleert.');
        }, 'alle Karten entfernen'));
      }

      const helden = karten.filter(k => k.art === 'spieler');
      const heldIds = new Set(helden.map(h => h.id));

      // Je Held eine Gruppe mit den ihm zugewiesenen Gegnern.
      for (const held of helden) {
        wrap.appendChild(abschnittTitel(`Held ${held.name}`));
        zeichneKarte(wrap, a, held, false);
        const gegner = karten.filter(k => k.art !== 'spieler' && k.zuOrt === held.id);
        for (const g of gegner) zeichneKarte(wrap, a, g, true);
      }

      // Unverteilte Gegner und Freunde.
      const unverteilt = karten.filter(k => k.art !== 'spieler' && !(k.zuOrt && heldIds.has(k.zuOrt)));
      if (unverteilt.length) {
        wrap.appendChild(abschnittTitel('Unverteilt'));
        for (const g of unverteilt) zeichneKarte(wrap, a, g, false);
      }

      if (!karten.length) wrap.appendChild(infoZeile('Der Tisch ist leer. Lege Helden und Gegner auf den Tisch.'));

      verbindeDetail(wrap);
      return wrap;
    },
    onShow() { sprache.sage('Spieltisch. Karten auf den Tisch legen, Wunden mit Pfeil links und rechts, Gegner den Helden zuweisen.'); },
  };
}

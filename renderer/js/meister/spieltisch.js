/**
 * Skularistool — Meistertisch: Spieltisch im Stil von Magic the Gathering Arena.
 *
 * Auf dem Tisch liegen Kampfkarten: Helden (Kurzform aus dem Charakterbogen) und
 * Gegner beziehungsweise freundliche NPC (aus der Kartei). Jede Karte zeigt ihre
 * Kampfwerte und einen Wundenstand, den man mit Pfeil links und rechts erhoeht
 * und senkt.
 *
 * Verbindungen (wer kaempft gegen wen): Auf der Namenszeile einer Karte nimmt die
 * LEERTASTE die Karte auf; die naechste Leertaste auf einer ANDEREN Karte verbindet
 * beide. Leertaste noch einmal auf DERSELBEN Karte loest alle ihre Verbindungen.
 * Escape bricht eine Aufnahme ab. ENTER (oder Mausklick) oeffnet das Kartenmenue
 * mit "Verbinden", "Verbindungen loesen" und "Vom Tisch nehmen". Verbindungen sind
 * viele-zu-viele: ein Gegner kann gegen mehrere Helden kaempfen und umgekehrt.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { auswahlScreen } from '../ui/auswahl-screen.js';
import { jaNeinDialog } from '../ui/dialog.js';
import { wertZeile, infoZeile, aktionZeile, abschnittTitel, verbindeDetail } from '../editor/widgets.js';
import { getDb, ladeDb } from '../core/db-laden.js';
import { baueSpielerKarte, protokolliere, angriffeText, vitalitaet } from '../core/meister-abenteuer.js';
import { getMeister, speichere } from './state.js';
import { verdeckteProbe, verdeckterWurf } from './wuerfel.js';

// Welche Karte ist gerade "aufgenommen" (erste Leertaste)? Merkt sich die id ueber
// Neuaufbauten des Bildschirms hinweg, bis verbunden, geloest oder abgebrochen wird.
let _aufgenommenId = null;

function wundStatus(k) {
  if (!k.wunden) return `Wundschwelle ${k.ws}, unverletzt`;
  let s = `Wundschwelle ${k.ws}, ${k.wunden} Wunden`;
  if (k.wunden >= 5) s += ', kampfunfaehig';
  return s;
}

function artWort(k) { return k.art === 'spieler' ? 'Held' : (k.art === 'freund' ? 'Freund' : 'Gegner'); }

// --- Verbindungen -------------------------------------------------------

function karteNachId(a, id) { return (a.tisch.karten || []).find(x => x.id === id) || null; }

/** Namen der Karten, mit denen k verbunden ist. */
function verbundeneNamen(a, k) {
  return (k.verbindungen || []).map(id => karteNachId(a, id)).filter(Boolean).map(x => x.name);
}

/** Verbundene Karten einer bestimmten Art (z. B. die Helden fuer das Angriffsziel). */
function verbundeneDerArt(a, k, art) {
  return (k.verbindungen || []).map(id => karteNachId(a, id)).filter(x => x && x.art === art);
}

function verbindungsText(a, k) {
  const n = verbundeneNamen(a, k);
  return n.length ? `Kaempft gegen: ${n.join(', ')}` : 'Keine Verbindung';
}

/** Zwei Karten symmetrisch verbinden. Liefert true, wenn es eine neue Verbindung war. */
function verbinde(x, y) {
  if (!x || !y || x.id === y.id) return false;
  x.verbindungen = x.verbindungen || [];
  y.verbindungen = y.verbindungen || [];
  let neu = false;
  if (!x.verbindungen.includes(y.id)) { x.verbindungen.push(y.id); neu = true; }
  if (!y.verbindungen.includes(x.id)) { y.verbindungen.push(x.id); neu = true; }
  return neu;
}

/** Alle Verbindungen einer Karte loesen. Liefert die Anzahl geloester Verbindungen. */
function loeseAlle(a, k) {
  let n = 0;
  for (const other of (a.tisch.karten || [])) {
    if (!Array.isArray(other.verbindungen)) continue;
    const i = other.verbindungen.indexOf(k.id);
    if (i >= 0) { other.verbindungen.splice(i, 1); n++; }
  }
  const eigene = (k.verbindungen || []).length;
  k.verbindungen = [];
  return Math.max(n, eigene);
}

/**
 * Einmalige Migration: das alte Feld zuOrt (Gegner -> genau ein Held) wird zu einer
 * symmetrischen Verbindung. Danach ist jede Karte mit verbindungen ausgestattet.
 */
function migriereVerbindungen(a) {
  const karten = a.tisch.karten || [];
  for (const k of karten) if (!Array.isArray(k.verbindungen)) k.verbindungen = [];
  for (const k of karten) {
    if (k.zuOrt) {
      const ziel = karten.find(x => x.id === k.zuOrt);
      if (ziel) verbinde(k, ziel);
      delete k.zuOrt;
    }
  }
}

/** Leertaste auf einer Karte: aufnehmen -> verbinden -> (auf derselben) loesen. */
function tappe(a, k) {
  if (_aufgenommenId === null) {
    _aufgenommenId = k.id;
    sounds.playClick();
    sprache.sage(`${k.name} aufgenommen. Leertaste auf einer anderen Karte verbindet, noch einmal hier loest alle Verbindungen, Escape bricht ab.`);
    return;
  }
  if (_aufgenommenId === k.id) {
    const n = loeseAlle(a, k);
    _aufgenommenId = null;
    speichere();
    screen.refresh();
    sprache.sage(n ? `Alle Verbindungen von ${k.name} geloest.` : `${k.name} hatte keine Verbindungen.`);
    return;
  }
  const quelle = karteNachId(a, _aufgenommenId);
  _aufgenommenId = null;
  if (!quelle) { sprache.sage('Aufnahme verloren. Bitte neu aufnehmen.'); return; }
  const neu = verbinde(quelle, k);
  speichere();
  screen.refresh();
  sprache.sage(neu ? `${quelle.name} mit ${k.name} verbunden.` : `${quelle.name} und ${k.name} waren schon verbunden.`);
}

function karteDetail(a, k) {
  const faeh = [...(k.vorteile || []), ...(k.manoever || [])];
  return [
    `${k.name}, ${artWort(k)}${k.kategorie ? ', ' + k.kategorie : ''}.`,
    wundStatus(k) + '.',
    `Ruestung ${k.rs}, Initiative ${k.ini}.`,
    verbindungsText(a, k) + '.',
    angriffeText(k) || 'Keine Angriffe.',
    faeh.length ? `Faehigkeiten: ${faeh.join(', ')}.` : '',
    k.notizen ? `Notizen: ${k.notizen}` : '',
  ].filter(Boolean).join(' ');
}

/**
 * Eine Kampfkarte in den Container zeichnen. Kopfzeile: Leertaste verbindet, Enter
 * (oder Klick) oeffnet das Kartenmenue. Darunter der Wundenstand (Pfeil links und
 * rechts), Widerstand, Angriffe und Faehigkeiten.
 */
function zeichneKarte(wrap, a, k) {
  // 1. Kopfzeile: Name, Art, Kategorie, Verbindungen. Leertaste/Enter aktiv.
  const kat = k.kategorie ? ', ' + k.kategorie : '';
  const kopf = infoZeile(`${k.name}, ${artWort(k)}${kat}. ${verbindungsText(a, k)}`, karteDetail(a, k));
  kopf.classList.add('spieltisch-kopf');
  kopf.addEventListener('click', () => oeffneKarteMenue(a, k));
  kopf.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Space') {
      e.preventDefault(); e.stopPropagation(); tappe(a, k);
    } else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation(); oeffneKarteMenue(a, k);
    } else if (e.key === 'Escape' && _aufgenommenId !== null) {
      e.preventDefault(); e.stopPropagation(); _aufgenommenId = null; sprache.sage('Aufnahme abgebrochen.');
    }
  });
  wrap.appendChild(kopf);

  // 2. Wundenstand mit Pfeil links und rechts. Bei Helden aus der geteilten Vitalitaet.
  const istHeld = k.art === 'spieler';
  wrap.appendChild(wertZeile({
    label: `${k.name} Wunden`,
    get: () => (istHeld ? vitalitaet(a, k.name).wunden : (k.wunden || 0)),
    set: (v) => { if (istHeld) { vitalitaet(a, k.name).wunden = v; k.wunden = v; } else { k.wunden = v; } },
    min: 0, max: 99,
    suffix: () => wundStatus(k),
    detail: karteDetail(a, k),
    onChange: () => { speichere(); return wundStatus(k); },
  }));

  // 3. Widerstand.
  wrap.appendChild(infoZeile(`Wundschwelle ${k.ws}, Ruestung ${k.rs}, Initiative ${k.ini}`, karteDetail(a, k)));

  // 4. Angriffe (nur Gegner/Freunde). Das Angriffsziel sind die verbundenen Helden.
  if (k.art !== 'spieler') {
    const zielNamen = verbundeneDerArt(a, k, 'spieler').map(h => h.name);
    const zielText = zielNamen.length ? ` gegen ${zielNamen.join(' oder ')}` : '';
    for (const ang of k.angriffe || []) {
      const at = ang.at != null ? ang.at : ang.wert || 0;
      wrap.appendChild(aktionZeile(`${ang.name}: Attacke ${at} wuerfeln`, () => verdeckteProbe({ wer: k.name, was: `Attacke ${ang.name}${zielText}`, probenwert: at, anzahl: 1 }), 'verdeckt'));
      if (ang.pa != null) wrap.appendChild(aktionZeile(`${ang.name}: Parade ${ang.pa} wuerfeln`, () => verdeckteProbe({ wer: k.name, was: `Parade ${ang.name}`, probenwert: ang.pa, anzahl: 1 }), 'verdeckt'));
      wrap.appendChild(aktionZeile(`${ang.name}: Schaden wuerfeln`, () => verdeckterWurf(ang.wuerfel, ang.seiten, ang.bonus, `Schaden ${ang.name}`), 'verdeckt'));
    }
    const faeh = [...(k.vorteile || []), ...(k.manoever || [])];
    if (faeh.length) wrap.appendChild(infoZeile(`Faehigkeiten: ${faeh.join(', ')}`, karteDetail(a, k)));
  } else if ((k.angriffe || []).length) {
    wrap.appendChild(infoZeile(`Angriffe: ${angriffeText(k)}`, karteDetail(a, k)));
  }
}

// --- Kartenmenue (Enter / Mausklick) ------------------------------------

function oeffneKarteMenue(a, k) {
  screen.push(karteMenueScreen(k.id));
}

function karteMenueScreen(kid) {
  return {
    title: '',
    build() {
      const a = getMeister();
      const k = karteNachId(a, kid);
      if (!k) { screen.pop(); return document.createElement('div'); }
      this.title = `${k.name}, ${artWort(k)}`;
      const items = [];
      items.push({ label: 'Verbinden mit einer Karte', hint: 'eine andere Karte waehlen, mit der diese kaempft', onSelect: () => screen.push(verbindenPickerScreen(kid)) });
      const n = (k.verbindungen || []).length;
      if (n) items.push({ label: `Verbindungen loesen, ${n}`, hint: 'alle Verbindungen dieser Karte aufheben', onSelect: () => {
        loeseAlle(a, k); speichere(); screen.pop(); sprache.sage(`Alle Verbindungen von ${k.name} geloest.`);
      } });
      items.push({ label: 'Vom Tisch nehmen', hint: 'diese Karte entfernen', onSelect: () => vomTisch(k) });
      return menuScreen({
        title: `${k.name}: ${verbindungsText(a, k)}`,
        subtitle: 'Enter waehlt. Escape zurueck. Tipp: Leertaste auf der Karte verbindet direkt.',
        items,
      }).build();
    },
    onShow() {
      const a = getMeister();
      const k = karteNachId(a, kid);
      if (k) sprache.sage(`${k.name}. ${verbindungsText(a, k)}.`);
    },
  };
}

function verbindenPickerScreen(kid) {
  return {
    title: 'Verbinden',
    build() {
      const a = getMeister();
      const k = karteNachId(a, kid);
      if (!k) { screen.pop(); return document.createElement('div'); }
      const andere = (a.tisch.karten || []).filter(x => x.id !== kid);
      const items = andere.map(x => {
        const schon = (k.verbindungen || []).includes(x.id);
        return {
          label: `${x.name}, ${artWort(x)}${schon ? ' (verbunden)' : ''}`,
          hint: schon ? 'schon verbunden' : 'Enter verbindet',
          onSelect: () => {
            const neu = verbinde(k, x);
            speichere();
            sounds.playClick();
            screen.pop(); // zurueck zum Kartenmenue
            screen.refresh();
            sprache.sage(neu ? `${k.name} mit ${x.name} verbunden.` : `${k.name} und ${x.name} waren schon verbunden.`);
          },
        };
      });
      return menuScreen({
        title: `${k.name} verbinden mit`,
        subtitle: 'Enter verbindet die beiden Karten. Escape zurueck.',
        items, leer: 'Keine weiteren Karten auf dem Tisch.',
      }).build();
    },
    onShow() { sprache.sage('Karte zum Verbinden waehlen.'); },
  };
}

async function vomTisch(k) {
  const a = getMeister();
  if (!await jaNeinDialog({ titel: 'Vom Tisch nehmen', frage: `${k.name} vom Tisch nehmen?` })) return;
  loeseAlle(a, k); // Verbindungen der anderen Karten sauber aufloesen
  a.tisch.karten = a.tisch.karten.filter(x => x !== k);
  if (_aufgenommenId === k.id) _aufgenommenId = null;
  speichere();
  // Falls das Menue dieser Karte offen ist, liegt es ueber dem Spieltisch — zwei
  // Ebenen zurueck landet wieder auf dem Tisch. Ein einfacher Refresh reicht,
  // weil der Kartenmenue-Build eine fehlende Karte selbst wegpoppt.
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
      migriereVerbindungen(a);
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
          a.tisch.karten = []; _aufgenommenId = null; speichere(); screen.refresh(); sprache.sage('Tisch geleert.');
        }, 'alle Karten entfernen'));
      }

      // Karten: erst die Helden, dann Gegner und freundliche NPC. Jede Karte zeigt
      // ihre Verbindungen ("Kaempft gegen ..."); die feste Gruppierung entfaellt,
      // weil eine Karte mit mehreren zugleich verbunden sein kann.
      const helden = karten.filter(k => k.art === 'spieler');
      const andere = karten.filter(k => k.art !== 'spieler');
      if (helden.length) {
        wrap.appendChild(abschnittTitel('Helden'));
        for (const h of helden) zeichneKarte(wrap, a, h);
      }
      if (andere.length) {
        wrap.appendChild(abschnittTitel('Gegner und Verbuendete'));
        for (const g of andere) zeichneKarte(wrap, a, g);
      }

      if (!karten.length) wrap.appendChild(infoZeile('Der Tisch ist leer. Lege Helden und Gegner auf den Tisch.'));

      verbindeDetail(wrap);
      return wrap;
    },
    onShow() { sprache.sage('Spieltisch. Auf der Namenszeile verbindet die Leertaste die Karten, Enter oeffnet das Kartenmenue. Wunden mit Pfeil links und rechts.'); },
  };
}

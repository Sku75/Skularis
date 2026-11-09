/**
 * Skularis — Abenteuertisch: Zauberspeicher des Magierstabs (Play-Seite).
 *
 * Freigeschaltet durch die Vorteile "Magierstab Zauberspeicher 1" (ein Slot) und
 * "Magierstab Zauberspeicher 2" (zweiter Slot). In "Meine Initiative-Phase" gibt es
 * dann ganz unten den Menuepunkt "Zauberspeicher" mit den Slots.
 *
 * Leerer Slot + Enter: einen bekannten Zauber waehlen; er wird sofort gewuerfelt
 * (drei W20, der mittlere plus der Probenwert = Qualitaet) und im Slot abgelegt.
 * Der Malus aus Wunden und Erschoepfung zaehlt in DIESEM Moment (Entscheidung
 * 1.48): wer verletzt speichert, speichert eine schlechtere Qualitaet. Beim
 * Wirken wird nicht mehr gewuerfelt, die gespeicherte Qualitaet gilt — auch wenn
 * der Magier bis dahin genesen ist.
 * Belegter Slot + Enter: "Wirken?" - bestaetigt man, wird der Slot wieder leer.
 * Es werden KEINE Astralpunkte automatisch abgezogen. Der Zustand haengt am
 * Abenteuer (a.zauberspeicher), nicht am Charakterbogen.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { knopfDialog } from '../ui/dialog.js';
import { getAbenteuer, speichere } from './state.js';
import { getDb } from '../core/db-laden.js';
import { zauberListe } from './kampf-menues.js';
import { malusAusRessourcen, ergebnisRechnung } from '../core/malus.js';

function hatVorteil(char, n) {
  return (char.vorteile || []).some(x => (typeof x === 'string' ? x : x.name) === n);
}

/** Anzahl der Zauberspeicher-Slots (0, 1 oder 2) nach den gekauften Vorteilen. */
export function anzahlZauberspeicher(char) {
  if (hatVorteil(char, 'Magierstab Zauberspeicher 2')) return 2;
  if (hatVorteil(char, 'Magierstab Zauberspeicher 1')) return 1;
  return 0;
}

export function zauberspeicherVorhanden(char) {
  return anzahlZauberspeicher(char) > 0;
}

function mittelVon3(w) { const s = [...w].sort((a, b) => a - b); return s[1]; }

function slots(a, n) {
  a.zauberspeicher = Array.isArray(a.zauberspeicher) ? a.zauberspeicher : [];
  while (a.zauberspeicher.length < n) a.zauberspeicher.push(null);
  if (a.zauberspeicher.length > n) a.zauberspeicher.length = n; // Vorteil entfernt -> Slots weg
  return a.zauberspeicher;
}

function slotDetail(s) {
  const zeilen = [
    `${s.name}, Qualitaet ${s.qualitaet}.`,
    `Drei W20: ${(s.wuerfel || []).join(', ')}, der mittlere ${s.mittel} plus Probenwert ${s.pw}.`,
  ];
  // Die Qualitaet ist beim Laden entstanden, samt dem damaligen Malus. Deshalb
  // steht hier, wie sie zustande kam.
  if (s.malus) zeilen.push(`Beim Laden abgezogen: Malus ${s.malus} aus Wunden und Erschöpfung.`);
  if (s.wirkung) zeilen.push(`Wirkung: ${s.wirkung}`);
  if (s.kosten) zeilen.push(`Kosten: ${s.kosten}.`);
  return zeilen;
}

export function zauberspeicherScreen() {
  const scr = {
    title: 'Zauberspeicher',
    build() {
      const a = getAbenteuer();
      const char = a.charakter;
      const n = anzahlZauberspeicher(char);
      const sp = slots(a, n);
      const items = [];
      for (let i = 0; i < n; i++) {
        const s = sp[i];
        if (!s) {
          items.push({
            label: `Zauberspeicher ${i + 1}: kein Zauber geladen`,
            hint: 'Enter: einen Zauber laden (wird gewuerfelt und abgelegt)',
            onSelect: () => ladeSlot(i),
          });
        } else {
          items.push({
            label: `Zauberspeicher ${i + 1}: ${s.name}${s.kosten ? ` (Kosten ${s.kosten})` : ''}, Qualitaet ${s.qualitaet}`,
            hint: 'Enter: wirken. Shift und Pfeil-runter liest die Werte',
            detail: slotDetail(s),
            onSelect: () => wirkeSlot(i),
          });
        }
      }
      return menuScreen({
        title: 'Zauberspeicher',
        subtitle: 'Leerer Slot: Enter laedt einen Zauber. Belegter Slot: Enter wirkt ihn. Escape zurueck.',
        items, leer: 'Keine Zauberspeicher.',
      }).build();
    },
    onShow() { sprache.sage('Zauberspeicher.'); },
  };
  return scr;
}

function ladeSlot(i) {
  const a = getAbenteuer();
  const liste = zauberListe(a.charakter, getDb());
  if (!liste.length) { sprache.sage('Du kennst keine Zauber zum Laden.'); return; }
  screen.push({
    title: 'Zauber laden',
    build() {
      const items = liste.map(s => ({
        label: s.kosten ? `${s.name} (Kosten ${s.kosten})` : s.name,
        hint: `${s.fertigkeit}, Probenwert ${s.pw}. Enter laedt in den Speicher`,
        detail: s.tooltip,
        onSelect: () => speichereZauber(i, s),
      }));
      return menuScreen({
        title: `Zauber in Speicher ${i + 1}`,
        subtitle: 'Enter laedt den Zauber; er wird gewuerfelt und abgelegt. Escape zurueck.',
        items, filter: liste.length >= 10, leer: 'Keine Zauber bekannt.',
      }).build();
    },
    onShow() { sprache.sage('Zauber laden.'); },
  });
}

function speichereZauber(i, s) {
  const a = getAbenteuer();
  const w = [1 + Math.floor(Math.random() * 20), 1 + Math.floor(Math.random() * 20), 1 + Math.floor(Math.random() * 20)];
  const mittel = mittelVon3(w);
  const malus = malusAusRessourcen(a.ressourcen);
  const rechnung = ergebnisRechnung(mittel + (s.pw || 0), 0, malus);
  const qualitaet = rechnung.endwert;
  sounds.playWuerfel();
  slots(a, anzahlZauberspeicher(a.charakter))[i] = {
    name: s.name, fertigkeit: s.fertigkeit, pw: s.pw, wuerfel: w, mittel, qualitaet, malus,
    wirkung: s.wirkung || '', kosten: s.kosten || '',
  };
  speichere();
  screen.pop(); // zurueck zum Zauberspeicher-Menue
  screen.refresh();
  const malusText = malus ? ` Malus ${malus} aus Wunden und Erschöpfung ist beim Laden abgezogen.` : '';
  sprache.sage(`${s.name} in Zauberspeicher ${i + 1} geladen. ${rechnung.text}. Qualitaet ${qualitaet}. Drei W20: ${w.join(', ')}, der mittlere ${mittel} plus Probenwert ${s.pw}.${malusText}`);
}

function wirkeSlot(i) {
  const a = getAbenteuer();
  const s = (a.zauberspeicher || [])[i];
  if (!s) return;
  knopfDialog({ titel: `${s.name} wirken?`, knoepfe: [{ label: 'Wirken', wert: 'ja' }] }).then((w) => {
    if (w !== 'ja') return;
    a.zauberspeicher[i] = null;
    speichere();
    screen.refresh();
    // Beim Wirken wird NICHT gewuerfelt: die gespeicherte Qualitaet gilt.
    sprache.sage(`${s.name} gewirkt. Qualitaet ${s.qualitaet}. Zauberspeicher ${i + 1} ist wieder leer.`);
  });
}

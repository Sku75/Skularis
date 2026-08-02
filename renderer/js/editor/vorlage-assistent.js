/**
 * Skularis — kurzer Assistent, um eine Heldenvorlage zu einem eigenen Charakter
 * zu machen.
 *
 * Vier Seiten, im selben Rahmen wie der große Assistent:
 *   1. Name          der eigene Name macht aus der Vorlage einen eigenen Helden
 *   2. Aussehen      dieselbe Seite wie im großen Assistenten
 *   3. Hintergrund   ebenso
 *   4. Abschluss     speichern und weiter im freien Editor
 *
 * Die Werte der Vorlage bleiben unangetastet, geändert werden nur die
 * Freitextfelder. Das letzte Weiter speichert wie beim großen Assistenten.
 */
import * as editor from './editor.js';
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { assistentSeite, textFeld } from './assistent-seite.js';
import { aussehenInhalt } from './aussehen.js';
import { hintergrundInhalt } from './hintergrund.js';
import { wuerfleName, SPEZIES, KULTUREN } from '../daten/namen-daten.js';

/** Zufälligen aventurischen Namen erwürfeln (ohne Auswahlfenster). */
function wuerfelNameZufaellig() {
  const sp = SPEZIES[Math.floor(Math.random() * SPEZIES.length)];
  const ku = KULTUREN[Math.floor(Math.random() * KULTUREN.length)];
  const ge = Math.random() < 0.5 ? 'maennlich' : 'weiblich';
  return wuerfleName(sp, ku, ge);
}

const SCHRITTE = ['Name', 'Aussehen', 'Hintergrund', 'Abschluss'];
let index = 0;
let vorlagenName = '';
let vorlagenGesamt = 0;   // Gesamt-EP der Vorlage; darunter darf man nicht fallen.

function gehe(zu) {
  index = Math.max(0, Math.min(SCHRITTE.length - 1, zu));
  zeigeSeite();
}

function zeigeSeite() {
  screen.replace(baueSeite(SCHRITTE[index]));
}

function rahmen(o) {
  return assistentSeite({
    schritt: index + 1,
    gesamt: SCHRITTE.length,
    onZurueck: () => { if (index === 0) editor.oeffneNeuSeite(); else gehe(index - 1); },
    onVor: () => gehe(index + 1),
    onBack: editor.darfVerlassen,
    ...o,
  });
}

function baueSeite(key) {
  switch (key) {
    case 'Name': return nameSeite();
    case 'Aussehen': return aussehenSeite();
    case 'Hintergrund': return hintergrundSeite();
    default: return abschlussSeite();
  }
}

function nameSeite() {
  let feld = null;
  let apFeld = null;
  return rahmen({
    titel: 'Name deines Helden',
    info: `Du gestaltest die Vorlage ${vorlagenName} zu einem eigenen Charakter. Gib ihm zuerst `
      + 'einen eigenen Namen. Unter dem Namen kannst du die gewünschten Gesamt-Erfahrungspunkte '
      + 'festlegen. Alle Werte, Vorteile und die Ausrüstung der Vorlage bleiben erhalten.',
    infoDetail: `Die Vorlage bringt ${vorlagenGesamt} Erfahrungspunkte mit. Du kannst diesen Wert `
      + 'erhöhen; die zusätzlichen Punkte stehen danach frei zum Verteilen. Niedriger als die '
      + 'Vorlage geht nicht, weil ihre Punkte schon ausgegeben sind. Ändern kannst du später im '
      + 'freien Editor alles.',
    inhalt: (box) => {
      const char = editor.getChar();
      feld = textFeld({ label: 'Name des Charakters', id: 'vorlage-name', wert: char.name || '' });
      feld.__detail = 'Der Name deines Helden. Standard ist der Name der Vorlage, den du überschreiben kannst.';
      box.appendChild(feld);

      // "Name würfeln"-Knopf direkt unter dem Namensfeld: setzt einen zufälligen
      // Namen ins Feld, erneut drücken bringt den nächsten.
      const wuerfelBtn = document.createElement('button');
      wuerfelBtn.type = 'button';
      wuerfelBtn.className = 'db-btn ed-aktion';
      wuerfelBtn.textContent = 'Name würfeln';
      wuerfelBtn.setAttribute('aria-label', 'Name würfeln. Setzt einen zufälligen Namen ins Namensfeld. Erneut drücken für den nächsten.');
      wuerfelBtn.addEventListener('click', () => {
        const name = wuerfelNameZufaellig();
        feld.__eingabe.value = name;
        sounds.playWuerfel();
        sprache.sage(name);
      });
      box.appendChild(wuerfelBtn);

      apFeld = textFeld({
        label: 'Gewünschte Gesamt-Erfahrungspunkte',
        id: 'vorlage-ap', typ: 'number', min: vorlagenGesamt,
        wert: String(char.erfahrung.gesamt || vorlagenGesamt),
        hint: `mindestens ${vorlagenGesamt}, die Punkte der Vorlage werden aufgefüllt`,
      });
      apFeld.__detail = `Die Gesamtzahl der Erfahrungspunkte deines Helden. Die Vorlage nutzt `
        + `${vorlagenGesamt}. Erhöhst du den Wert, bleiben die zusätzlichen Punkte frei zum Verteilen.`;
      box.appendChild(apFeld);
    },
    uebernehmen: () => {
      const char = editor.getChar();
      if (feld && feld.__eingabe.value.trim()) char.name = feld.__eingabe.value.trim();
      if (apFeld) {
        const wunsch = parseInt(apFeld.__eingabe.value, 10);
        // Nie unter die Punkte der Vorlage; die sind bereits ausgegeben.
        char.erfahrung.gesamt = Math.max(vorlagenGesamt, Number.isFinite(wunsch) ? wunsch : vorlagenGesamt);
        editor.aktualisiere();
      }
    },
    pruefe: () => (editor.getChar().name || '').trim() ? '' : 'Bitte gib deinem Helden einen Namen.',
  });
}

function aussehenSeite() {
  let api = null;
  return rahmen({
    titel: 'Aussehen',
    info: 'Beschreibe, wie dein Held aussieht. Alles ist freiwillig. Die Vorlage bringt hier '
      + 'meist nichts mit, du gestaltest also frei.',
    infoDetail: 'Sieben beschriftete Felder und sechs freie Zeilen, genau wie im großen '
      + 'Assistenten und wie in Sephrasto.',
    inhalt: (box) => { api = aussehenInhalt(box); },
    uebernehmen: () => api && api.uebernehmen(),
    zuruecksetzen: () => api && api.zuruecksetzen(),
  });
}

function hintergrundSeite() {
  let api = null;
  return rahmen({
    titel: 'Familie, Hintergrund und Herkunft',
    info: 'Neun freie Zeilen für die Geschichte deines Helden. Woher kommt er, wer gehört zu ihm?',
    infoDetail: 'Reine Beschreibung ohne Regelwirkung, dieselbe Seite wie im großen Assistenten.',
    inhalt: (box) => { api = hintergrundInhalt(box); },
    uebernehmen: () => api && api.uebernehmen(),
    zuruecksetzen: () => api && api.zuruecksetzen(),
  });
}

function abschlussSeite() {
  return rahmen({
    titel: 'Fertig',
    info: 'Dein Held ist bereit. Drücke auf Weiter, dann wird er gespeichert und im freien Editor '
      + 'geöffnet, wo du alles weiter anpassen kannst.',
    infoDetail: 'Beim Speichern entsteht eine eigene Charakterdatei unter Meine Charaktere. Die '
      + 'Vorlage selbst bleibt unverändert und lässt sich erneut verwenden.',
    vorLabel: 'ein Schritt vor, speichern und in den Editor',
    onVor: async () => {
      await editor.speichere();
      editor.oeffneHub();
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
      zeile(`Aus der Vorlage ${vorlagenName}`);
      zeile(`Erfahrungspunkte: ${char.erfahrung.gesamt} gesamt, ${char.erfahrung.ausgegeben} ausgegeben, ${frei} frei`);
    },
  });
}

export function starteVorlageAssistent(name) {
  vorlagenName = name;
  // Die Gesamt-EP der Vorlage merken — sie sind der untere Anschlag für das
  // Wunsch-EP-Feld auf der Namensseite.
  vorlagenGesamt = editor.getChar()?.erfahrung?.gesamt || 0;
  index = 0;
  zeigeSeite();
}

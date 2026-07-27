/**
 * Skularis — Erstellungs-Tool (freier Editor)
 * Verwaltet den aktuellen Charakter + Datenbank, den Editor-Hub (mit Live-EP),
 * das Speichern als Charakterdatei und den Wechsel in die Bereiche.
 *
 * Reihenfolge der Bereiche im Hub: sie folgt dem Aufbau des Charakterbogens
 * (Beschreibung, Aussehen, Status, Eigenheiten, Attribute, Fertigkeiten,
 * Vorteile, Übernatürliches, Ausrüstung). Die Erfahrungspunkte stehen bewusst
 * ganz unten, direkt über "Charakter speichern".
 *
 * Escape auf der obersten Editor-Ebene fragt nach, bevor der Charakter
 * verworfen wird (darfVerlassen). Escape im Nachfrage-Dialog bedeutet
 * "weiter bearbeiten" — mehrfaches Escape verwirft also nie versehentlich.
 */

import * as screen from '../ui/screen.js';
import { menuScreen } from '../ui/menu-screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { ladeDb } from '../core/db-laden.js';
import { createCharakter, neuberechne, verfuegbareEP } from '../core/character.js';
import { serialisiere } from '../core/sephrasto-xml.js';
import { zahlDialog, jaNeinDialog } from '../ui/dialog.js';

const ipc = window.skularis?.ipc;

let db = null;
let char = null;

export function getChar() { return char; }
export function getDb() { return db; }
export function setChar(c) { char = c; }

/** Den Editor-Hub anzeigen (vom Assistenten nach der Paketauswahl genutzt). */
export function oeffneHub() {
  aktualisiere();
  screen.replace(hub);
}

/** Zurück auf die Einstiegsseite "Neuen Charakter erstellen". */
export function oeffneNeuSeite() {
  screen.replace(neuScreen());
}

/** Direkt in Fertigkeiten und Talente springen (Ende der assistierten Führung). */
export function oeffneFertigkeiten() {
  import('./fertigkeiten.js').then(m => screen.push(m.fertigkeitenScreen()))
    .catch(() => sprache.sage('Fertigkeiten-Bereich konnte nicht geöffnet werden.'));
}

/** EP neu berechnen; gibt die verfügbaren EP zurück. */
export function aktualisiere() {
  neuberechne(char, db);
  return verfuegbareEP(char);
}

/** Kurze EP-Ansage-Zusatzinfo (für wertZeile.onChange). */
export function epAnsage() {
  return `${aktualisiere()} EP frei`;
}

/**
 * Escape-Wächter der obersten Editor-Ebene: fragt nach, bevor die
 * Charaktererstellung verlassen wird.
 * @returns {Promise<boolean>} true, wenn wirklich verlassen werden soll
 */
export async function darfVerlassen() {
  return jaNeinDialog({
    titel: 'Charaktererstellung beenden',
    frage: 'Charaktererstellung wirklich beenden? Nicht gespeicherte Änderungen gehen verloren.',
    jaLabel: 'Verwerfen und beenden',
    neinLabel: 'Weiter bearbeiten',
  });
}

// --- Start: neuen Charakter anlegen ---

export async function starteNeu() {
  db = await ladeDb();
  char = createCharakter(db, { name: '', gesamtEP: 0 });
  screen.push(neuScreen());
}

/** Vorhandenen Charakter (bereits geparst) im Editor öffnen. */
export async function bearbeite(vorhandenerChar) {
  db = await ladeDb();
  char = vorhandenerChar;
  aktualisiere();
  screen.push(hub);
}

/**
 * Einen geparsten Charakter als aktuellen übernehmen, ohne einen Bildschirm zu
 * öffnen. Für die Vorlagen-Übernahme: danach führt der Mini-Assistent, und der
 * ruft am Ende oeffneHub und speichere wie der große Assistent.
 */
export async function uebernimmCharakter(vorhandenerChar) {
  db = await ladeDb();
  char = vorhandenerChar;
  aktualisiere();
}

/**
 * Einstieg der Charaktererstellung: zuerst die Methode wählen. Name und
 * Erfahrungspunkte kommen erst danach — bei freiem Editor und Assistent auf einer
 * eigenen Stammdaten-Seite, bei der Vorlage im Mini-Assistenten (dort lässt sich
 * die gewünschte Gesamt-EP-Zahl festlegen, die Vorlagenpunkte werden aufgefüllt).
 */
function neuScreen() {
  return menuScreen({
    title: 'Neuen Charakter erstellen',
    subtitle: 'Wähle, wie du deinen Charakter erstellen möchtest. Escape zurück.',
    filter: false,
    items: [
      {
        label: 'Freier Editor',
        hint: 'Alles selbst festlegen',
        detail: 'Du gibst Name und Erfahrungspunkte an und bearbeitest danach alle Bereiche frei. '
          + 'Für erfahrene Spielerinnen und Spieler, die nichts geführt bekommen möchten.',
        onSelect: () => screen.push(stammdatenScreen('Freier Editor', () => screen.replace(hub))),
      },
      {
        label: 'Assistierte Erstellung',
        hint: 'Schritt für Schritt geführt',
        detail: 'Du gibst Name und Erfahrungspunkte an und wirst danach Seite für Seite durch '
          + 'Spezies, Kultur, Profession und die weiteren Schritte geführt.',
        onSelect: () => screen.push(stammdatenScreen('Assistierte Erstellung', () => {
          import('./assistent.js').then(m => m.starteAssistent())
            .catch((e) => {
              console.error('Assistent:', e);
              sprache.sage('Assistent konnte nicht geöffnet werden, starte freien Editor.');
              screen.replace(hub);
            });
        })),
      },
      {
        label: 'Erstellen aus Vorlage',
        hint: 'Von einem fertigen Helden ausgehen',
        detail: 'Du wählst einen fertigen Beispielhelden. Danach gibst du ihm einen eigenen Namen und '
          + 'kannst die gewünschten Gesamt-Erfahrungspunkte festlegen; die Punkte der Vorlage werden '
          + 'auf diesen Wert aufgefüllt, der Rest bleibt zum Verteilen.',
        onSelect: () => import('../screens/vorlagen.js').then(m => m.oeffneVorlagen())
          .catch((e) => { console.error('Vorlagen:', e); sprache.sage('Vorlagen konnten nicht geöffnet werden.'); }),
      },
      {
        label: 'Abbrechen',
        hint: 'Zurück ohne zu erstellen',
        onSelect: () => { sounds.playSchliessen(); screen.pop(); },
      },
    ],
  });
}

/**
 * Stammdaten-Seite für freien Editor und Assistent: Name und Gesamt-EP. Nach dem
 * Bestätigen übernimmt onWeiter (Editor-Hub öffnen oder Assistent starten).
 */
function stammdatenScreen(titel, onWeiter) {
  return {
    title: titel,
    // Escape geht zur Methodenauswahl zurück, ohne die Erstellung abzubrechen.
    onBack: async () => true,
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu';

      const feld = (labelText, id, typ, wert) => {
        const box = document.createElement('div');
        box.className = 'db-row ed-feld';
        const label = document.createElement('label');
        label.className = 'ed-feld__label';
        label.setAttribute('for', id);
        label.textContent = labelText;
        const input = document.createElement('input');
        input.className = 'db-input';
        input.id = id;
        input.type = typ;
        if (typ === 'number') { input.inputMode = 'numeric'; input.min = '0'; }
        input.value = wert;
        input.setAttribute('aria-label', labelText);
        box.appendChild(label);
        box.appendChild(input);
        wrap.appendChild(box);
        return input;
      };

      const nameInput = feld('Name des Charakters', 'ed-name', 'text', char.name || '');
      const epInput = feld('Erfahrungspunkte gesamt', 'ed-gesamt', 'number', String(char.erfahrung.gesamt || 0));

      const weiter = () => {
        char.name = nameInput.value.trim();
        char.erfahrung.gesamt = parseInt(epInput.value, 10) || 0;
        aktualisiere();
        sounds.playClick();
        onWeiter();
      };

      const knopf = (label, primary, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'db-btn ed-aktion' + (primary ? ' db-btn--primary' : '');
        b.textContent = label;
        b.addEventListener('click', onClick);
        wrap.appendChild(b);
        return b;
      };

      knopf('Weiter', true, weiter);
      knopf('Zurück zur Methodenauswahl', false, () => { sounds.playSchliessen(); screen.pop(); });
      return wrap;
    },
  };
}

// --- Editor-Hub (Live-EP, Bereiche, Speichern) ---

/** Ein Bereich des freien Editors: Modul, Fabrikfunktion, Beschriftung. */
function bereich(label, hint, modul, fabrik) {
  return {
    label,
    hint,
    onSelect: () => import(modul).then(m => screen.push(m[fabrik]()))
      .catch((e) => { console.error(label, e); sprache.sage(`${label} konnte nicht geöffnet werden.`); }),
  };
}

const hub = {
  title: '',
  onBack: darfVerlassen,
  build() {
    const frei = aktualisiere();
    const name = char.name || 'ohne Namen';
    hub.title = `Editor: ${name}, ${frei} von ${char.erfahrung.gesamt} EP frei`;

    // Der Bereich Übernatürliches erscheint nur, wenn der Charakter durch seine
    // Vorteile überhaupt übernatürliche Fertigkeiten hat. Ein nichtmagischer
    // Charakter braucht die Kategorie nicht.
    const uebernatAnzahl = Object.keys(char.uebernatuerlich || {}).length;
    const items = [
      bereich('Beschreibung', 'Name, Heimat, Spezies', './beschreibung.js', 'beschreibungScreen'),
      bereich('Aussehen', 'Geschlecht, Geburtsdatum, Größe, Gewicht, Haare, Augen, Titel und sechs freie Zeilen',
        './aussehen.js', 'aussehenScreen'),
      bereich('Familie, Hintergrund und Herkunft', 'Neun freie Zeilen wie auf dem Charakterbogen',
        './hintergrund.js', 'hintergrundScreen'),
      bereich('Status und Finanzen', 'Gesellschaftlicher Stand, Startkapital, Schicksalspunkte', './status-finanzen.js', 'statusFinanzenScreen'),
      bereich('Eigenheiten', 'Stärken und Schwächen deines Charakters', './eigenheiten.js', 'eigenheitenScreen'),
      bereich('Attribute', 'Die acht Grundeigenschaften', './attribute.js', 'attributeScreen'),
      bereich('Fertigkeiten und Talente', 'Profane Fertigkeiten und ihre Talente', './fertigkeiten.js', 'fertigkeitenScreen'),
      bereich('Vorteile', 'Vor- und Nachteile', './vorteile.js', 'vorteileScreen'),
      ...(uebernatAnzahl ? [bereich('Übernatürliches',
        `${uebernatAnzahl} Fertigkeiten aus deinen Traditionen: Zauber, Liturgien, Anrufungen`,
        './uebernatuerliches.js', 'uebernatuerlichesScreen')] : []),
      bereich('Ausrüstung', 'Waffen, Rüstungen, Gegenstände', './ausruestung.js', 'ausruestungScreen'),
      {
        label: `Erfahrungspunkte: ${char.erfahrung.gesamt} gesamt, ${frei} frei`,
        hint: 'Gesamt-EP ändern',
        onSelect: () => aendereGesamtEP(),
      },
      {
        label: 'Charakter speichern',
        hint: 'In Meine Charaktere ablegen',
        onSelect: () => speichere(),
      },
      {
        label: 'Charakter speichern und schließen',
        hint: 'Speichern und den Editor verlassen',
        onSelect: () => speichernUndSchliessen(),
      },
      {
        label: 'Charakterbogen-Ansicht',
        hint: 'Alle Werte ansehen, wie am Spieltisch',
        detail: 'Zeigt den vollständigen Charakterbogen zum Durchlesen, dieselbe Ansicht wie am '
          + 'Spieltisch. Nichts wird dabei verändert.',
        onSelect: () => zeigeBogen(),
      },
      {
        label: 'Charakter schließen',
        hint: 'Den Editor verlassen, mit Rückfrage',
        onSelect: () => schliesse(),
      },
    ];

    return menuScreen({
      title: hub.title,
      subtitle: 'Pfeiltasten wählen, Eingabetaste öffnet, Escape zurück.',
      items,
      filter: false, // festes Menü: kein "Filtern" davor, die Reihenfolge ist die Ansage
    }).build();
  },
};

async function aendereGesamtEP() {
  const eingabe = await zahlDialog({ titel: 'Erfahrungspunkte gesamt', label: 'Gesamt-EP', wert: char.erfahrung.gesamt, min: 0, max: 100000 });
  if (eingabe === null || eingabe === undefined) return;
  char.erfahrung.gesamt = eingabe;
  aktualisiere();
  screen.refresh();
}

export async function speichere() {
  try {
    aktualisiere();
    const xml = serialisiere(char, db);
    const name = char.name || 'Neuer Charakter';
    const res = await ipc.bibliothekSpeichern({ name, inhalt: xml });
    char.dateiname = res.pfad;
    sounds.playSpeichern();
    sprache.sage(`Charakter ${res.name} gespeichert. ${verfuegbareEP(char)} EP frei.`);
    return true;
  } catch (e) {
    console.error('Speichern fehlgeschlagen:', e);
    sounds.playError();
    sprache.sage('Speichern fehlgeschlagen.');
    return false;
  }
}

/** Speichern und danach den Editor verlassen, zurück auf die vorige Ebene. */
async function speichernUndSchliessen() {
  if (await speichere()) {
    screen.pop();
    sprache.sageZusatz('Editor geschlossen.');
  }
}

/** Den Charakterbogen des aktuellen Charakters zeigen, dieselbe Ansicht wie am Spieltisch. */
function zeigeBogen() {
  import('../abenteuer/charakterbogen.js')
    .then(m => screen.push(m.baueCharakterbogen(char, db, `Bogen: ${char.name || 'ohne Namen'}`)))
    .catch((e) => { console.error('Charakterbogen:', e); sprache.sage('Charakterbogen konnte nicht geöffnet werden.'); });
}

/** Den Editor mit Rückfrage schließen (verwirft nicht gespeicherte Änderungen). */
async function schliesse() {
  if (await darfVerlassen()) screen.pop();
}

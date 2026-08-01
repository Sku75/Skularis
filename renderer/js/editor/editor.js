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
import * as reiterHub from '../ui/reiter-hub.js';
import { ladeDb } from '../core/db-laden.js';
import { createCharakter, neuberechne, verfuegbareEP } from '../core/character.js';
import { zeigeEP } from '../ui/ep-anzeige.js';
import { serialisiere } from '../core/sephrasto-xml.js';
import { zahlDialog, jaNeinDialog, knopfDialog } from '../ui/dialog.js';
import { beschreibungScreen } from './beschreibung.js';
import { aussehenScreen } from './aussehen.js';
import { hintergrundScreen } from './hintergrund.js';
import { statusFinanzenScreen } from './status-finanzen.js';
import { eigenheitenScreen } from './eigenheiten.js';
import { attributeScreen } from './attribute.js';
import { fertigkeitenScreen } from './fertigkeiten.js';
import { vorteileScreen } from './vorteile.js';
import { uebernatuerlichesScreen } from './uebernatuerliches.js';
import { ausruestungScreen } from './ausruestung.js';

const ipc = window.skularis?.ipc;

let db = null;
let char = null;
let _offen = false; // ob der Editor-Hub gerade offen ist (fuer die Beenden-Abfrage)

export function getChar() { return char; }
export function getDb() { return db; }
export function setChar(c) { char = c; }
/** Ist der Charakter-Editor gerade geoeffnet? (fuer Strg+Q / Fenster schliessen) */
export function editorOffen() { return _offen; }

/** Den Editor-Hub anzeigen (vom Assistenten nach der Paketauswahl genutzt). */
export function oeffneHub() {
  oeffneEditorHub(true);
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
  oeffneEditorHub(false);
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
        onSelect: () => screen.push(stammdatenScreen('Freier Editor', () => oeffneEditorHub(true))),
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
              oeffneEditorHub(true);
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

// --- Editor-Hub (F-Tasten, Live-EP, Bereiche, Speichern) ---

let editorHub = null;

/** Hub-Titel mit den live berechneten freien EP. */
function editorTitel() {
  const frei = aktualisiere();
  // Feste EP-Anzeige unten mittig mitziehen (Sichtbar, solange der Editor offen ist).
  zeigeEP(frei, char.erfahrung.gesamt || 0);
  return `Editor: ${char.name || 'ohne Namen'}, ${frei} von ${char.erfahrung.gesamt} EP frei`;
}

/** Die Bereiche und Aktionen des Editors als Reiter-Hub-Punkte (mit F-Tasten). */
function editorPunkte() {
  const uebernatAnzahl = Object.keys(char.uebernatuerlich || {}).length;
  const punkte = [
    { label: 'Beschreibung', hint: 'Name, Heimat, Spezies', factory: () => beschreibungScreen() },
    { label: 'Aussehen', hint: 'Geschlecht, Größe, Haare, Augen, Titel und freie Zeilen', factory: () => aussehenScreen() },
    { label: 'Familie, Hintergrund und Herkunft', hint: 'Freie Zeilen wie auf dem Charakterbogen', factory: () => hintergrundScreen() },
    { label: 'Status und Finanzen', hint: 'Stand, Startkapital, Schicksalspunkte', factory: () => statusFinanzenScreen() },
    { label: 'Eigenheiten', hint: 'Stärken und Schwächen deines Charakters', factory: () => eigenheitenScreen() },
    { label: 'Attribute', hint: 'Die acht Grundeigenschaften', factory: () => attributeScreen() },
    { label: 'Fertigkeiten und Talente', hint: 'Profane Fertigkeiten und ihre Talente', factory: () => fertigkeitenScreen() },
    { label: 'Vorteile', hint: 'Vor- und Nachteile', factory: () => vorteileScreen() },
  ];
  if (uebernatAnzahl) punkte.push({ label: 'Übernatürliches', hint: `${uebernatAnzahl} Fertigkeiten: Zauber, Liturgien, Anrufungen`, factory: () => uebernatuerlichesScreen() });
  punkte.push({ label: 'Ausrüstung', hint: 'Waffen, Rüstungen, Gegenstände', factory: () => ausruestungScreen() });
  punkte.push({ label: 'Erfahrungspunkte ändern', hint: 'Gesamt-EP anpassen', aktion: () => aendereGesamtEP() });
  punkte.push({ label: 'Charakterbogen-Ansicht', hint: 'Alle Werte zum Durchlesen', aktion: () => zeigeBogen() });
  punkte.push({ label: 'Charakter speichern', hint: 'In Meine Charaktere ablegen', aktion: () => speichere() });
  punkte.push({ label: 'Charakter speichern und schließen', hint: 'Speichern und Editor verlassen', aktion: () => speichernUndSchliessen() });
  return punkte;
}

/** Den Editor-Hub mit F-Tasten öffnen. ersetzen: die Stammdaten-Seite ersetzen. */
export function oeffneEditorHub(ersetzen) {
  aktualisiere();
  _offen = true;
  editorHub = reiterHub.oeffneHub({
    titel: editorTitel,
    subtitle: 'Mit F1 bis F12 direkt zum Bereich. Escape verlässt die Erstellung.',
    ersetzen: !!ersetzen,
    punkte: editorPunkte(),
    beimVerlassen: async () => {
      const w = await knopfDialog({
        titel: 'Charaktererstellung',
        knoepfe: [
          { label: 'Speichern und schließen', wert: 'ja' },
          { label: 'Verwerfen und schließen', wert: 'nein' },
          { label: 'Weiter bearbeiten', wert: 'abbrechen' },
        ],
      });
      if (w === 'ja') await speichere();
      if (w === 'ja' || w === 'nein') _offen = false;
      return w || 'abbrechen';
    },
  });
}

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
    _offen = false;
    if (editorHub) editorHub.verlasse(); else screen.pop();
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
  if (await darfVerlassen()) { _offen = false; screen.pop(); }
}

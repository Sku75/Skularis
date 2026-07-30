/**
 * Skularistool — Meister-Tisch (dritter Hauptbereich).
 *
 * Einstieg mit drei Wegen wie am Spielertisch: erstellen, oeffnen und bearbeiten,
 * spielen. Danach ein Reiter-Hub, dessen Punkte je eine F-Taste tragen (F1 bis
 * F12 von oben): so springt man direkt von Menue zu Menue, jedes bleibt an seiner
 * letzten Fokusstelle. Meisterabenteuer liegen im eigenen Ordner Meisterabenteuer.
 *
 * Wichtig: der Meistertisch schreibt KEINE Punkte in die Charakterboegen. Beim
 * Abschluss werden die vergebenen Erfahrungspunkte nur ins Protokoll geschrieben;
 * die Spieler tragen sie selbst an ihrem Abenteuertisch ein.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { auswahlScreen } from '../ui/auswahl-screen.js';
import { textDialog, zahlDialog, knopfDialog, jaNeinDialog, spinnerDialog, erschwernisDialog } from '../ui/dialog.js';
import { zeigeErgebnis } from '../abenteuer/wuerfel-kern.js';
import * as reiterHub from '../ui/reiter-hub.js';
import { ladeDb, getDb } from '../core/db-laden.js';
import { createMeisterAbenteuer, parseMeisterAbenteuer, protokolliere } from '../core/meister-abenteuer.js';
import { getMeister, setMeister, speichere } from '../meister/state.js';
import { gruppenzusammenstellungScreen, gruppenboegenScreen } from '../meister/gruppe.js';
import { gruppenrechercheScreen, gruppenprobeScreen } from '../meister/gruppenrecherche.js';
import { gegnerkarteiScreen } from '../meister/gegnerkartei.js';
import { gegnerBibliothekScreen } from '../meister/gegner-bibliothek.js';
import { spieltischScreen } from '../meister/spieltisch.js';
import { szenenBereichScreen } from '../meister/szenen-spielen.js';
import { texteScreen } from '../meister/texte.js';
import { meisterNotizenScreen } from '../meister/notizen.js';
import { verdeckterWurf } from '../meister/wuerfel.js';
import { regelnScreen } from './regeln.js';

const ipc = window.skularis?.ipc;

// Einstiegs-Bildschirm des Meister-Tisches; beim Verlassen des Hubs kehrt der
// Fokus hierher zurueck (nicht in ein Zwischenmenue).
let _einstieg = null;

export function oeffne() {
  _einstieg = einstiegScreen();
  screen.push(_einstieg);
}

function einstiegScreen() {
  return menuScreen({
    title: 'Meister-Tisch',
    subtitle: 'Escape kehrt zum Hauptmenue zurueck.',
    items: [
      { label: 'Meisterabenteuer erstellen', hint: 'Name eingeben, dann Helden hinzufuegen', onSelect: erstellen },
      { label: 'Meisterabenteuer oeffnen und bearbeiten', hint: 'Vorbereiten, ohne zu spielen', onSelect: () => oeffnen('bearbeiten') },
      { label: 'Meisterabenteuer spielen, Spielabend oeffnen', hint: 'In den Spielabend', onSelect: () => oeffnen('spielen') },
    ],
  });
}

async function erstellen() {
  const name = await textDialog({ titel: 'Neues Meisterabenteuer', label: 'Name des Meisterabenteuers' });
  if (name === null || !name.trim()) return;
  try {
    await ladeDb();
    const a = createMeisterAbenteuer(name.trim());
    protokolliere(a, `Meisterabenteuer ${a.name} erstellt.`);
    setMeister(a);
    await speichere();
    sounds.playOeffnen();
    oeffneHub('bearbeiten');
    sprache.sage(`Meisterabenteuer ${a.name} erstellt. Fuege unter Gruppenzusammenstellung deine Helden hinzu.`);
  } catch (e) {
    console.error('Meisterabenteuer erstellen:', e);
    sprache.sage('Meisterabenteuer konnte nicht erstellt werden.');
  }
}

async function oeffnen(modus) {
  let liste = [];
  try { liste = await ipc.meisterListe(); } catch { liste = []; }
  if (!liste.length) { sprache.sage('Noch keine Meisterabenteuer gespeichert.'); return; }
  screen.push(meisterListeScreen(modus, liste));
}

/** Liste der Meisterabenteuer; Enter oeffnet ein Untermenue (oeffnen/loeschen). */
function meisterListeScreen(modus, liste) {
  return {
    title: modus === 'spielen' ? 'Meisterabenteuer zum Spielen' : 'Meisterabenteuer zum Bearbeiten',
    build() {
      const items = liste.map(a => ({
        label: a.name,
        hint: 'Enter: oeffnen oder loeschen',
        onSelect: () => screen.push(meisterEintragScreen(modus, a, liste)),
      }));
      return menuScreen({ title: this.title, subtitle: 'Escape zurueck.', items, leer: 'Noch keine Meisterabenteuer.' }).build();
    },
  };
}

function meisterEintragScreen(modus, eintrag, liste) {
  const oeffnenLabel = modus === 'spielen' ? 'Zum Spielen oeffnen' : 'Zum Bearbeiten oeffnen';
  return {
    title: eintrag.name,
    build() {
      return menuScreen({
        title: eintrag.name,
        subtitle: 'Escape zurueck.',
        items: [
          {
            label: oeffnenLabel,
            onSelect: async () => {
              try {
                await ladeDb();
                const r = await ipc.meisterLaden(eintrag.pfad);
                const a = parseMeisterAbenteuer(r.inhalt);
                a._pfad = eintrag.pfad;
                setMeister(a);
                sounds.playOeffnen();
                oeffneHub(modus);
              } catch (e) {
                console.error('Meisterabenteuer laden:', e);
                sprache.sage('Meisterabenteuer konnte nicht geladen werden.');
              }
            },
          },
          {
            label: 'Loeschen',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Loeschen', frage: `Meisterabenteuer ${eintrag.name} wirklich loeschen?` })) return;
              try { await ipc.meisterLoeschen(eintrag.pfad); } catch (e) { console.error('loeschen:', e); }
              const i = liste.indexOf(eintrag);
              if (i >= 0) liste.splice(i, 1);
              screen.pop();
              screen.refresh();
              sprache.sage(`${eintrag.name} geloescht.`);
            },
          },
        ],
      }).build();
    },
  };
}

// --- Hub mit F-Tasten ---

function oeffneHub(modus) {
  const a = getMeister();
  const titel = `${a.name}, Spieltag ${a.spieltag}${modus === 'bearbeiten' ? ', Bearbeiten' : ''}`;

  let hub;
  const regelHelden = () => (getMeister().charaktere || []).map(c => ({ name: c.name, charakter: c.bogen }));

  const punkte = [
    { label: 'Gruppenrecherche', hint: 'Werte der Gruppe abfragen und verdeckt wuerfeln', factory: () => gruppenrechercheScreen() },
    { label: 'Gruppenprobe', hint: 'die ganze Gruppe gegen eine Schwierigkeit', factory: () => gruppenprobeScreen() },
    { label: 'Szenen und Spieltisch', hint: 'Szenenpacks vorbereiten, Szenen spielen, freier Tisch', factory: () => szenenBereichScreen() },
    { label: 'Gegner-Bibliothek', hint: 'Gesamtliste und Kategorien, Gegner in die Auswahl uebernehmen', factory: () => gegnerBibliothekScreen() },
    { label: 'Freundliche NPC', hint: 'Meister-NPC verwalten', factory: () => gegnerkarteiScreen('freund') },
    { label: 'Charakterboegen der Gruppe', hint: 'Boegen ansehen', factory: () => gruppenboegenScreen() },
    { label: 'Abenteuertexte', hint: 'txt-Dokumente lesen, mit Lesezeichen', factory: () => texteScreen() },
    { label: 'Meister-Notizen und Werkzeuge', hint: 'geheime Notizen, Vorlesetexte, Zufallstabellen', factory: () => meisterNotizenScreen() },
    { label: 'Regelnachschlagewerk', hint: 'alle Regeln, mit Hinweis welcher Held sie hat', factory: () => regelnScreen({ db: getDb(), helden: regelHelden(), titel: 'Regelnachschlagewerk' }) },
    { label: 'Protokoll', hint: 'was im Abenteuer passiert ist', factory: () => protokollScreen() },
    { label: 'Gruppenzusammenstellung', hint: 'Helden hinzufuegen und entfernen', factory: () => gruppenzusammenstellungScreen() },
    { label: 'Verdeckter Meister-Wurf', hint: 'schnell und leise wuerfeln', ergebnisId: 'meisterwurf', aktion: () => verdeckterMeisterWurf() },
    { label: 'Zwischenspeichern', hint: 'Spielstand sichern', aktion: async () => { await speichere(); sounds.playSpeichern(); sprache.sage('Zwischengespeichert.'); } },
  ];

  if (modus === 'spielen') {
    punkte.push({ label: 'Spielabend abschliessen', hint: 'Erfahrungspunkte ins Protokoll, dann schliessen', aktion: () => spielabendAbschliessen(hub) });
  }
  punkte.push({ label: 'Speichern und schliessen', hint: 'sichern und zum Meister-Tisch zurueck', aktion: async () => { await speichere(); sounds.playSpeichern(); sprache.sage('Gespeichert.'); hub.verlasse(); } });

  hub = reiterHub.oeffneHub({
    titel, subtitle: 'Mit F1 bis F12 direkt zum Menue. Escape verlaesst den Bereich.', punkte,
    zurueckAuf: _einstieg,
    beimVerlassen: async () => {
      const w = await knopfDialog({
        titel: 'Meister-Tisch verlassen',
        knoepfe: [
          { label: 'Speichern und schliessen', wert: 'ja' },
          { label: 'Schliessen ohne Speichern', wert: 'nein' },
          { label: 'Abbrechen', wert: 'abbrechen' },
        ],
      });
      if (w === 'ja') { await speichere(); sounds.playSpeichern(); }
      return w || 'abbrechen';
    },
  });
}

function protokollScreen() {
  return {
    title: 'Protokoll',
    build() {
      const a = getMeister();
      const items = (a.protokoll || []).map(p => ({ label: `Spieltag ${p.spieltag}: ${p.text}`, detail: p.zeit || '', onSelect: () => {} }));
      return menuScreen({ title: 'Protokoll', subtitle: 'Neueste oben. Escape zurueck.', items, leer: 'Noch keine Eintraege.' }).build();
    },
  };
}

async function verdeckterMeisterWurf() {
  // Einheitlicher Spinner-Ablauf wie bei den Spielerproben: erst Anzahl, dann
  // Wuerfeltyp, dann die Erschwernis. Danach wird verdeckt gewuerfelt und das
  // Ergebnis hinter den Menuepunkt F12 geschrieben und angesagt.
  const anzahl = await spinnerDialog({ titel: 'Anzahl Wuerfel', optionen: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], index: 0, format: (v) => `${v} Wuerfel` });
  if (anzahl === null) return;
  const seiten = await spinnerDialog({ titel: 'Wuerfeltyp', optionen: [6, 20], index: 1, format: (v) => `W${v}` });
  if (seiten === null) return;
  const ersch = await erschwernisDialog({ titel: 'Erschwernis', wert: 0 });
  if (ersch === null) return;

  const a = getMeister();
  const wuerfe = [];
  for (let i = 0; i < anzahl; i++) wuerfe.push(1 + Math.floor(Math.random() * seiten));
  const summe = wuerfe.reduce((s, n) => s + n, 0) - ersch; // Erschwernis positiv = Abzug
  sounds.playWuerfel();
  const erschText = ersch ? (ersch > 0 ? `, Erschwernis minus ${ersch}` : `, Erleichterung plus ${-ersch}`) : '';
  const ansage = `Verdeckt. Ergebnis ${summe}. ${anzahl} W ${seiten}, ${wuerfe.join(', ')}${erschText}.`;
  protokolliere(a, `Verdeckter Meister-Wurf: ${anzahl} W ${seiten} ${wuerfe.join(', ')}${erschText}, Ergebnis ${summe}.`);
  speichere();
  // Ergebnis hinter den Menuepunkt F12 schreiben; Fokus liegt nach den Dialogen
  // schon wieder dort, daher die Ansage zuverlaessig per aria-live.
  zeigeErgebnis('meisterwurf', `Ergebnis ${summe}`, ansage);
  sprache.sage(ansage);
}

async function spielabendAbschliessen(hub) {
  const a = getMeister();
  const ep = await zahlDialog({ titel: 'Spielabend abschliessen', label: 'Vergebene Erfahrungspunkte (nur ins Protokoll)', wert: 0, min: 0, max: 100000 });
  if (ep === null) return;
  const text = `Spielabend ${a.spieltag} abgeschlossen. ${ep} Erfahrungspunkte vergeben. Die Spieler tragen sie selbst an ihrem Abenteuertisch ein.`;
  protokolliere(a, text);
  a.apProtokoll.unshift({ spieltag: a.spieltag, ep, text });
  a.spieltag += 1;
  await speichere();
  sounds.playSpeichern();
  hub.verlasse();
  setTimeout(() => sprache.sage(`${text} Naechster Spieltag ist ${a.spieltag}.`), 150);
}

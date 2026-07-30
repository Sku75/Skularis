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
import { textDialog, zahlDialog, knopfDialog } from '../ui/dialog.js';
import * as reiterHub from '../ui/reiter-hub.js';
import { ladeDb, getDb } from '../core/db-laden.js';
import { createMeisterAbenteuer, parseMeisterAbenteuer, protokolliere } from '../core/meister-abenteuer.js';
import { getMeister, setMeister, speichere } from '../meister/state.js';
import { gruppenzusammenstellungScreen, gruppenboegenScreen } from '../meister/gruppe.js';
import { gruppenrechercheScreen, gruppenprobeScreen } from '../meister/gruppenrecherche.js';
import { gegnerkarteiScreen } from '../meister/gegnerkartei.js';
import { spieltischScreen } from '../meister/spieltisch.js';
import { texteScreen } from '../meister/texte.js';
import { meisterNotizenScreen } from '../meister/notizen.js';
import { verdeckterWurf } from '../meister/wuerfel.js';
import { regelnScreen } from './regeln.js';

const ipc = window.skularis?.ipc;

export function oeffne() {
  screen.push(einstiegScreen());
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
  auswahlScreen({
    titel: modus === 'spielen' ? 'Meisterabenteuer zum Spielen waehlen' : 'Meisterabenteuer zum Bearbeiten waehlen',
    eintraege: liste.map(a => ({ label: a.name, wert: a.pfad })),
    onWahl: async (pfad) => {
      try {
        await ladeDb();
        const r = await ipc.meisterLaden(pfad);
        const a = parseMeisterAbenteuer(r.inhalt);
        a._pfad = pfad;
        setMeister(a);
        sounds.playOeffnen();
        oeffneHub(modus);
      } catch (e) {
        console.error('Meisterabenteuer laden:', e);
        sprache.sage('Meisterabenteuer konnte nicht geladen werden.');
      }
    },
  });
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
    { label: 'Spieltisch', hint: 'Karten, Wunden und Zuweisung im Kampf', factory: () => spieltischScreen() },
    { label: 'Gegner und Kreaturen', hint: 'Statbloecke anlegen und wuerfeln', factory: () => gegnerkarteiScreen('gegner') },
    { label: 'Freundliche NPC', hint: 'Meister-NPC verwalten', factory: () => gegnerkarteiScreen('freund') },
    { label: 'Charakterboegen der Gruppe', hint: 'Boegen ansehen', factory: () => gruppenboegenScreen() },
    { label: 'Abenteuertexte', hint: 'txt-Dokumente lesen, mit Lesezeichen', factory: () => texteScreen() },
    { label: 'Meister-Notizen und Vorlesetexte', hint: 'geheime Notizen und Vorlesetexte', factory: () => meisterNotizenScreen() },
    { label: 'Regelnachschlagewerk', hint: 'alle Regeln, mit Hinweis welcher Held sie hat', factory: () => regelnScreen({ db: getDb(), helden: regelHelden(), titel: 'Regelnachschlagewerk' }) },
    { label: 'Protokoll', hint: 'was im Abenteuer passiert ist', factory: () => protokollScreen() },
    { label: 'Gruppenzusammenstellung', hint: 'Helden hinzufuegen und entfernen', factory: () => gruppenzusammenstellungScreen() },
    { label: 'Verdeckter Meister-Wurf', hint: 'schnell und leise wuerfeln', aktion: () => verdeckterMeisterWurf() },
    { label: 'Zwischenspeichern', hint: 'Spielstand sichern', aktion: async () => { await speichere(); sounds.playSpeichern(); sprache.sage('Zwischengespeichert.'); } },
  ];

  if (modus === 'spielen') {
    punkte.push({ label: 'Spielabend abschliessen', hint: 'Erfahrungspunkte ins Protokoll, dann schliessen', aktion: () => spielabendAbschliessen(hub) });
  }
  punkte.push({ label: 'Speichern und schliessen', hint: 'sichern und zum Meister-Tisch zurueck', aktion: async () => { await speichere(); sounds.playSpeichern(); sprache.sage('Gespeichert.'); hub.verlasse(); } });

  hub = reiterHub.oeffneHub({ titel, subtitle: 'Mit F1 bis F12 direkt zum Menue. Escape verlaesst den Bereich.', punkte });
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
  const anzahl = await zahlDialog({ titel: 'Verdeckter Wurf', label: 'Anzahl der Wuerfel', wert: 1, min: 1, max: 50 });
  if (anzahl === null) return;
  const seiten = await knopfDialog({ titel: 'Wuerfeltyp', knoepfe: [{ label: 'W6', wert: 6 }, { label: 'W20', wert: 20 }] });
  if (seiten === null) return;
  const mod = await zahlDialog({ titel: 'Modifikator', label: 'Modifikator, 0 wenn keiner', wert: 0, min: -100, max: 100 });
  if (mod === null) return;
  verdeckterWurf(anzahl, seiten, mod, 'Meister-Wurf');
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

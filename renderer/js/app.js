/**
 * Skularis 0.1 — App-Bootstrap
 * Initialisiert die Bedienschicht und zeigt das Hauptmenü.
 */

import { on, emit } from './state.js';
import * as sounds from './sounds.js';
import * as sprache from './sprache.js';
import * as shortcuts from './shortcuts.js';
import * as navigation from './navigation.js';
import * as einstellungen from './daten/einstellungen.js';
import * as screen from './ui/screen.js';
import * as reiterHub from './ui/reiter-hub.js';
import * as startScreen from './screens/start.js';
import { hatInhalt } from './core/infotext.js';
import { audioBereichScreen } from './meister/audio-bereich.js';
import * as radio from './net/radio.js';

const ipc = window.skularis?.ipc;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Einstellungen + Sound
  await einstellungen.laden();
  await sounds.init();
  sounds.playStart();
  await new Promise(r => setTimeout(r, 900));

  // Sprache
  await sprache.init();
  const spracheAn = await einstellungen.get('sprache_an');
  if (spracheAn === false) sprache.setAn(false);

  // Schriftgröße anwenden
  const fontOffset = (await einstellungen.get('schrift_offset')) || 0;
  document.documentElement.style.setProperty('--db-font-offset', `${fontOffset}px`);

  // Bedienschicht
  shortcuts.init();
  navigation.init();
  screen.init(document.getElementById('app-content'));

  registriereShortcuts();
  initKopfzeile();
  registriereEscape();
  registriereAudioTaste();
  registriereRadioLautstaerke();
  registriereQuit();

  // Keine eigene Fokus-Ansage mehr: NVDA liest fokussierte Elemente selbst einmal
  // vor. Jedes Element trägt dazu seinen vollständigen Namen (siehe
  // sprache.benenneFuerFokus). Eine zusätzliche Ansage käme sonst doppelt.

  // Hauptmenü zeigen
  screen.reset(startScreen.build());
  sprache.sageStatus('Pfeiltasten hoch und runter zum Wählen, Eingabetaste öffnet, Escape zurück, Tabulator erreicht die Sound- und Schrift-Einstellungen.');
}

// --- Escape = zurück ---

/** Echtes Texteingabefeld? Dort loescht die Ruecktaste ein Zeichen, statt zurueck zu gehen. */
function istTextfeld(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    const t = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(t);
  }
  return false;
}

function registriereEscape() {
  document.addEventListener('keydown', async (e) => {
    // Die Ruecktaste wirkt wie Escape (einen Schritt zurueck) — ausser in einem
    // echten Texteingabefeld, wo sie ein Zeichen loescht.
    const istZurueck = e.key === 'Escape' || e.key === 'Backspace';
    if (!istZurueck) return;
    if (e.key === 'Backspace' && istTextfeld(e.target)) return;
    // Offener Dialog? Dann Dialog-eigenes Escape wirken lassen. Das gilt auch
    // für die Rückfrage aus onBack — mehrfaches Escape verwirft also nichts.
    if (document.querySelector('dialog[open]')) return;
    // Kam das Escape aus einem Dialog (der sich soeben selbst geschlossen hat),
    // NICHT zusätzlich den darunterliegenden Bildschirm verlassen.
    if (e.target && e.target.closest && e.target.closest('dialog')) return;
    e.preventDefault();
    if (!await screen.zurueck()) {
      if (screen.tiefe() <= 1) sprache.sage('Hauptmenü. Bereits oberste Ebene.');
    }
  });
}

// --- Audio-Bereich global auf F12 ---
//
// F12 oeffnet ueberall den Audio-Bereich, damit ein Spieler auch vom Hauptmenue
// aus (ohne geladenes Abenteuer) den Tisch anhoeren kann — immer dasselbe
// Spieler-Menue. Ausnahme: An einem Tisch-Hub behandelt der Hub F12 selbst
// (am Meistertisch die Meister-Version mit Schluessel und Senden).
function registriereAudioTaste() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'F12' || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (reiterHub.hubAktiv()) return; // im Tisch-Hub uebernimmt der Hub die F12
    const cur = screen.current();
    if (cur && cur._audioBereich) { sprache.sage('Audio ist schon offen.'); return; }
    e.preventDefault();
    const scr = audioBereichScreen('spieler');
    scr._audioBereich = true;
    screen.push(scr);
  }, true);
}

// --- Radio-Lautstaerke am Ziffernblock (global) ---
//
// Plus und Minus am Ziffernblock stellen ueberall die Radio-Lautstaerke lauter
// und leiser (der eigene Radio-Kanal des Clients). Ohne Klangeffekt, es wird nur
// die Zahl angesagt. Steht der Fokus auf einer Wert-Zeile (eigener Regler),
// bleibt deren Plus/Minus unangetastet.
function registriereRadioLautstaerke() {
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'NumpadAdd' && e.code !== 'NumpadSubtract') return;
    if (e.ctrlKey || e.altKey || e.shiftKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (istTextfeld(e.target)) return;
    if (e.target && e.target.closest && e.target.closest('.ed-zeile')) return; // Wert-Zeile regelt selbst
    e.preventDefault();
    const v = Math.max(0, Math.min(100, radio.getHoererLautstaerke() + (e.code === 'NumpadAdd' ? 1 : -1)));
    radio.setHoererLautstaerke(v);
    if (ipc && ipc.configSchreiben) { try { ipc.configSchreiben('radio_hoerer_vol', v); } catch { /* egal */ } }
    sprache.sage(`${v}`);
  }, true);
}

// --- Beenden ---

function registriereQuit() {
  on('app-beenden', () => beenden());

  // Fenster-Schließen (X) — keine ungespeicherten Daten auf Menü-Ebene.
  if (ipc && ipc.onVorSchliessen) {
    ipc.onVorSchliessen(() => {
      if (ipc.antworteSchliessen) ipc.antworteSchliessen(true);
    });
  }
}

function beenden() {
  sounds.playSchliessen();
  sprache.sage('Skularis wird beendet.');
  setTimeout(() => {
    if (ipc && ipc.antworteSchliessen) ipc.antworteSchliessen(true);
  }, 250);
}

// --- Shortcuts (nur global sinnvolle) ---

function registriereShortcuts() {
  shortcuts.registriere('Ctrl+M', () => {
    const neu = !sprache.istAn();
    sprache.setAn(neu);
    sounds.playClick();
    const st = document.getElementById('sprache-status-text');
    if (st) st.textContent = neu ? 'Sprache an' : 'Sprache aus';
    if (neu) sprache.sage('Sprachausgabe aktiviert.');
    else {
      const el = document.getElementById('sr-live');
      if (el) { el.textContent = ''; requestAnimationFrame(() => { el.textContent = 'Sprachausgabe deaktiviert.'; }); }
    }
  }, 'Sprachausgabe ein/aus');

  shortcuts.registriere('Ctrl++', () => schriftAendern(1), 'Schrift vergrößern');
  shortcuts.registriere('Ctrl+-', () => schriftAendern(-1), 'Schrift verkleinern');
  shortcuts.registriere('Ctrl+0', () => schriftReset(), 'Schrift zurücksetzen');

  // Shift halten und Pfeil: Tooltip. Strg und I oder Doppelklick: Info-Fenster.
  // Beides steuert das Info-Fenster auf der rechten Bildschirmhälfte
  // (ui/infofenster.js). Registriert wird das direkt über keydown/keyup, weil
  // der Shortcut-Manager nur auf Drücken hört, nicht auf Loslassen.
  registriereInfoFenster();
}

/** Titel eines fokussierten Eintrags für die Fensterüberschrift. */
function eintragTitel(el) {
  if (!el) return 'Eintrag';
  return (el.querySelector && el.querySelector('.db-menu__label')?.textContent)
    || el.getAttribute('aria-label')
    || (el.textContent || '').trim().split('\n')[0]
    || 'Eintrag';
}

function registriereInfoFenster() {
  let infofenster = null;
  import('./ui/infofenster.js').then(m => { infofenster = m; });

  // Tooltip: Shift gehalten und Pfeil. Läuft in der Erfassungsphase, damit die
  // Pfeil-Navigation im Panel diese Kombination nicht auch verarbeitet.
  document.addEventListener('keydown', async (e) => {
    if (!infofenster) return;
    if (!e.shiftKey) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (document.querySelector('dialog[open]')) return;
    // Im Info-Modus steuert das Fenster selbst.
    if (infofenster.istOffen() && !infofenster.imTooltip()) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.repeat) return; // Halten der Pfeiltaste nicht durchlaufen lassen

    if (!infofenster.imTooltip()) {
      // Öffnen: erste Zeile lesen. Mit Strg zusätzlich zur ersten Überschrift.
      // Ohne Inhalt geht der Tooltip gar nicht auf.
      const el = document.activeElement;
      const detail = await detailBaustein(el);
      if (!hatInhalt(detail)) { sprache.sage('Keine weiteren Informationen.'); return; }
      infofenster.oeffneTooltip(eintragTitel(el), detail);
      if (e.ctrlKey) infofenster.zurUeberschrift(1);
      return;
    }
    // Bereits offen: navigieren.
    if (e.ctrlKey) infofenster.zurUeberschrift(e.key === 'ArrowDown' ? 1 : -1);
    else infofenster.weiter(e.key === 'ArrowDown' ? 1 : -1);
  }, true);

  // Shift losgelassen: Tooltip schließt sich.
  document.addEventListener('keyup', (e) => {
    if (!infofenster) return;
    if (e.key === 'Shift' && infofenster.imTooltip()) infofenster.schliesseTooltip();
  }, true);

  // Strg und I: Info-Fenster, bleibt offen.
  shortcuts.registriere('Ctrl+I', async () => {
    if (!infofenster) return;
    const el = document.activeElement;
    const detail = await detailBaustein(el);
    if (!hatInhalt(detail)) { sprache.sage('Keine weiteren Informationen.'); return; }
    infofenster.oeffneInfo(eintragTitel(el), detail);
  }, 'Info-Fenster öffnen');

  // Doppelklick auf einen Eintrag öffnet ebenfalls das Info-Fenster.
  document.addEventListener('dblclick', async (e) => {
    if (!infofenster) return;
    const el = e.target.closest('[tabindex], button');
    if (!el || el.closest('.ii-overlay')) return;
    const detail = await detailBaustein(el);
    if (!hatInhalt(detail)) return;
    infofenster.oeffneInfo(eintragTitel(el), detail);
  });
}

/**
 * Vollinfo eines fokussierten Elements ermitteln, als String oder als
 * strukturierte Zeilenliste. Verzögert geladene (Funktions-)Details werden
 * aufgelöst und gecacht.
 */
async function detailBaustein(el) {
  if (!el) return null;
  if (el.__detailCache !== undefined) return el.__detailCache;
  let d = el.__detail;
  if (d === undefined) return null;
  if (typeof d === 'function') { try { d = await d(); } catch { d = null; } }
  el.__detailCache = d || null;
  return el.__detailCache;
}

async function schriftAendern(delta) {
  const aktuell = (await einstellungen.get('schrift_offset')) || 0;
  const neu = Math.max(-4, Math.min(8, aktuell + delta));
  einstellungen.setWert('schrift_offset', neu);
  document.documentElement.style.setProperty('--db-font-offset', `${neu}px`);
  sounds.playClick();
  sprache.sage(`Schriftgröße ${neu >= 0 ? '+' : ''}${neu}`);
}

function schriftReset() {
  einstellungen.setWert('schrift_offset', 0);
  document.documentElement.style.setProperty('--db-font-offset', '0px');
  sounds.playClick();
  sprache.sage('Schriftgröße zurückgesetzt.');
}

// --- Kopfzeile (Barrierefreiheits-Box) ---

function initKopfzeile() {
  const volumeSlider = document.getElementById('volume-slider');
  const volumeDisplay = document.getElementById('volume-display');
  const btnSprache = document.getElementById('btn-sprache-toggle');
  const btnFontPlus = document.getElementById('btn-font-plus');
  const btnFontMinus = document.getElementById('btn-font-minus');

  if (volumeSlider) {
    volumeSlider.value = sounds.getVolume();
    if (volumeDisplay) volumeDisplay.textContent = String(sounds.getVolume());
    volumeSlider.addEventListener('input', () => {
      const v = parseInt(volumeSlider.value, 10);
      sounds.setVolume(v);
      if (volumeDisplay) volumeDisplay.textContent = String(v);
    });
  }

  if (btnSprache) {
    btnSprache.addEventListener('click', () => {
      const neu = !sprache.istAn();
      sprache.setAn(neu);
      sounds.playClick();
      const st = document.getElementById('sprache-status-text');
      if (st) st.textContent = neu ? 'Sprache an' : 'Sprache aus';
      if (neu) sprache.sage('Sprachausgabe aktiviert.');
    });
  }

  if (btnFontPlus) btnFontPlus.addEventListener('click', () => schriftAendern(1));
  if (btnFontMinus) btnFontMinus.addEventListener('click', () => schriftAendern(-1));
}

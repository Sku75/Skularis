/**
 * Skularis 0.1 — App-Bootstrap
 * Initialisiert die Bedienschicht und zeigt das Hauptmenü.
 */

import { on, emit } from './state.js';
import * as sounds from './sounds.js';
import * as sprache from './sprache.js';
import * as shortcuts from './shortcuts.js';
import * as reiterTasten from './ui/reiter-tasten.js';
import * as navigation from './navigation.js';
import * as einstellungen from './daten/einstellungen.js';
import * as screen from './ui/screen.js';
import * as reiterHub from './ui/reiter-hub.js';
import * as modul from './core/modul.js';
import * as startScreen from './screens/start.js';
import { hatInhalt } from './core/infotext.js';
import { knopfDialog } from './ui/dialog.js';
import * as kurztasten from './meister/kurztasten.js';
// Die grossen Audio- und Netzmodule (audio-bereich, audio-player, radio) werden
// hier bewusst NICHT mehr beim Programmstart geladen — sie kommen erst mit ihrem
// Tisch (Performance). Die Anwendungslautstaerke laeuft ueber sounds.js, an dem
// sich Player und Radio beim eigenen Laden anmelden.

const ipc = window.skularis?.ipc;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Einstellungen + Sound
  await einstellungen.laden();
  await sounds.init();
  // Die Anwendungslautstaerke haelt sounds.js; Player und Radio melden sich beim
  // eigenen Laden dort an (kein Vorab-Laden der Audio-Module mehr noetig).
  sounds.playStart();
  await new Promise(r => setTimeout(r, 900));

  // Sprache
  await sprache.init();
  const spracheAn = await einstellungen.get('sprache_an');
  if (spracheAn === false) sprache.setAn(false);

  // Schriftgröße anwenden
  const fontOffset = (await einstellungen.get('schrift_offset')) || 0;
  document.documentElement.style.setProperty('--db-font-offset', `${fontOffset}px`);

  // Bedienschicht. Der Kurztasten-Handler wird VOR dem Shortcut-Manager
  // registriert, damit eine belegte Audio-Schnelltaste am Meistertisch Vorrang
  // vor einer globalen Standardbelegung hat (z. B. Strg+0).
  kurztasten.initHandler();
  shortcuts.init();
  navigation.init();
  screen.init(document.getElementById('app-content'));

  // Gespeicherte Tasten-Umbelegungen laden und anwenden (vor dem Registrieren).
  const tastenbelegung = (await einstellungen.get('tastenbelegung')) || {};
  // Migration 1.20: Die Sprachausgabe ist von Strg M (jetzt Manöver) auf Strg T
  // umgezogen. Ein alter Override, der noch auf Strg M zeigt, wird verworfen —
  // eine selbst gewaehlte andere Taste bleibt erhalten.
  if (String(tastenbelegung.sprache || '').toLowerCase().replace(/strg/g, 'ctrl').replace(/\s+/g, '') === 'ctrl+m') {
    delete tastenbelegung.sprache;
    einstellungen.setWert('tastenbelegung', { ...tastenbelegung });
  }
  shortcuts.setOverrides(tastenbelegung, (obj) => einstellungen.setWert('tastenbelegung', obj));
  // Reiter-Tasten der Tische (pro Tisch, mit Menünamen) — umbelegbar in den Optionen.
  const reiterBelegung = (await einstellungen.get('reiter_tasten')) || {};
  reiterTasten.setOverrides(reiterBelegung, (obj) => einstellungen.setWert('reiter_tasten', obj));
  // Audio-Schnelltasten (Strg+1 bis Strg+´) — Belegung global, in den Optionen umbelegbar.
  const kurzBelegung = (await einstellungen.get('kurztasten_belegung')) || {};
  kurztasten.setOverrides(kurzBelegung, (obj) => einstellungen.setWert('kurztasten_belegung', obj));

  registriereShortcuts();
  initKopfzeile();
  registriereEscape();
  registriereAudioTaste();
  registriereAnwendungsLautstaerke();
  registriereQuit();

  // Keine eigene Fokus-Ansage mehr: NVDA liest fokussierte Elemente selbst einmal
  // vor. Jedes Element trägt dazu seinen vollständigen Namen (siehe
  // sprache.benenneFuerFokus). Eine zusätzliche Ansage käme sonst doppelt.

  // Hauptmenü zeigen
  screen.reset(startScreen.build());
  sprache.sageStatus('Pfeiltasten hoch und runter zum Wählen, Eingabetaste öffnet, Escape zurück. Sound, Schrift und Tasten stellst du unter Optionen ein.');
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
    // Kein Reconnect-Sonderfall mehr: seit 1.20 sind alle Verbindungen an ihren
    // Tisch gebunden — das Verlassen des Tisches stoppt auch jedes Wiederverbinden.
    e.preventDefault();
    if (!await screen.zurueck()) {
      if (screen.tiefe() <= 1) sprache.sage('Hauptmenü. Bereits oberste Ebene.');
    }
  });
}

// --- Strg und F12: Klaenge stoppen ---
//
// Das globale nackte F12 (Audio-Bereich von ueberall, auch ohne Abenteuer) ist
// seit 1.20 WEG: Zuhoeren gibt es nur noch am Abenteuertisch (dort ist Audio der
// feste F12-Reiter), Senden nur am Meistertisch. Im Hauptmenue tut F12 nichts.
// Strg und F12 (laufende Klaenge stoppen) bleibt erhalten; das Audio-Modul wird
// dafuer erst bei Bedarf geladen.
function registriereAudioTaste() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'F12' || !e.ctrlKey || e.altKey || e.shiftKey) return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    import('./meister/audio-bereich.js')
      .then(m => { try { m.klaengeStoppen(); } catch { /* egal */ } sprache.sage('Klaenge gestoppt.'); })
      .catch(() => { /* Modul nicht ladbar: nichts zu stoppen */ });
  }, true);
}

// --- Anwendungslautstaerke am Ziffernblock (global) ---
//
// Plus und Minus am Ziffernblock regeln UEBERALL die Anwendungslautstaerke: einen
// Master ueber alles, was der Nutzer hoert (Bedien-Toene, Player-Audio, Radio-
// Empfang). Damit stellt man schnell die eigene Hoerlautstaerke ein und die
// Balance zu Discord — OHNE das Verhaeltnis der Kanaele (Hintergrund/Abhoer) oder
// die Sende-Lautstaerke an die Spieler zu veraendern. Ohne Sprachansage; nur am
// Rand (0 oder 100, oder schon am Anschlag) ein Anschlagklang. Steht der Fokus auf
// einer Wert-Zeile (eigener Regler), bleibt deren Plus/Minus unangetastet.
function registriereAnwendungsLautstaerke() {
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'NumpadAdd' && e.code !== 'NumpadSubtract') return;
    if (e.altKey || e.shiftKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (istTextfeld(e.target)) return;
    if (e.target && e.target.closest && e.target.closest('.ed-zeile')) return; // Wert-Zeile regelt selbst
    e.preventDefault();
    // Ohne Strg: 1er-Schritte. Mit Strg: 5er-Schritte (schneller lauter/leiser).
    const schritt = e.ctrlKey ? 5 : 1;
    const delta = (e.code === 'NumpadAdd' ? 1 : -1) * schritt;
    const alt = sounds.getAnwendungsLautstaerke();
    const v = Math.max(0, Math.min(100, alt + delta));
    // sounds haelt den Master und benachrichtigt Player und Radio ueber ihren
    // Anmelde-Hook — die Audio-Module muessen dafuer nicht geladen sein.
    sounds.setAnwendungsLautstaerke(v);
    if (ipc && ipc.configSchreiben) { try { ipc.configSchreiben('app_master_vol', v); } catch { /* egal */ } }
    if (v === alt || v === 0 || v === 100) sounds.playGrenze();
  }, true);
}

// --- Beenden ---

let _beendenLaeuft = false;

function registriereQuit() {
  // Menüpunkt "Skularis beenden": mit derselben Abfrage wie Strg+Q.
  on('app-beenden', async () => { if (await beendenAblauf()) beenden(); });

  // Fenster-Schließen (X): dieselbe Abfrage. Bricht der Nutzer ab, bleibt das
  // Fenster offen (Antwort false); sonst schließt der Hauptprozess.
  if (ipc && ipc.onVorSchliessen) {
    ipc.onVorSchliessen(async () => {
      const ok = await beendenAblauf();
      if (ipc.antworteSchliessen) ipc.antworteSchliessen(ok);
    });
  }
}

/**
 * Beenden-Ablauf mit Rückfrage: Ist ein Charakter im Editor oder ein Abenteuer
 * offen, wird gefragt und auf Wunsch gespeichert. Sonst wird ohne Nachfrage
 * beendet. Gibt true zurück, wenn wirklich beendet werden soll (der Aufrufer
 * beendet dann), false bei Abbruch. Speichert hier, quittet aber NICHT selbst.
 */
async function beendenAblauf() {
  if (_beendenLaeuft) return false;            // keine doppelte Abfrage
  // Ein offener Dialog hat Vorrang — nicht mittendrin die Beenden-Abfrage stapeln.
  if (document.querySelector('dialog[open]')) return false;
  _beendenLaeuft = true;
  try {
    let editorMod = null, stateMod = null;
    try { editorMod = await import('./editor/editor.js'); } catch { /* egal */ }
    try { stateMod = await import('./abenteuer/state.js'); } catch { /* egal */ }
    const editorAuf = !!(editorMod && editorMod.editorOffen && editorMod.editorOffen());
    const ab = stateMod && stateMod.getAbenteuer && stateMod.getAbenteuer();

    if (editorAuf) {
      const w = await knopfDialog({
        titel: 'Skularis beenden',
        frage: 'Du bearbeitest gerade einen Charakter.',
        knoepfe: [
          { label: 'Speichern und beenden', wert: 'speichern' },
          { label: 'Ohne Speichern beenden', wert: 'ohne' },
          { label: 'Abbrechen', wert: 'abbrechen' },
        ],
      });
      if (!w || w === 'abbrechen') return false;
      if (w === 'speichern') { try { await editorMod.speichere(); } catch { /* egal */ } }
      return true;
    }
    // An einem Tisch (Abenteuer- ODER Meistertisch) IMMER nachfragen — auch wenn
    // scheinbar nichts geaendert wurde. hubAktiv() ist wahr, solange ein Tisch-Hub
    // offen ist (auch in dessen Unterschirmen).
    if (ab || (reiterHub.hubAktiv && reiterHub.hubAktiv())) {
      const w = await knopfDialog({
        titel: 'Skularis beenden',
        frage: 'Du bist an einem Tisch. Skularis wirklich beenden?',
        knoepfe: [
          { label: 'Speichern und beenden', wert: 'speichern' },
          { label: 'Beenden ohne Speichern', wert: 'ohne' },
          { label: 'Abbrechen', wert: 'abbrechen' },
        ],
      });
      if (!w || w === 'abbrechen') return false;
      if (w === 'speichern') {
        try { if (stateMod && stateMod.speichere) await stateMod.speichere(); } catch { /* egal */ }
        try { const m = await import('./meister/state.js'); if (m && m.speichere) await m.speichere(); } catch { /* egal */ }
      }
      return true;
    }
    // Nichts offen (Hauptmenue): ohne Nachfrage beenden.
    return true;
  } finally {
    _beendenLaeuft = false;
  }
}

function beenden() {
  // Derselbe Aufraeumweg wie beim Tischverlassen: alle registrierten Dienste
  // (Radio, Post, Timer, Audio) sauber stoppen, dann schliessen.
  try { modul.verlasseModul(); } catch { /* egal */ }
  sounds.playSchliessen();
  sprache.sage('Skularis wird beendet.');
  setTimeout(() => {
    if (ipc && ipc.antworteSchliessen) ipc.antworteSchliessen(true);
  }, 250);
}

// --- Shortcuts (nur global sinnvolle) ---

/** Sprachausgabe umschalten (Strg T, umbelegbar). Die Aus-Ansage nennt den
 *  Rueckweg und laeuft direkt ueber die aria-live-Region, damit NVDA sie auch
 *  nach dem internen Stummschalten noch vorliest. */
export function sprachausgabeUmschalten() {
  const neu = !sprache.istAn();
  sprache.setAn(neu);
  sounds.playClick();
  const st = document.getElementById('sprache-status-text');
  if (st) st.textContent = neu ? 'Sprache an' : 'Sprache aus';
  if (neu) sprache.sage('Sprachausgabe aktiviert.');
  else {
    const el = document.getElementById('sr-live');
    const taste = shortcuts.comboText('sprache') || 'Strg T';
    if (el) { el.textContent = ''; requestAnimationFrame(() => { el.textContent = `Sprachausgabe deaktiviert. ${taste} schaltet wieder ein.`; }); }
  }
}

/** Software-Sound-Lautstaerke (Bedien-Toene) verstellen — auch per Taste. */
export function soundLautstaerke(delta) {
  const alt = sounds.getVolume();
  const v = Math.max(0, Math.min(100, alt + delta));
  sounds.setVolume(v);
  const slider = document.getElementById('volume-slider');
  const anzeige = document.getElementById('volume-display');
  if (slider) slider.value = v;
  if (anzeige) anzeige.textContent = String(v);
  if (v === alt || v === 0 || v === 100) sounds.playGrenze();
  else sprache.sage(`Lautstärke ${v}.`);
}

function registriereShortcuts() {
  // Sprachausgabe: seit 1.20 auf Strg T (T wie Ton) — Strg M gehoert jetzt den
  // Manoevern am Abenteuertisch.
  shortcuts.registriere('Ctrl+T', sprachausgabeUmschalten, 'Sprachausgabe ein/aus', 'sprache');

  // Schriftgröße auf Strg und Bild-hoch/Bild-runter — damit Strg und Plus/Minus
  // am Ziffernblock frei sind für die Lautstärke (5er-Schritte).
  shortcuts.registriere('Ctrl+PageUp', () => schriftAendern(1), 'Schrift vergrößern', 'schrift_plus');
  shortcuts.registriere('Ctrl+PageDown', () => schriftAendern(-1), 'Schrift verkleinern', 'schrift_minus');
  shortcuts.registriere('Ctrl+0', () => schriftReset(), 'Schrift zurücksetzen', 'schrift_reset');

  // Bedien-Ton-Lautstaerke (die Funktion der Kopfzeilen-Box) als umbelegbare
  // Tasten, seit die Box nur noch mit der Maus bedienbar ist.
  shortcuts.registriere('Ctrl+Shift+PageUp', () => soundLautstaerke(5), 'Lautstärke erhöhen', 'lautstaerke_plus');
  shortcuts.registriere('Ctrl+Shift+PageDown', () => soundLautstaerke(-5), 'Lautstärke verringern', 'lautstaerke_minus');

  // Strg und Pos1: von ueberall im Tisch-Hub zurueck zum Hauptmenue des Tisches
  // (oberster Eintrag mit Fokus). Pos1 allein bleibt "im Menue ganz nach oben".
  shortcuts.registriere('Ctrl+Home', () => { if (reiterHub.hubAktiv()) reiterHub.zumHubTop(); }, 'Zum Hauptmenü des Tisches', 'zum_hauptmenue');

  // Strg und Q: Skularis beenden. Ist ein Charakter oder ein Abenteuer offen,
  // wird vorher gefragt und auf Wunsch gespeichert.
  shortcuts.registriere('Ctrl+Q', async () => { if (await beendenAblauf()) beenden(); }, 'Skularis beenden', 'beenden');

  registriereTischKuerzel();

  // Shift halten und Pfeil: Tooltip. Strg und I oder Doppelklick: Info-Fenster.
  // Beides steuert das Info-Fenster auf der rechten Bildschirmhälfte
  // (ui/infofenster.js). Registriert wird das direkt über keydown/keyup, weil
  // der Shortcut-Manager nur auf Drücken hört, nicht auf Loslassen.
  registriereInfoFenster();
}

// --- Tischgebundene Kuerzel (nur mit offenem Tisch wirksam) ---------------
//
// Die Wuerfel-Familie des Abenteuertisches (Strg K, P, Z, M, W, A) springt in
// den Reiter 1 (Meine Initiative-Phase) und oeffnet dort direkt das Ziel-Menue
// mit dem Fokus oben — Escape fuehrt danach wie gewohnt eine Ebene zurueck.
// Ausserhalb des Tisches existieren diese Tasten nicht (Modul-Registry).
function registriereTischKuerzel() {
  const oeffneInPhase = (lade) => async () => {
    if (document.querySelector('dialog[open]')) return;
    if (!reiterHub.aktiviereReiter(1, { frisch: true })) return;
    try {
      const scr = await lade();
      if (scr) screen.push(scr);
    } catch (e) { console.error('Tisch-Kuerzel:', e); }
  };

  shortcuts.registriere('Ctrl+K', oeffneInPhase(async () => {
    const m = await import('./abenteuer/live-spiel.js');
    return m.kampfwerteScreen();
  }), 'Kampf (Kämpfen-Menü)', 'ab_kampf', { modul: 'abenteuer' });

  shortcuts.registriere('Ctrl+P', oeffneInPhase(async () => {
    const m = await import('./abenteuer/kampf-menues.js');
    return m.profanScreen();
  }), 'Profane Fertigkeiten und Talente', 'ab_profan', { modul: 'abenteuer' });

  shortcuts.registriere('Ctrl+Z', oeffneInPhase(async () => {
    const [km, st, db] = await Promise.all([
      import('./abenteuer/kampf-menues.js'),
      import('./abenteuer/state.js'),
      import('./core/db-laden.js'),
    ]);
    const a = st.getAbenteuer();
    if (!a || !km.zauberVorhanden(a.charakter, db.getDb())) { sprache.sage('Keine Zauber bekannt.'); return null; }
    return km.zauberScreen();
  }), 'Zauber und Rituale', 'ab_zauber', { modul: 'abenteuer' });

  shortcuts.registriere('Ctrl+M', oeffneInPhase(async () => {
    const m = await import('./abenteuer/kampf-menues.js');
    return m.manoeverScreen();
  }), 'Manöver', 'ab_manoever', { modul: 'abenteuer' });

  shortcuts.registriere('Ctrl+W', oeffneInPhase(async () => {
    const m = await import('./abenteuer/live-spiel.js');
    return m.schnellwuerfeScreen();
  }), 'Schnellwürfe', 'ab_schnellwuerfe', { modul: 'abenteuer' });

  shortcuts.registriere('Ctrl+A', oeffneInPhase(async () => {
    const m = await import('./abenteuer/kampf-menues.js');
    return m.attributsprobenScreen();
  }), 'Attributsproben', 'ab_attribute', { modul: 'abenteuer' });

  // Strg R am Abenteuertisch: Radio- und Post-Verbindung kurz trennen und mit
  // dem gemerkten Code neu aufbauen (2-Sekunden-Sperre im Audio-Modul).
  shortcuts.registriere('Ctrl+R', async () => {
    if (document.querySelector('dialog[open]')) return;
    try { const m = await import('./meister/audio-bereich.js'); m.radioErneuern(); }
    catch (e) { console.error('Reconnect:', e); }
  }, 'Reconnect (Verbindung erneuern)', 'ab_reconnect', { modul: 'abenteuer' });

  // Strg B am Abenteuertisch: Post aktiv abrufen.
  shortcuts.registriere('Ctrl+B', async () => {
    if (document.querySelector('dialog[open]')) return;
    try { const m = await import('./abenteuer/meisterpost.js'); m.postAbrufen(); }
    catch (e) { console.error('Post-Abruf:', e); }
  }, 'Post abrufen', 'ab_postabruf', { modul: 'abenteuer' });

  // Strg R am Meistertisch: Senden erneuern (gleicher Schluessel, Hoerer
  // verbinden sich neu). Strg B: Meisterpost abrufen.
  shortcuts.registriere('Ctrl+R', async () => {
    if (document.querySelector('dialog[open]')) return;
    try { const m = await import('./meister/audio-bereich.js'); m.sendenErneuern(); }
    catch (e) { console.error('Senden erneuern:', e); }
  }, 'Senden erneuern', 'me_senden_erneuern', { modul: 'meister' });

  shortcuts.registriere('Ctrl+B', async () => {
    if (document.querySelector('dialog[open]')) return;
    try { const m = await import('./meister/postkasten.js'); m.postAbrufen(); }
    catch (e) { console.error('Post-Abruf:', e); }
  }, 'Post abrufen', 'me_postabruf', { modul: 'meister' });
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
  }, 'Info-Fenster öffnen', 'info');

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

  if (btnSprache) btnSprache.addEventListener('click', () => sprachausgabeUmschalten());

  if (btnFontPlus) btnFontPlus.addEventListener('click', () => schriftAendern(1));
  if (btnFontMinus) btnFontMinus.addEventListener('click', () => schriftAendern(-1));

  // Navigations-Schalter oben links: H zum Hauptmenü (Ebene für Ebene, mit den
  // Wächtern/Verlassen-Abfragen), Pfeil links eine Ebene zurück. Für die Maus;
  // Blinde nutzen wie gewohnt Escape. Kein Tastatur-Fokus, damit die Pfeil-Menü-
  // Navigation nicht gestört wird.
  const btnHaupt = document.getElementById('btn-hauptmenue');
  const btnZurueck = document.getElementById('btn-zurueck');
  if (btnHaupt) btnHaupt.addEventListener('click', () => { sounds.playClick(); screen.zumHauptmenue(); });
  if (btnZurueck) btnZurueck.addEventListener('click', () => { sounds.playClick(); screen.zurueck(); });
}

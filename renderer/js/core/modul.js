/**
 * Skularis — Modul-Lebenszyklus mit Dienst-Registry (seit 1.20).
 *
 * Skularis kennt vier Laufzeit-Module: hauptmenue, charakter (Editor),
 * abenteuer (Abenteuertisch) und meister (Meistertisch). Jeder laufende Dienst
 * (Timer, PeerJS-Peer, Audio-Element, Intervall) registriert sich beim Start im
 * AKTIVEN Modul mit einer Stopp-Funktion. verlasseModul() ruft beim Verlassen
 * ZWINGEND alle Stopp-Funktionen — egal auf welchem Weg das Modul verlassen wird
 * (Escape, Speichern und schließen, Strg Pos1, Strg Q, Fenster-X).
 *
 * Konvention seit 1.20: KEIN Dienst ohne Besitzer und Stopp-Funktion. Wer einen
 * Timer, einen Peer oder ein Audio-Objekt anlegt, traegt es hier ein. Damit ist
 * die Fehlerklasse "laeuft nach dem Tisch heimlich weiter" strukturell beendet
 * (frueher: Radio sendete aus dem Hauptmenue weiter, der Status-Timer lief bis
 * zum Programmende, das Hauptmenue-Zuhoeren reconnectete endlos).
 */

let _modul = 'hauptmenue';
let _dienste = []; // { name, stopp }

/** Name des aktiven Moduls: 'hauptmenue' | 'charakter' | 'abenteuer' | 'meister'. */
export function aktivesModul() { return _modul; }

/**
 * Ein Modul betreten. Ein evtl. noch aktives anderes Modul wird vorher sauber
 * verlassen (alle seine Dienste gestoppt) — es gibt immer genau EIN aktives Modul.
 */
export function betreteModul(name) {
  if (_modul === name) return;
  verlasseModul();
  _modul = name || 'hauptmenue';
}

/**
 * Einen laufenden Dienst im aktiven Modul registrieren.
 * @param {string} name   sprechender Name (fuer die Diagnose)
 * @param {Function} stopp  beendet den Dienst vollstaendig; muss mehrfach
 *                          aufrufbar sein, ohne Schaden anzurichten
 */
export function dienstRegistrieren(name, stopp) {
  if (typeof stopp !== 'function') return;
  // Gleichnamigen Alt-Eintrag ersetzen (z. B. erneutes Verbinden im selben Modul).
  _dienste = _dienste.filter(d => d.name !== name);
  _dienste.push({ name, stopp });
}

/** Einen Dienst abmelden, OHNE ihn zu stoppen (er hat sich selbst beendet). */
export function dienstAbmelden(name) {
  _dienste = _dienste.filter(d => d.name !== name);
}

/**
 * Das aktive Modul verlassen: alle registrierten Dienste in umgekehrter
 * Reihenfolge stoppen (Fehler einzeln abfangen), danach ist das Hauptmenue das
 * aktive Modul. Mehrfachaufrufe sind harmlos.
 */
export function verlasseModul() {
  const alte = _dienste;
  _dienste = [];
  for (let i = alte.length - 1; i >= 0; i--) {
    try { alte[i].stopp(); } catch (e) { console.error(`Dienst ${alte[i].name} stoppen:`, e); }
  }
  _modul = 'hauptmenue';
}

/** Diagnose: Namen der aktuell registrierten Dienste des aktiven Moduls. */
export function aktiveDienste() {
  return _dienste.map(d => `${_modul}: ${d.name}`);
}

/**
 * Skularistool — gemeinsamer Zustand des aktiven Abenteuers + Autospeichern.
 * Alle Abenteuer-Bereiche greifen hierauf zu.
 */
import { serialisiereAbenteuer } from '../core/abenteuer.js';
import { serialisiere } from '../core/sephrasto-xml.js';

const ipc = window.skularis?.ipc;
let aktuell = null;
let _db = null; // Regeldatenbank, für das Zurückschreiben des Bogens nötig

export function getAbenteuer() { return aktuell; }
export function setAbenteuer(a) { aktuell = a; }
export function setDb(db) { _db = db; }

/** Aktuellen Spielstand sicher speichern (atomar im Hauptprozess). */
export async function speichere() {
  if (!aktuell) return false;
  // Transienter Ansicht-Kontext (z. B. Meister sieht die Initiative-Phase eines
  // Helden): NICHTS auf die Platte schreiben.
  if (aktuell._transient) return false;
  try {
    const r = await ipc.abenteuerSpeichern({ name: aktuell.name, inhalt: serialisiereAbenteuer(aktuell) });
    aktuell._pfad = r.pfad;
    return true;
  } catch (e) {
    console.error('Abenteuer speichern:', e);
    return false;
  }
}

/**
 * Bogen-Daten (Gold + Gegenstände) zurück in die Charakter-.xml schreiben.
 * Der Bogen ist König: was im Abenteuer an Münzbörse und Inventar geändert wurde,
 * legen wir beim Speichern/Schließen wieder auf dem Bogen ab. Zähler (Wunden,
 * Erschöpfung, Energien) bleiben Session-Daten und werden NICHT auf den Bogen
 * geschrieben. Nur möglich, wenn die Bogendatei noch am gespeicherten Pfad liegt.
 */
export async function schreibeBogenZurueck() {
  if (!aktuell || !aktuell.charakter || !aktuell.charakterPfad || !_db) return false;
  try {
    const xml = serialisiere(aktuell.charakter, _db);
    await ipc.dateiSpeichern({ pfad: aktuell.charakterPfad, inhalt: xml });
    return true;
  } catch (e) {
    console.error('Bogen zurückschreiben:', e);
    return false;
  }
}

/** Beim Speichern/Schließen: erst Bogen (Gold/Inventar) zurück, dann Abenteuer. */
export async function speichereMitBogen() {
  await schreibeBogenZurueck();
  return speichere();
}

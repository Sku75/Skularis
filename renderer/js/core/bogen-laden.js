/**
 * Skularis — einen Charakterbogen FRISCH von der Platte laden.
 *
 * Der Charakterbogen (.xml) ist die Quelle aller Bogen-Daten. Tische (Abenteuer
 * und Meister) rufen dies beim Öffnen auf, um die eingebettete Kopie durch den
 * aktuellen Stand zu ersetzen (gesteigerte Werte, neue Waffensets, neue
 * Gegenstände). Fehlt die Datei am Pfad, liefert die Funktion { ok:false },
 * damit der Aufrufer nachfragen kann (mit altem Stand weiter / entfernen).
 *
 * @param {string} pfad  absoluter Pfad zur Charakter-.xml
 * @param {object} db    geladene Regeldatenbank (für parse)
 * @returns {Promise<{ok:boolean, bogen?:object}>}
 */
import { parse } from './sephrasto-xml.js';

const ipc = window.skularis?.ipc;

export async function ladeBogenFrisch(pfad, db) {
  if (!pfad) return { ok: false };
  try {
    const r = await ipc.dateiDirektLaden(pfad);
    if (!r || r.fehler || !r.inhalt) return { ok: false };
    const bogen = parse(r.inhalt, db);
    bogen.dateiname = pfad;
    return { ok: true, bogen };
  } catch {
    // dateiDirektLaden wirft, wenn die Datei nicht (mehr) existiert.
    return { ok: false };
  }
}

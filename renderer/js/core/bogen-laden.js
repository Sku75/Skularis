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
import { knopfDialog } from '../ui/dialog.js';

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

/**
 * Einen anderen Charakterbogen aus der Bibliothek wählen (Schaltflächen-Dialog).
 * Für den Fall "Neuen Charakter laden", wenn der ursprüngliche Bogen fehlt.
 * @returns {Promise<{pfad:string, name:string, bogen:object}|null>}  null = abgebrochen/keiner
 */
export async function waehleCharakterBogen(db) {
  let liste = [];
  try { liste = await ipc.bibliothekListe(); } catch { liste = []; }
  if (!liste.length) return null;
  const knoepfe = liste.map(c => ({ label: c.name, wert: c.pfad }));
  knoepfe.push({ label: 'Abbrechen', wert: '' });
  const pfad = await knopfDialog({ titel: 'Charakter wählen', frage: 'Welchen Charakterbogen laden?', knoepfe });
  if (!pfad) return null;
  const res = await ladeBogenFrisch(pfad, db);
  if (!res.ok) return null;
  const name = String(pfad).split(/[\\/]/).pop().replace(/\.xml$/i, '');
  return { pfad, name, bogen: res.bogen };
}

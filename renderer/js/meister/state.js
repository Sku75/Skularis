/**
 * Skularistool — gemeinsamer Zustand des aktiven Meisterabenteuers + Speichern.
 * Getrennt vom Spielertisch (eigener Ordner Meisterabenteuer).
 */
const ipc = window.skularis?.ipc;
let aktuell = null;

export function getMeister() { return aktuell; }
export function setMeister(a) { aktuell = a; }

export async function speichere() {
  if (!aktuell) return false;
  try {
    const r = await ipc.meisterSpeichern({ name: aktuell.name, inhalt: JSON.stringify(aktuell, null, 2) });
    aktuell._pfad = r.pfad;
    return true;
  } catch (e) {
    console.error('Meisterabenteuer speichern:', e);
    return false;
  }
}

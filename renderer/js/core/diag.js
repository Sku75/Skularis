/**
 * Skularis — stiller Diagnose-Mitschnitt.
 *
 * Schreibt Zeilen in <Portable>/skularis-diagnose.log (über den Hauptprozess).
 * Bewusst OHNE Ton und OHNE Ansage — die Diagnose darf das Spiel nie stören.
 * Dient dem Aufspüren des Post-Ton-Problems bei Reconnects; später wieder entfernen.
 */
export function diag(text) {
  try {
    const ipc = window.skularis && window.skularis.ipc;
    if (ipc && ipc.diagLog) ipc.diagLog(String(text));
  } catch { /* Diagnose darf nie stören */ }
}

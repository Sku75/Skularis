/**
 * Skularis — Rechen- und Probenzeichen für die Sprachausgabe ausschreiben.
 *
 * In den Regeltexten stehen Kurzschreibweisen wie "Probe VT-2-BE" oder "16+10".
 * Ein Screenreader liest den Bindestrich und das Plus nicht oder falsch. Hier
 * werden die Zeichen zu Wörtern:
 *   VT-2-BE  ->  VT minus 2 minus BE
 *   16+10    ->  16 plus 10
 *   3×2      ->  3 mal 2
 *
 * Wichtig: nur ZWISCHEN Zahlen und Kürzeln (Großbuchstaben-Gruppen) ersetzen,
 * damit normale Bindestrich-Wörter wie "Nahkampf-Manöver" unangetastet bleiben.
 * Der Schrägstrich bleibt bewusst stehen (er trägt Bedeutung: "IN/KL", "20/28").
 * Die Funktion ist idempotent: mehrfaches Anwenden ändert nichts mehr.
 */

// Ein "Token" ist eine Zahl oder ein Kürzel aus 2 bis 4 Großbuchstaben
// (VT, AT, BE, INI, GdW zählt nicht, weil es ein kleines d enthält).
const TOKEN = '(?:\\d+|[A-ZÄÖÜ]{2,4})';
const MINUS = new RegExp(`(${TOKEN})\\s*[-–−]\\s*(?=${TOKEN}\\b)`, 'g');
const PLUS = new RegExp(`(${TOKEN})\\s*\\+\\s*(?=${TOKEN}\\b)`, 'g');

export function regelNotation(text) {
  let s = String(text == null ? '' : text);
  if (!s) return '';
  s = s.replace(MINUS, '$1 minus ');
  s = s.replace(PLUS, '$1 plus ');
  // Malzeichen zwischen Zahlen (nur das echte Mal-Zeichen, nicht der Buchstabe x).
  s = s.replace(/(\d)\s*[×⋅]\s*(?=\d)/g, '$1 mal ');
  // Durch die Ersetzungen entstandene doppelte Leerzeichen zusammenziehen.
  s = s.replace(/\s{2,}/g, ' ');
  return s.trim();
}

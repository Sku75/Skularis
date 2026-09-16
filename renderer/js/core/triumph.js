/**
 * Skularis — Triumph und Patzer (Ilaris).
 *
 * Zeigt der gewertete Würfel eine 20, ist es ein Triumph, zeigt er eine 1, ein
 * Patzer. Gewertet ist bei drei W20 der mittlere, bei einem W20 der eine.
 *
 * Nach der Regel zählt ein Triumph nur bei einer gelungenen Probe und ein Patzer
 * nur bei einer misslungenen. Ist die Schwierigkeit bekannt, wird das geprüft.
 * Oft kennt sie aber nur der Meister — dann wird die Kennung trotzdem angesagt,
 * und er entscheidet am Tisch.
 */
import * as sounds from '../sounds.js';

/**
 * @param {number} wert       der gewertete Würfel (1 bis 20)
 * @param {boolean|null} [gelungen]  true/false bei bekannter Schwierigkeit, sonst null
 * @returns {'Triumph'|'Patzer'|''}
 */
export function wurfKennung(wert, gelungen = null) {
  if (wert === 20 && gelungen !== false) return 'Triumph';
  if (wert === 1 && gelungen !== true) return 'Patzer';
  return '';
}

/** Den passenden Hinweiston zur Kennung spielen (nichts bei leerer Kennung). */
export function kennungsTon(kennung) {
  if (kennung === 'Triumph') sounds.playTriumph();
  else if (kennung === 'Patzer') sounds.playPatzer();
}

/** "Triumph 24", "Patzer 5" oder nur "24" — so steht es hinter "Ergebnis". */
export function mitKennung(kennung, zahl) {
  return kennung ? `${kennung} ${zahl}` : `${zahl}`;
}

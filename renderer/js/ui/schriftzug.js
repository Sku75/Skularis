/**
 * Skularis — der Schriftzug als Vektorgrafik.
 *
 * Es liegen keine Bilddateien im Programm, und ein Bild waere fuer die
 * Schriftgroessen-Umschaltung auch schlecht: eine Vektorgrafik bleibt in jeder
 * Groesse scharf. Weisse Schrift auf schwarzem Grund, mit Schnoerkeln links und
 * rechts und einer Ranke darunter.
 *
 * Fuer die Sprachausgabe ist der Schriftzug unsichtbar (aria-hidden): er ist
 * Zierde, kein Inhalt. Wo er steht, steht der Inhalt daneben als Text.
 *
 * Verwendet an zwei Stellen, damit es EIN Bauteil bleibt:
 *   - Platzhalter in der Wuerfelbox, solange nichts gewuerfelt wurde
 *   - Info-Fenster, wenn es keinen Text zu zeigen hat
 */

/** Der Schriftzug als SVG-Text. @param {number} [hoehe] CSS-Hoehe in Pixeln */
export function schriftzugSvg(hoehe = 72) {
  return `
<svg class="sku-schriftzug" viewBox="0 0 420 120" width="100%" height="${hoehe}"
     preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"
     xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="420" height="120" fill="#000000"/>
  <g fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round">
    <path d="M14 60 C 36 28, 58 28, 72 46 C 60 40, 46 44, 44 58 C 48 50, 58 50, 60 58"/>
    <path d="M14 60 C 36 92, 58 92, 72 74 C 60 80, 46 76, 44 62 C 48 70, 58 70, 60 62"/>
    <path d="M406 60 C 384 28, 362 28, 348 46 C 360 40, 374 44, 376 58 C 372 50, 362 50, 360 58"/>
    <path d="M406 60 C 384 92, 362 92, 348 74 C 360 80, 374 76, 376 62 C 372 70, 362 70, 360 62"/>
    <path d="M120 96 C 160 112, 260 112, 300 96"/>
    <path d="M198 104 C 206 96, 214 96, 222 104"/>
  </g>
  <text x="210" y="72" text-anchor="middle" fill="#ffffff"
        font-family="Georgia, 'Times New Roman', serif" font-size="54"
        font-style="italic" letter-spacing="3">Skularis</text>
</svg>`;
}

/** Derselbe Schriftzug als fertiges Element. */
export function schriftzugEl(hoehe = 72) {
  const d = document.createElement('div');
  d.className = 'sku-schriftzug-rahmen';
  d.setAttribute('aria-hidden', 'true');
  d.innerHTML = schriftzugSvg(hoehe);
  return d;
}

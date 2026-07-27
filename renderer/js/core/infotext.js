/**
 * Skularis — Info-Texte mit Überschriften und Zeilen.
 *
 * Der Tooltip (Shift halten und Pfeil) und das Info-Fenster (Strg und I) gehen
 * eine Info Zeile für Zeile durch. Damit man mit Strg und Pfeil zwischen
 * Überschriften springen kann, braucht die Info eine Struktur: eine flache
 * Liste aus Zeilen, jede entweder Überschrift oder Inhalt.
 *
 * Eine Zeile ist { text, ueberschrift }. Die Info-Produzenten (Vorteile,
 * Eigenheiten, Talente ...) bauen ihre Struktur mit bauInfo(). Alte Infos, die
 * nur ein Text sind, werden von zuZeilen() weiter unterstützt: sie werden in
 * Sätze zerlegt und ohne Überschriften angezeigt.
 */

/** Einen Text in kurze, einzeln lesbare Sätze zerlegen. */
export function saetze(text) {
  const roh = String(text || '').trim();
  if (!roh) return [];
  // Erst an Zeilenumbrüchen, dann an Satzzeichen mit folgender Großschreibung.
  let teile = roh.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (teile.length <= 1) {
    teile = roh.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/).map(s => s.trim()).filter(Boolean);
  }
  return teile.length ? teile : [roh];
}

/** Eine Zeile bauen. */
export function ueberschriftZeile(text) { return { text: String(text), ueberschrift: true }; }
export function inhaltZeile(text) { return { text: String(text), ueberschrift: false }; }

/**
 * Eine strukturierte Info aus Abschnitten bauen.
 * Jeder Abschnitt ist [überschrift, ...inhalte]. Inhalte werden in Sätze
 * zerlegt, damit jede Zeile kurz bleibt. Leere Inhalte werden übersprungen.
 *
 * @param {Array<[string, ...(string|string[])]>} abschnitte
 * @returns {Array<{text, ueberschrift}>}
 */
export function bauInfo(abschnitte) {
  const zeilen = [];
  for (const abschnitt of abschnitte || []) {
    if (!abschnitt || !abschnitt.length) continue;
    const [titel, ...inhalte] = abschnitt;
    const flach = inhalte.flat().filter(x => x !== undefined && x !== null && String(x).trim());
    // Ein Abschnitt ohne Inhalt wird ganz weggelassen, damit keine leere
    // Überschrift stehen bleibt.
    if (!flach.length) continue;
    if (String(titel || '').trim()) zeilen.push(ueberschriftZeile(titel));
    for (const inhalt of flach) {
      for (const satz of saetze(inhalt)) zeilen.push(inhaltZeile(satz));
    }
  }
  return zeilen;
}

/**
 * Eine beliebige Info in Zeilen normalisieren. Nimmt an:
 *   Array von { text, ueberschrift }  -> unverändert
 *   Array von Strings                 -> je eine Inhaltszeile
 *   String                            -> in Sätze zerlegt, ohne Überschriften
 */
export function zuZeilen(detail) {
  if (Array.isArray(detail)) {
    return detail.map(z => (z && typeof z === 'object' && 'text' in z)
      ? { text: String(z.text), ueberschrift: Boolean(z.ueberschrift) }
      : inhaltZeile(String(z)));
  }
  return saetze(detail).map(inhaltZeile);
}

/** Alle Zeilen zu einem gesprochenen Text zusammenfassen. */
export function alsText(detail) {
  return zuZeilen(detail).map(z => z.text).join(' ');
}

/** Gibt es überhaupt Inhalt? */
export function hatInhalt(detail) {
  return zuZeilen(detail).some(z => z.text.trim());
}

/**
 * Skularis — Regeltexte für die Sprachausgabe aufbereiten.
 *
 * Die Regeldatenbank stammt aus Sephrasto und ist für eine Oberfläche gedacht,
 * die HTML darstellen kann: allein 7638 Fettauszeichnungen und 468 Kursiv-Marken
 * stecken in den Beschreibungen. Ein Screenreader liest solche Zeichen mit —
 * aus "<b>Mächtige Magie:</b>" wird dann eine Kette aus Kleiner-Zeichen, b und
 * Größer-Zeichen. Dasselbe gilt für Platzhalter in eckigen Klammern und für
 * typografische Anführungszeichen.
 *
 * Diese Aufbereitung läuft einmal beim Laden der Datenbank (db.js), damit jeder
 * Text im Programm schon sauber ankommt — in der Ansage, im Detailfeld und im
 * Info-Fenster mit Strg und I gleichermaßen.
 *
 * Was bleibt: der Schrägstrich. Er trägt Bedeutung ("IN/KL/KL", "20/28") und
 * lässt sich nicht weglassen, ohne die Regel zu verfälschen.
 */

/** Auszeichnungen, Platzhalterklammern und Schmuckzeichen entfernen. */
export function lesbarerRegeltext(roh) {
  let s = String(roh == null ? '' : roh);
  if (!s) return '';

  // Zeilenumbrüche als Satzende, damit die Ansage Pausen bekommt.
  s = s.replace(/<br\s*\/?>/gi, '. ');
  // Alle übrigen Auszeichnungen ersatzlos streichen, der Inhalt bleibt.
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // Eckige Klammern um Platzhalter: der Inhalt bleibt, die Klammern gehen.
  // Aus "die Eigenheit Euphorisch für [Unternehmen]" wird "... für Unternehmen".
  s = s.replace(/\[([^\]]*)\]/g, '$1');

  // Typografische Anführungszeichen sind reine Zier und werden mitgelesen.
  s = s.replace(/[„“”‚‘’«»]/g, '');

  // Halbgeviert- und Geviertstrich als Trenner durch ein Komma ersetzen;
  // als Bindestrich zwischen Wörtern bleibt der normale Strich erhalten.
  s = s.replace(/\s*[–—]\s*/g, ', ');

  // Auslassungspunkte und mehrfache Satzzeichen zusammenfassen.
  s = s.replace(/…/g, '.');
  s = s.replace(/\.{2,}/g, '.');

  // Reste aufräumen: doppelte Leerzeichen, Leerzeichen vor Satzzeichen,
  // doppelte Kommas durch die Ersetzungen oben.
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s+([,.;:!?])/g, '$1');
  s = s.replace(/,\s*,/g, ',');
  s = s.replace(/,\s*\./g, '.');

  return s.trim();
}

/**
 * Seitenverweise ausschreiben. "S. 141" liest ein Screenreader sonst als
 * "S Punkt 141"; "Seite 141" ist eindeutig.
 */
export function seitenVerweiseAusschreiben(text) {
  return String(text || '').replace(/\bS\.\s*(\d+)/g, 'Seite $1');
}

/** Beides zusammen — das ist der Weg, den jeder Datenbanktext nimmt. */
export function aufbereiten(roh) {
  return seitenVerweiseAusschreiben(lesbarerRegeltext(roh));
}

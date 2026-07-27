/**
 * Skularis — XML-Dokument lesen und wieder schreiben, ohne etwas zu verlieren.
 *
 * Hintergrund: Skularis hat seine Charakterdateien früher beim Speichern komplett
 * neu aufgebaut. Alles, was Skularis nicht kannte, war danach weg — bei einer
 * echten Sephrasto-Datei waren das über zwanzig Felder. Deshalb gilt jetzt das
 * Durchreich-Prinzip: die Originaldatei wird geparst, nur die Teile werden
 * ersetzt, die Skularis wirklich verwaltet, und der Rest bleibt unangetastet.
 *
 * Damit das auch beim Zurückschreiben Zeichen für Zeichen passt, bildet
 * schreibeDokument() die Formatierung von Sephrasto (lxml) nach:
 *   zwei Leerzeichen Einrückung je Ebene, keine XML-Deklaration,
 *   Zeilenumbruch am Dateiende, UTF-8.
 *
 * Ein Sonderfall: lxml schreibt ein leeres Element mal als <X/> und mal als
 * <X></X>, je nachdem ob es als Behälter oder als Wertfeld angelegt wurde. Diese
 * Information geht beim Parsen verloren. Deshalb merkt sich leseDokument(), in
 * welcher Form jedes Element im Original stand, und schreibeDokument() nutzt das
 * wieder. Für Elemente, die es im Original nicht gab, entscheidet BEHAELTER.
 */

/** Elemente, die als Behälter angelegt werden und deshalb leer als <X/> erscheinen. */
const BEHAELTER = new Set([
  'Charakter', 'Version', 'Beschreibung', 'Eigenheiten', 'Eigenheit', 'Attribute',
  'Energien', 'AsP', 'KaP', 'GuP', 'Vorteile', 'Vorteil', 'Fertigkeiten', 'Fertigkeit',
  'FreieFertigkeit', 'Talente', 'Talent', 'Objekte', 'Rüstungen', 'Rüstung', 'Waffen',
  'Waffe', 'Ausrüstung', 'Ausrüstungsstück', 'ÜbernatürlicheFertigkeiten',
  'ÜbernatürlicheFertigkeit', 'Erfahrung', 'Einstellungen', 'BeschreibungDetails', 'Notiz',
]);

function escText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return escText(s).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
}

/**
 * XML einlesen.
 * @returns {{ doc: Document, root: Element, formen: { selbst: Set<string>, paar: Set<string> } }}
 */
export function leseDokument(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Ungültige XML-Datei.');
  }

  // Im Rohtext nachsehen, welche Elemente leer als <X/> und welche als <X></X>
  // geschrieben waren. Bei gemischtem Vorkommen gewinnt die Paar-Schreibweise.
  const selbst = new Set();
  const paar = new Set();
  const reSelbst = /<([^\s/>!?]+)(?:\s[^>]*?)?\/>/g;
  const rePaar = /<([^\s/>!?]+)(?:\s[^>]*?)?>\s*<\/\1>/g;
  let m;
  while ((m = reSelbst.exec(xml))) selbst.add(m[1]);
  while ((m = rePaar.exec(xml))) { paar.add(m[1]); selbst.delete(m[1]); }

  // Zeilenende der Quelle beibehalten. Die mitgelieferten Erschaffungspakete
  // sind mit Wagenrücklauf gespeichert, die Sephrasto-Dateien ohne.
  const zeilenende = xml.includes('\r\n') ? '\r\n' : '\n';

  const root = doc.documentElement;
  return { doc, root, formen: { selbst, paar }, zeilenende };
}

/** Dokument als Text ausgeben, im Format von Sephrasto. */
export function schreibeDokument(dok) {
  const zeilen = [];
  schreibeElement(dok.root, 0, dok.formen || { selbst: new Set(), paar: new Set() }, zeilen);
  const ze = dok.zeilenende || '\n';
  return zeilen.join(ze) + ze;
}

function schreibeElement(el, tiefe, formen, zeilen) {
  const ein = '  '.repeat(tiefe);
  const tag = el.tagName;
  let attrs = '';
  for (const a of Array.from(el.attributes)) attrs += ` ${a.name}="${escAttr(a.value)}"`;

  const kinder = Array.from(el.children);
  if (kinder.length) {
    zeilen.push(`${ein}<${tag}${attrs}>`);
    for (const k of kinder) schreibeElement(k, tiefe + 1, formen, zeilen);
    zeilen.push(`${ein}</${tag}>`);
    return;
  }

  const text = el.textContent || '';
  if (text.length) {
    zeilen.push(`${ein}<${tag}${attrs}>${escText(text)}</${tag}>`);
    return;
  }

  // Leeres Element: Schreibweise aus dem Original übernehmen, sonst nach BEHAELTER.
  const alsSelbst = formen.paar.has(tag) ? false
    : (formen.selbst.has(tag) ? true : BEHAELTER.has(tag));
  zeilen.push(alsSelbst ? `${ein}<${tag}${attrs}/>` : `${ein}<${tag}${attrs}></${tag}>`);
}

// --- Kleine Helfer für das Bearbeiten ------------------------------------

/** Direktes Kind mit diesem Namen, oder null. */
export function kind(el, tag) {
  if (!el) return null;
  for (const k of Array.from(el.children)) if (k.tagName === tag) return k;
  return null;
}

/** Direktes Kind mit diesem Namen; wird angelegt, falls es fehlt. */
export function kindOderNeu(el, tag) {
  return kind(el, tag) || el.appendChild(el.ownerDocument.createElement(tag));
}

/** Text eines direkten Kindes lesen. */
export function textVon(el, tag, standard = '') {
  const k = kind(el, tag);
  return k ? (k.textContent || '') : standard;
}

/** Zahl eines direkten Kindes lesen. */
export function zahlVon(el, tag, standard = 0) {
  const v = parseInt(textVon(el, tag, ''), 10);
  return Number.isNaN(v) ? standard : v;
}

/** Text eines direkten Kindes setzen; das Kind wird bei Bedarf angelegt. */
export function setzeText(el, tag, wert) {
  kindOderNeu(el, tag).textContent = String(wert == null ? '' : wert);
}

/** Text eines direkten Kindes nur setzen, wenn es das Kind schon gibt. */
export function setzeTextFallsDa(el, tag, wert) {
  const k = kind(el, tag);
  if (k) k.textContent = String(wert == null ? '' : wert);
}

/** Alle Kinder eines Elements entfernen. */
export function leere(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Neues Element mit Attributen anlegen und anhängen. */
export function haengeAn(el, tag, attribute = {}, text = null) {
  const neu = el.ownerDocument.createElement(tag);
  for (const [k, v] of Object.entries(attribute)) {
    if (v === undefined || v === null) continue;
    neu.setAttribute(k, String(v));
  }
  if (text !== null && text !== undefined) neu.textContent = String(text);
  el.appendChild(neu);
  return neu;
}

/** Alle Attribute eines Elements als einfaches Objekt. */
export function attributeVon(el) {
  const o = {};
  if (!el) return o;
  for (const a of Array.from(el.attributes)) o[a.name] = a.value;
  return o;
}

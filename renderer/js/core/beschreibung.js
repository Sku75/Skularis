/**
 * Skularis — Beschreibungstexte aus der Datenbank. EINE Stelle, die sie holt.
 *
 * Die Ilaris-Datenbank bringt zu fast allem einen Beschreibungstext mit: 19
 * profane Fertigkeiten, 73 übernatürliche Fertigkeiten, 86 Talente, 8 Attribute
 * und über 300 Vorteile. In den Probenlisten stand bis 1.47 nur die Rechnung:
 * "Basiswert 6, Fertigkeitswert 4, Probenwert 10". Was die Fertigkeit überhaupt
 * kann, stand nirgends — obwohl es in der Datenbank liegt.
 *
 * Diese Stelle holt den Text, und probenInfo() baut daraus die Info für die
 * Tooltips: erst die Zahlen, dann die Beschreibung. Wer jetzt eine weitere
 * Probenliste baut, holt den Text hier und bekommt denselben Aufbau.
 */
import { bauInfo } from './infotext.js';

/**
 * Beschreibungstext zu einem Eintrag der Datenbank.
 *
 * @param {object} db    geladene Datenbank
 * @param {string} art   'fertigkeit' | 'uebernat' | 'talent' | 'attribut'
 *                       | 'vorteil' | 'abgeleitet' | 'energie' | 'regel' | 'auto'
 * @param {string} name  Name, wie er in der Datenbank steht
 * @returns {string} der Text, oder '' wenn es keinen gibt
 */
export function beschreibungFuer(db, art, name) {
  if (!db || !name) return '';
  const n = String(name);
  const aus = (o) => String((o && (o.text || o.info)) || '').trim();
  const tabellen = {
    fertigkeit: 'fertigkeitByName',
    uebernat: 'uebernatByName',
    talent: 'talentByName',
    attribut: 'attributByName',
    vorteil: 'vorteilByName',
    abgeleitet: 'abgeleiteteByName',
    energie: 'energieByName',
    regel: 'regelByName',
  };
  if (art && art !== 'auto') {
    const tab = db[tabellen[art]];
    return tab ? aus(tab[n]) : '';
  }
  // 'auto': in sinnvoller Reihenfolge suchen. Talente zuerst, weil ein Name wie
  // "Zechen" ein Talent ist und keine Fertigkeit.
  for (const key of ['talent', 'fertigkeit', 'uebernat', 'attribut', 'vorteil', 'abgeleitet', 'energie', 'regel']) {
    const tab = db[tabellen[key]];
    const t = tab ? aus(tab[n]) : '';
    if (t) return t;
  }
  return '';
}

/** Das Wort für die Art, wie es in der Info stehen soll. */
const ART_WORT = {
  fertigkeit: 'Fertigkeit',
  uebernat: 'Übernatürliche Fertigkeit',
  talent: 'Talent',
  attribut: 'Attribut',
  vorteil: 'Vorteil',
  abgeleitet: 'Abgeleiteter Wert',
  energie: 'Energie',
  regel: 'Regel',
};

/**
 * Die Info zu einer Probe, einheitlich gebaut: Zahlen zuerst, Beschreibung
 * danach. Wird als FUNKTION weitergegeben (Stufe 5c), damit bei über 300
 * Einträgen nichts vorab gebaut wird — gebaut wird erst, wenn der Nutzer die
 * Zeile wirklich liest.
 *
 * @param {object} o
 * @param {string} o.titel        Überschrift, meist der Name
 * @param {object} o.db
 * @param {string} o.art          Art für ART_WORT und die Textsuche
 * @param {string} [o.name]       Name in der Datenbank, falls er vom Titel abweicht
 * @param {string|string[]} o.werte  die Zahlenzeilen
 * @param {string|string[]} [o.hinweise] zusätzliche Hinweise vor der Beschreibung
 * @returns {function(): Array} Baufunktion für das Info-Fenster
 */
export function probenInfo(o) {
  return () => {
    const name = o.name || o.titel;
    const wort = ART_WORT[o.art] || '';
    const werte = [].concat(o.werte || []).filter(Boolean);
    const hinweise = [].concat(o.hinweise || []).filter(Boolean);
    const abschnitte = [[o.titel, wort ? `${wort}.` : '', ...werte]];
    if (hinweise.length) abschnitte.push(['Hinweis', ...hinweise]);
    const text = beschreibungFuer(o.db, o.art, name);
    if (text) abschnitte.push(['Beschreibung', text]);
    return bauInfo(abschnitte);
  };
}

/**
 * Zwei Baufunktionen zusammenlegen: erst die eine, dann eine Leerzeile, dann die
 * andere. Gebraucht, um den letzten Wurf vor die feste Info zu stellen.
 */
export function verbinde(vorne, hinten) {
  return () => {
    const a = typeof vorne === 'function' ? vorne() : vorne;
    const b = typeof hinten === 'function' ? hinten() : hinten;
    const alsListe = (x) => (x == null || x === '' ? [] : (Array.isArray(x) ? x : [x]));
    const links = alsListe(a);
    const rechts = alsListe(b);
    if (!links.length) return rechts;
    if (!rechts.length) return links;
    return [...links, '', ...rechts];
  };
}

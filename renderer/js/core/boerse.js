/**
 * Skularis — die Geldbörse. EINE Stelle, die sie kennt.
 *
 * Warum eine eigene Stelle: Bis 1.47 lag das Geld an zwei Orten. Der
 * Charakterbogen führte char.geldboerse, das Abenteuer führte eine Kopie in
 * a.inventar.geldboerse — und beim Abschluss eines Spieltags schrieb die Kopie
 * den gepflegten Stand des Bogens wieder zu. Wer im Spiel Geld ausgab, hatte es
 * am nächsten Abend teilweise wieder.
 *
 * Ab 1.48 gilt: Der Charakterbogen ist König. Jede Änderung läuft durch
 * aendereBoerse() oder setzeMuenze(). Diese schreiben den Bogen, spiegeln den
 * Stand in a.inventar.geldboerse (damit ältere Skularis-Versionen in der Gruppe
 * und die Meisterbox den Betrag weiter lesen können) und schreiben eine Zeile
 * ins Börsen-Protokoll.
 *
 * Aventurische Münzen: 1 Dukat = 10 Silbertaler = 100 Heller = 1000 Kreuzer.
 * Gerechnet wird intern in Kreuzer. Die kleinste Münze heißt im Datenfeld
 * historisch 'kupfer', gemeint sind Kreuzer.
 */

export const MUENZEN = [
  { key: 'dukaten', name: 'Dukaten', wert: 1000 },
  { key: 'silber',  name: 'Silber',  wert: 100 },
  { key: 'heller',  name: 'Heller',  wert: 10 },
  { key: 'kupfer',  name: 'Kreuzer', wert: 1 },
];

const LEER = { dukaten: 0, silber: 0, heller: 0, kupfer: 0 };

/** Höchstzahl der Protokollzeilen. Älteres fällt hinten heraus. */
const PROTOKOLL_MAX = 200;

/** Die ganze Börse als eine Zahl in Kreuzer (kleinste Einheit). */
export function inKreuzer(g) {
  const b = g || {};
  return MUENZEN.reduce((s, m) => s + Math.max(0, b[m.key] || 0) * m.wert, 0);
}

/** Eine Kreuzer-Summe in möglichst große Münzen aufteilen (wechseln). */
export function ausKreuzer(summe, g) {
  const ziel = g || {};
  let rest = Math.max(0, Math.round(summe));
  for (const m of MUENZEN) {
    ziel[m.key] = Math.floor(rest / m.wert);
    rest -= ziel[m.key] * m.wert;
  }
  return ziel;
}

/** Lesbarer Stand für Ansage und Anzeige. */
export function standText(g) {
  const b = g || {};
  return MUENZEN.map(m => `${b[m.key] || 0} ${m.name}`).join(', ');
}

/** Die Börse des Charakters, bei Bedarf angelegt. Der Bogen ist König. */
export function leseBoerse(char) {
  const c = char || {};
  if (!c.geldboerse) c.geldboerse = { ...LEER };
  for (const m of MUENZEN) {
    if (typeof c.geldboerse[m.key] !== 'number') c.geldboerse[m.key] = 0;
  }
  return c.geldboerse;
}

/** Ein Betrag in Münzen (nicht in Kreuzer) als Kreuzer-Summe. */
export function betragInKreuzer(betrag) {
  return inKreuzer(betrag);
}

/** Ein Betrag als Text, nur die Sorten, die vorkommen. */
export function betragText(betrag) {
  const b = betrag || {};
  const teile = MUENZEN.filter(m => (b[m.key] || 0) > 0).map(m => `${b[m.key]} ${m.name}`);
  return teile.length ? teile.join(', ') : 'nichts';
}

function zeitstempel() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()}, ${z(d.getHours())}:${z(d.getMinutes())}`;
}

/** Das Börsen-Protokoll des Charakters. Wandert mit dem Bogen. */
export function protokoll(char) {
  const c = char || {};
  if (!Array.isArray(c.boersenProtokoll)) c.boersenProtokoll = [];
  return c.boersenProtokoll;
}

/**
 * Das Protokoll als Zeilen für das Info-Fenster: je Änderung eine Überschrift
 * mit Datum und Zeit, darunter der erreichte Stand, danach eine Leerzeile.
 * Jüngste Änderung oben.
 */
export function protokollZeilen(char) {
  const p = protokoll(char);
  if (!p.length) return [{ text: 'Noch keine Änderung an der Geldbörse aufgezeichnet.', ueberschrift: false }];
  const zeilen = [];
  for (const e of [...p].reverse()) {
    zeilen.push({ text: `${e.zeit} — ${e.grund}`, ueberschrift: true });
    zeilen.push({ text: `Stand: ${e.stand}`, ueberschrift: false });
    zeilen.push({ text: '', ueberschrift: false });
  }
  return zeilen;
}

/** Den erreichten Stand in die Abenteuer-Kopie spiegeln und protokollieren. */
function nachtragen(a, char, grund) {
  const g = leseBoerse(char);
  // Schattenkopie weiter mitschreiben, nicht löschen: ältere Versionen in der
  // Gruppe und die Meisterbox lesen weiter dort.
  if (a) {
    a.inventar = a.inventar || { geldboerse: { ...LEER }, rucksack: [], guertel: [] };
    a.inventar.geldboerse = { ...g };
  }
  const p = protokoll(char);
  p.push({ zeit: zeitstempel(), grund, stand: standText(g) });
  while (p.length > PROTOKOLL_MAX) p.shift();
  return standText(g);
}

/**
 * Geld ausgeben oder erhalten.
 *
 * Gewechselt wird nur, wenn es nötig ist: 5 Heller erhalten legt fünf Heller
 * dazu und lässt die übrige Börse in Ruhe. Erst wenn eine Sorte nicht reicht,
 * wird über die Gesamtsumme gerechnet und die Börse neu aufgeteilt.
 *
 * @param {object} a       laufendes Abenteuer (für die Schattenkopie), darf fehlen
 * @param {object} char    Charakterbogen (König)
 * @param {object} betrag  { dukaten, silber, heller, kupfer } — die Münzen der Änderung
 * @param {'aus'|'ein'} richtung
 * @returns {{ok:boolean, stand:string, gewechselt:boolean, fehlt?:number}}
 */
export function aendereBoerse(a, char, betrag, richtung) {
  const g = leseBoerse(char);
  const summeBetrag = inKreuzer(betrag);
  if (summeBetrag <= 0) return { ok: false, stand: standText(g), gewechselt: false, fehlt: 0 };

  const vorhanden = inKreuzer(g);
  if (richtung === 'aus' && summeBetrag > vorhanden) {
    return { ok: false, stand: standText(g), gewechselt: false, fehlt: summeBetrag - vorhanden };
  }

  // Versuch 1: Sorte für Sorte, ohne die Börse umzuwechseln.
  const vorzeichen = richtung === 'aus' ? -1 : 1;
  const probe = {};
  let direkt = true;
  for (const m of MUENZEN) {
    probe[m.key] = (g[m.key] || 0) + vorzeichen * (betrag[m.key] || 0);
    if (probe[m.key] < 0) direkt = false;
  }
  if (direkt) {
    for (const m of MUENZEN) g[m.key] = probe[m.key];
    const stand = nachtragen(a, char, `${betragText(betrag)} ${richtung === 'aus' ? 'ausgegeben' : 'erhalten'}`);
    return { ok: true, stand, gewechselt: false };
  }

  // Versuch 2: über die Gesamtsumme, dabei wird gewechselt.
  ausKreuzer(vorhanden + vorzeichen * summeBetrag, g);
  const stand = nachtragen(a, char, `${betragText(betrag)} ${richtung === 'aus' ? 'ausgegeben' : 'erhalten'}, gewechselt`);
  return { ok: true, stand, gewechselt: true };
}

/** Eine Münzsorte von Hand setzen (Meister gibt einen Bestand vor). */
export function setzeMuenze(a, char, key, wert) {
  const g = leseBoerse(char);
  const m = MUENZEN.find(x => x.key === key);
  if (!m) return standText(g);
  g[key] = Math.max(0, Math.round(wert || 0));
  return nachtragen(a, char, `${m.name} von Hand auf ${g[key]} gestellt`);
}

/** Die Börse aufräumen: alles in möglichst große Münzen umwechseln. */
export function raeumeAuf(a, char) {
  const g = leseBoerse(char);
  const vorher = standText(g);
  ausKreuzer(inKreuzer(g), g);
  if (standText(g) === vorher) return { geaendert: false, stand: vorher };
  return { geaendert: true, stand: nachtragen(a, char, 'Münzen gewechselt und aufgeräumt') };
}

/** Freitext "Weitere Wertgegenstände" am Charakter. */
export function leseWertgegenstaende(char) {
  return String((char || {}).wertgegenstaende || '');
}

export function setzeWertgegenstaende(char, text) {
  if (char) char.wertgegenstaende = String(text || '');
}

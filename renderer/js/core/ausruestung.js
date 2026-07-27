/**
 * Skularis — Ausrüstungssets und Inventarorte, Sephrasto-verträglich gespeichert.
 *
 * DAS PROBLEM: Sephrasto kennt weder Waffensets noch Haupthand und Nebenhand
 * noch "am Mann" gegen "im Rucksack". Seine Waffen tragen feste Attribute
 * (name, id, würfel, plus, härte, rw, beSlot, kampfstil, wm), und beim
 * Speichern baut Sephrasto jedes Element aus seinem eigenen Modell neu auf —
 * ein zusätzliches Attribut wie set="1" wäre nach einmal Speichern in Sephrasto
 * verschwunden.
 *
 * DIE LÖSUNG: Das einzige Feld, das Sephrasto unverändert durchreicht, ist die
 * Ausrüstungsliste <Ausrüstung> mit ihren <Ausrüstungsstück>-Texten. Sephrasto
 * schreibt jeden dieser Texte wortgetreu zurück. Sets und Inventarorte werden
 * deshalb als eigene, klar erkennbare Zeilen in dieser Liste abgelegt:
 *
 *   Waffenset: Kampfset 1; Haupthand: Säbel; Nebenhand: Buckler; Fernkampf: Kurzbogen
 *   Rüstungsset: Reiserüstung; Teile: Lederharnisch, Kappe
 *   Im Rucksack: Seil, 10 Schritt
 *
 * Statt Steuerzeichen stehen dort lesbare deutsche Wörter. Wer die Datei in
 * Sephrasto öffnet, sieht die Zeilen im Inventar und versteht sie; wer sie dort
 * ändert oder löscht, verliert höchstens die Zuordnung, nie einen Gegenstand.
 * Gegenstände ohne Vorsatz gelten als am Mann getragen — so lesen sich alte
 * Dateien unverändert.
 *
 * EINE GRENZE, die man kennen muss: Waffen dürfen nicht frei erfunden werden.
 * Sephrasto sucht beim Laden die id in seiner Datenbank und verwirft die Waffe,
 * wenn er sie nicht findet (Waffe.deserialize gibt False zurück). Eigene Waffen
 * entstehen deshalb immer aus einem Datenbankeintrag, dessen Namen und Werte
 * man danach ändert — genau so macht es Sephrasto auch. Bei Rüstungen ist das
 * anders: dort legt Sephrasto eine Definition an, wenn er den Namen nicht kennt
 * (Ruestung.deserialize), frei erfundene Rüstungen überleben also.
 */

export const ORT_MANN = 'mann';
export const ORT_RUCKSACK = 'rucksack';

const P_RUCKSACK = 'Im Rucksack: ';
const P_WAFFENSET = 'Waffenset: ';
const P_RUESTUNGSSET = 'Rüstungsset: ';

export const SET_WAFFENLOS = 'Waffenlos';
export const SLOTS = ['Haupthand', 'Nebenhand', 'Fernkampf'];

// --- Lesen ---------------------------------------------------------------

/**
 * Die Ausrüstungsliste in ihre drei Bestandteile zerlegen.
 * @returns {{ gegenstaende: Array<{text, ort}>, waffenSets: Array, ruestungsSets: Array }}
 */
export function leseInventar(char) {
  const gegenstaende = [];
  const waffenSets = [];
  const ruestungsSets = [];

  for (const roh of char.ausruestung || []) {
    const zeile = String(roh || '').trim();
    if (!zeile) continue;

    if (zeile.startsWith(P_WAFFENSET)) {
      waffenSets.push(leseWaffenset(zeile.slice(P_WAFFENSET.length)));
      continue;
    }
    if (zeile.startsWith(P_RUESTUNGSSET)) {
      ruestungsSets.push(leseRuestungsset(zeile.slice(P_RUESTUNGSSET.length)));
      continue;
    }
    if (zeile.startsWith(P_RUCKSACK)) {
      gegenstaende.push({ text: zeile.slice(P_RUCKSACK.length).trim(), ort: ORT_RUCKSACK });
      continue;
    }
    gegenstaende.push({ text: zeile, ort: ORT_MANN });
  }

  return { gegenstaende, waffenSets, ruestungsSets };
}

function leseWaffenset(rest) {
  const teile = rest.split(';').map(s => s.trim()).filter(Boolean);
  const set = { name: teile.shift() || 'Set', haupthand: '', nebenhand: '', fernkampf: '' };
  for (const t of teile) {
    const i = t.indexOf(':');
    if (i < 0) continue;
    const schluessel = t.slice(0, i).trim().toLowerCase();
    const wert = t.slice(i + 1).trim();
    if (schluessel === 'haupthand') set.haupthand = wert;
    else if (schluessel === 'nebenhand') set.nebenhand = wert;
    else if (schluessel === 'fernkampf') set.fernkampf = wert;
  }
  return set;
}

function leseRuestungsset(rest) {
  const teile = rest.split(';').map(s => s.trim()).filter(Boolean);
  const set = { name: teile.shift() || 'Set', teile: [] };
  for (const t of teile) {
    const i = t.indexOf(':');
    if (i < 0) continue;
    if (t.slice(0, i).trim().toLowerCase() !== 'teile') continue;
    set.teile = t.slice(i + 1).split(',').map(s => s.trim()).filter(Boolean);
  }
  return set;
}

// --- Schreiben -----------------------------------------------------------

/** Die drei Bestandteile wieder zu einer Ausrüstungsliste zusammensetzen. */
export function schreibeInventar(char, modell) {
  const zeilen = [];
  for (const g of modell.gegenstaende || []) {
    const text = String(g.text || '').trim();
    if (!text) continue;
    zeilen.push(g.ort === ORT_RUCKSACK ? P_RUCKSACK + text : text);
  }
  for (const s of modell.waffenSets || []) {
    const teile = [s.name];
    for (const [schluessel, wert] of [['Haupthand', s.haupthand], ['Nebenhand', s.nebenhand],
      ['Fernkampf', s.fernkampf]]) {
      if (wert) teile.push(`${schluessel}: ${wert}`);
    }
    zeilen.push(P_WAFFENSET + teile.join('; '));
  }
  for (const s of modell.ruestungsSets || []) {
    const teile = [s.name];
    if (s.teile && s.teile.length) teile.push(`Teile: ${s.teile.join(', ')}`);
    zeilen.push(P_RUESTUNGSSET + teile.join('; '));
  }
  char.ausruestung = zeilen;
  return zeilen;
}

/** Bequem: Modell lesen, verändern lassen, wieder schreiben. */
export function aendereInventar(char, aenderung) {
  const modell = leseInventar(char);
  aenderung(modell);
  schreibeInventar(char, modell);
  return modell;
}

// --- Sets pflegen --------------------------------------------------------

/** Ist das eine Fernkampfwaffe? Die Datenbank kennzeichnet sie mit fk. */
export function istFernkampf(db, waffe) {
  const def = (db.waffen || []).find(w => w.name === (waffe.id || waffe.name));
  return Boolean(def && (def.fk === '1' || def.fk === 1));
}

/** Kommt diese Waffe in irgendeinem Set vor? */
export function inSetEnthalten(sets, waffenName) {
  return (sets || []).some(s => s.haupthand === waffenName || s.nebenhand === waffenName
    || s.fernkampf === waffenName);
}

/**
 * Die Sets in Ordnung halten:
 *   Ein Set "Waffenlos" gibt es immer, als Vergleichspunkt und für Faustkampf.
 *   Jede Waffe, die in keinem Set steht, bekommt eines — Fernkampfwaffen in den
 *   Fernkampf-Slot, alles andere in die Haupthand. So hat man nach dem Kauf der
 *   ersten Waffe sofort ein brauchbares Set, ohne etwas einstellen zu müssen.
 * @returns {string[]} Namen der neu angelegten Sets
 */
export function ergaenzeSets(char, db) {
  const neu = [];
  aendereInventar(char, (m) => {
    if (!m.waffenSets.some(s => s.name === SET_WAFFENLOS)) {
      m.waffenSets.unshift({ name: SET_WAFFENLOS, haupthand: '', nebenhand: '', fernkampf: '' });
    }
    for (const w of char.waffen || []) {
      if (!w.name || inSetEnthalten(m.waffenSets, w.name)) continue;
      const fern = istFernkampf(db, w);
      // Erst versuchen, die Waffe in ein Set mit freiem passendem Platz zu legen.
      const passend = m.waffenSets.find(s => s.name !== SET_WAFFENLOS
        && !(fern ? s.fernkampf : s.haupthand));
      if (passend) {
        if (fern) passend.fernkampf = w.name; else passend.haupthand = w.name;
        continue;
      }
      const nummer = m.waffenSets.filter(s => s.name !== SET_WAFFENLOS).length + 1;
      const set = { name: `Set ${nummer}`, haupthand: '', nebenhand: '', fernkampf: '' };
      if (fern) set.fernkampf = w.name; else set.haupthand = w.name;
      m.waffenSets.push(set);
      neu.push(set.name);
    }
  });
  return neu;
}

/** Beschreibung eines Waffensets für Anzeige und Ansage. */
export function setText(set) {
  const teile = SLOTS
    .map(s => [s, set[s.toLowerCase()]])
    .filter(([, wert]) => wert)
    .map(([s, wert]) => `${s} ${wert}`);
  return teile.length ? teile.join(', ') : 'ohne Waffe, Faustkampf';
}

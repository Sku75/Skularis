/**
 * Skularis — Heldenvorlagen: die fertigen Beispielcharaktere aus dem
 * CharakterAssistent, nach Erfahrungsstufe geordnet, mit einem stimmigen
 * Steckbrief-Text.
 *
 * Zu unterscheiden von den Bausteinen (Spezies, Kultur, Basispakete), die der
 * geführte Assistent additiv zusammensetzt. Eine Vorlage ist dagegen ein
 * kompletter Held mit Namen, Werten, Ausrüstung und meist Eigenheiten.
 *
 * Die Vorlagen liegen als Sephrasto-XML in denselben Profession-Ordnern wie die
 * Bausteine; erkennbar sind sie daran, dass ihr Feld Erfahrung/Gesamt größer 0
 * ist. Das Laden übernimmt der Aufrufer über die IPC-Brücke (paketeListe,
 * paketLaden), dieses Modul bekommt die schon geparsten Charaktere.
 */

import { abgeleiteteWerte, waffenwerte } from './regeln.js';
import { bauInfo, alsText } from './infotext.js';

/** Die Erfahrungsstufen, in die die Vorlagen einsortiert werden. */
export const STUFEN = [
  { ep: 2000, name: 'Unerfahren', hint: '2000 Erfahrungspunkte, ein junger Held am Anfang' },
  { ep: 2500, name: 'Erprobt', hint: '2500 Erfahrungspunkte, mit einigen Abenteuern hinter sich' },
  { ep: 3000, name: 'Erfahren', hint: '3000 Erfahrungspunkte, ein gestandener Held' },
];

/** Die passende Stufe zu einer EP-Zahl (nächstgelegene). */
export function stufeFuer(gesamtEP) {
  let beste = STUFEN[0];
  for (const s of STUFEN) {
    if (Math.abs(s.ep - gesamtEP) < Math.abs(beste.ep - gesamtEP)) beste = s;
  }
  return beste;
}

const ATTR_NAME = {
  KO: 'Konstitution', MU: 'Mut', GE: 'Gewandtheit', KK: 'Körperkraft',
  IN: 'Intuition', KL: 'Klugheit', CH: 'Charisma', FF: 'Fingerfertigkeit',
};

function vName(v) { return typeof v === 'string' ? v : v.name; }

/** Ein Talent nach seiner Art zählen (0 Zauber, 1 Liturgie, 2 Anrufung). */
function talenteNachArt(char, db) {
  const zauber = [], liturgien = [], anrufungen = [];
  for (const t of char.talente || []) {
    const typ = db.talentByName[t]?.spezialTyp;
    if (typ === 0) zauber.push(t);
    else if (typ === 1) liturgien.push(t);
    else if (typ === 2) anrufungen.push(t);
  }
  return { zauber, liturgien, anrufungen };
}

/** Grobe Einordnung: worauf ist der Held ausgelegt? */
function archetyp(char, db) {
  const vorteile = (char.vorteile || []).map(vName);
  const traditionVorteil = vorteile.find(v => /^Tradition der /.test(v));
  // "Tradition der Gildenmagier I" -> "Gildenmagier", "Tradition der Hexen II" -> "Hexen"
  const tradition = traditionVorteil
    ? traditionVorteil.replace(/^Tradition der /, '').replace(/\s+[IVX]+$/, '')
    : '';
  const geweiht = vorteile.some(v => /^Geweiht /.test(v));
  const zauberer = vorteile.some(v => /^Zauberer /.test(v));

  if (geweiht) return { art: 'geweiht', tradition };
  if (traditionVorteil || zauberer) return { art: 'magisch', tradition };
  return { art: 'profan', tradition: '' };
}

/** Die beste Waffe des Charakters nach Attackewert. */
function besteWaffe(char, db) {
  let beste = null;
  let bestesAt = -Infinity;
  for (const w of char.waffen || []) {
    if (!w.name) continue;
    const k = waffenwerte(char, db, w);
    if (k.at !== null && k.at > bestesAt) { bestesAt = k.at; beste = { waffe: w, werte: k }; }
  }
  return beste;
}

/**
 * Die zwei, drei Sätze Einleitung. Nutzt die Kurzbeschreibung als Stimmung und
 * fügt eine Werte-Einordnung in Prosa an: Ausrichtung, Stärke, Schwäche.
 */
export function einleitung(char, db) {
  const attr = char.attribute || {};
  const sortiert = Object.keys(ATTR_NAME).sort((a, b) => (attr[b] || 0) - (attr[a] || 0));
  const stark = sortiert.slice(0, 2);
  const schwach = sortiert[sortiert.length - 1];
  const a = archetyp(char, db);
  const { zauber, liturgien, anrufungen } = talenteNachArt(char, db);
  const uebernat = zauber.length + liturgien.length + anrufungen.length;

  const saetze = [];

  // Satz 1: die vorhandene Kurzbeschreibung, sonst eine schlichte Vorstellung.
  const kurz = (char.kurzbeschreibung || '').trim();
  if (kurz) saetze.push(kurz.endsWith('.') ? kurz : kurz + '.');
  else saetze.push(`${char.name || 'Dieser Held'}${char.spezies ? ', ' + char.spezies : ''}.`);

  // Satz 2: Ausrichtung und Stärke. Bewusst ohne Artikel oder Geschlecht, weil
  // die Traditionsnamen im Plural stehen (Hexen, Druiden) und "ein Hexen"
  // falsch wäre.
  const staerkeText = `${ATTR_NAME[stark[0]]} und ${ATTR_NAME[stark[1]]}`;
  if (a.art === 'magisch') {
    saetze.push((a.tradition ? `Magiebegabt aus der Tradition der ${a.tradition}` : 'Magiebegabt')
      + `, mit ${uebernat} übernatürlichen Talenten. Die größte Stärke liegt in ${staerkeText}.`);
  } else if (a.art === 'geweiht') {
    saetze.push((a.tradition ? `Gesegnet aus der Tradition der ${a.tradition}` : 'Gesegnet')
      + `, mit ${liturgien.length} Liturgien. Die größte Stärke liegt in ${staerkeText}.`);
  } else {
    const kampf = besteWaffe(char, db);
    saetze.push(`Auf den Kampf ausgelegt, ohne Magie. Die größte Stärke liegt in ${staerkeText}`
      + `${kampf ? `, im Kampf mit ${kampf.waffe.name}` : ''}.`);
  }

  // Satz 3: eine Schwäche als Fingerzeig.
  saetze.push(`Am schwächsten ausgeprägt ist ${ATTR_NAME[schwach]}.`);

  return saetze.join(' ');
}

/**
 * Der volle Steckbrief für Shift und Pfeil-runter: Einleitung, dann die
 * gegliederte Faktenliste. Zahl steht bei den langen Punkten immer voran, damit
 * das Wichtige zuerst gehört wird und die Aufzählung abbrechbar ist.
 */
export function steckbrief(char, db) {
  const attr = char.attribute || {};
  const sortiert = Object.keys(ATTR_NAME).sort((a, b) => (attr[b] || 0) - (attr[a] || 0));
  const abschnitte = [['Überblick', einleitung(char, db)]];

  // Aufzählungen stehen als einzelne Zeilen unter ihrer Überschrift, damit man
  // sie mit Pfeil hoch und runter einzeln durchwandern kann. Sätze bleiben Satz
  // für Satz. Das übernimmt bauInfo: jeder Array-Eintrag wird eine eigene Zeile.
  const top3 = sortiert.slice(0, 3).map(k => `${ATTR_NAME[k]} ${attr[k]}`);
  abschnitte.push(['Stärkste Attribute', top3]);

  const kampf = besteWaffe(char, db);
  const kampfZeilen = [];
  if (kampf) {
    const k = kampf.werte;
    kampfZeilen.push(`Beste Waffe ${kampf.waffe.name}, Attacke ${k.at}`
      + `${k.vt === null ? '' : `, Verteidigung ${k.vt}`}.`);
  }
  const abg = abgeleiteteWerte(char);
  kampfZeilen.push(`Wundschwelle ${abg.WS}`, `Geschwindigkeit ${abg.GS}`, `Schicksalspunkte ${abg.SchiP}`);
  abschnitte.push(['Kampfwerte', ...kampfZeilen]);

  const vorteile = (char.vorteile || []).map(vName);
  if (vorteile.length) abschnitte.push([`Vorteile, ${vorteile.length}`, vorteile]);

  const eig = char.eigenheiten || [];
  abschnitte.push([`Eigenheiten${eig.length ? ', ' + eig.length : ''}`,
    eig.length ? eig.map(e => e.name) : 'Keine hinterlegt.']);

  // Übernatürliche Talente je Art als eigene Überschrift, darunter ein Talent je
  // Zeile — so springt Strg und Pfeil zwischen Zauber, Liturgien und Anrufungen.
  const { zauber, liturgien, anrufungen } = talenteNachArt(char, db);
  if (zauber.length) abschnitte.push([`Zauber, ${zauber.length}`, zauber]);
  if (liturgien.length) abschnitte.push([`Liturgien, ${liturgien.length}`, liturgien]);
  if (anrufungen.length) abschnitte.push([`Anrufungen, ${anrufungen.length}`, anrufungen]);

  return bauInfo(abschnitte);
}

/** Der Steckbrief als gesprochener Text am Stück (für die Ansage). */
export function steckbriefText(char, db) {
  return alsText(steckbrief(char, db));
}

/** Kurzform für die Zeile in der Heldenliste. */
export function kurzzeile(char) {
  const teile = [char.name || 'Held'];
  if (char.kurzbeschreibung) teile.push(char.kurzbeschreibung.replace(/\.$/, ''));
  return teile.join(', ');
}

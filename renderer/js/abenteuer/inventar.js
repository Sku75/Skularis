/**
 * Skularistool — Abenteuer-Bereich: Inventar.
 *
 * Der Charakterbogen ist König: Geldbörse und Gegenstände werden DIREKT am
 * Charakter (a.charakter) gepflegt — Münzbörse über char.geldboerse, Gegenstände
 * über die echte Ausrüstungsliste des Bogens (leseInventar/schreibeInventar).
 * Gegenstände tragen M (am Mann) oder R (Rucksack). Waffen und Rüstungen werden
 * zur Übersicht angezeigt; ihr Tragen läuft über die Waffensets/Rüstungssets des
 * Bogens (nicht Angelegtes gilt als im Rucksack). Beim Speichern/Schließen des
 * Abenteuers werden Geldbörse und Gegenstände in die Charakter-.xml zurück-
 * geschrieben (siehe state.js). Während des Spiels sichert speichere() den Stand
 * im Abenteuer-Datensatz.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { aktionZeile, infoZeile, abschnittTitel, wertZeile } from '../editor/widgets.js';
import { textDialog, jaNeinDialog, knopfDialog, zahlDialog } from '../ui/dialog.js';
import { protokolliere } from '../core/abenteuer.js';
import { leseInventar, schreibeInventar, ORT_MANN, ORT_RUCKSACK } from '../core/ausruestung.js';
import { BESCHREIBUNG_FELDER, AUSSEHEN_ZEILEN, HINTERGRUND_ZEILEN } from '../core/character.js';
import { getAbenteuer, speichere } from './state.js';

const FACH = { [ORT_MANN]: 'Am Mann', [ORT_RUCKSACK]: 'Rucksack' };

function char() { return getAbenteuer().charakter || {}; }

function geld() {
  const c = char();
  if (!c.geldboerse) c.geldboerse = { dukaten: 0, silber: 0, heller: 0, kupfer: 0 };
  return c.geldboerse;
}

// --- Aventurische Muenzen ---------------------------------------------------
//
// 1 Dukat = 10 Silbertaler = 100 Heller = 1000 Kreuzer. Damit man beim Ausgeben
// nicht jede der vier Zeilen von Hand umstellen muss (2 Dukaten minus 1 Kreuzer
// hiesse sonst: Dukaten auf 1, Silber auf 9, Heller auf 9, Kreuzer auf 9),
// rechnet Skularis intern in Kreuzer und wechselt automatisch. Die kleinste
// Muenze heisst im Datenfeld historisch 'kupfer', gemeint sind Kreuzer.
const MUENZEN = [
  { key: 'dukaten', name: 'Dukaten', wert: 1000 },
  { key: 'silber',  name: 'Silber',  wert: 100 },
  { key: 'heller',  name: 'Heller',  wert: 10 },
  { key: 'kupfer',  name: 'Kreuzer', wert: 1 },
];

/** Die ganze Boerse als eine Zahl in Kreuzer (kleinste Einheit). */
function inKreuzer(g) {
  return MUENZEN.reduce((s, m) => s + (Math.max(0, g[m.key] || 0)) * m.wert, 0);
}

/** Eine Kreuzer-Summe wieder in moeglichst grosse Muenzen aufteilen (wechseln). */
function ausKreuzer(summe, g) {
  let rest = Math.max(0, Math.round(summe));
  for (const m of MUENZEN) {
    g[m.key] = Math.floor(rest / m.wert);
    rest -= g[m.key] * m.wert;
  }
  return g;
}

/** Lesbarer Stand fuer Ansage und Anzeige. */
function standText(g) {
  return MUENZEN.map(m => `${g[m.key] || 0} ${m.name}`).join(', ');
}

/**
 * Geld ausgeben oder erhalten: Muenzsorte und Anzahl waehlen, danach wird der
 * Betrag verrechnet und die Boerse automatisch gewechselt. Beim Ausgeben wird
 * geprueft, ob ueberhaupt genug da ist.
 * @param {'aus'|'ein'} richtung
 */
async function geldAendern(richtung) {
  const g = geld();
  const wort = richtung === 'aus' ? 'ausgeben' : 'erhalten';
  const sorte = await knopfDialog({
    titel: `Geld ${wort}`,
    frage: `Du hast ${standText(g)}. Welche Münze?`,
    knoepfe: MUENZEN.map(m => ({ label: m.name, wert: m.key })),
  });
  if (sorte === null) return;
  const m = MUENZEN.find(x => x.key === sorte);
  const anzahl = await zahlDialog({
    titel: `${m.name} ${wort}`,
    label: `Wie viele ${m.name}?`,
    wert: 1, min: 1, max: 100000,
  });
  if (anzahl === null || anzahl <= 0) return;

  const betrag = anzahl * m.wert;
  const vorhanden = inKreuzer(g);
  if (richtung === 'aus' && betrag > vorhanden) {
    sounds.playError();
    sprache.sage(`Nicht genug Geld. Du hast nur ${standText(g)}.`);
    return;
  }
  ausKreuzer(richtung === 'aus' ? vorhanden - betrag : vorhanden + betrag, g);
  protokolliere(getAbenteuer(), `${anzahl} ${m.name} ${richtung === 'aus' ? 'ausgegeben' : 'erhalten'}.`);
  await speichere();
  screen.refresh();
  sounds.playSpeichern();
  sprache.sage(`${anzahl} ${m.name} ${richtung === 'aus' ? 'ausgegeben' : 'erhalten'}. Du hast jetzt ${standText(g)}.`);
}

/** Die Boerse aufraeumen: alles in moeglichst grosse Muenzen umwechseln. */
async function muenzenWechseln() {
  const g = geld();
  const vorher = standText(g);
  ausKreuzer(inKreuzer(g), g);
  const nachher = standText(g);
  if (vorher === nachher) { sprache.sage(`Nichts zu wechseln. Du hast ${nachher}.`); return; }
  await speichere();
  screen.refresh();
  sounds.playSpeichern();
  sprache.sage(`Gewechselt. Du hast jetzt ${nachher}.`);
}

function gegenstaende() { return leseInventar(char()).gegenstaende || []; }

function speichereGegenstaende(liste) {
  const c = char();
  const inv = leseInventar(c);
  schreibeInventar(c, { gegenstaende: liste, waffenSets: inv.waffenSets, ruestungsSets: inv.ruestungsSets });
}

export function inventarScreen() {
  // Als build()-Screen, damit die Vorschau-Hinweise (Dukaten, Anzahl Gegenstände)
  // bei jedem Aufbau — auch beim Zurückkehren aus Geldbörse/Fach — frisch aus dem
  // Charakterbogen gerechnet werden und nie einen alten Wert zeigen.
  return {
    title: 'Inventar',
    build() {
      const g = geld();
      const gg = gegenstaende();
      const amMann = gg.filter(x => x.ort !== ORT_RUCKSACK).length;
      const imRucksack = gg.filter(x => x.ort === ORT_RUCKSACK).length;
      const c = char();
      return menuScreen({
        title: 'Inventar',
        subtitle: 'Vom Charakterbogen. Escape zurück.',
        items: [
          { label: 'Geldbörse', hint: `${g.dukaten || 0} Dukaten, ${g.silber || 0} Silber, ${g.heller || 0} Heller, ${g.kupfer || 0} Kreuzer`, onSelect: () => screen.push(geldboerseScreen()) },
          { label: 'Am Mann', hint: `${amMann} Gegenstände`, onSelect: () => screen.push(fachScreen(ORT_MANN)) },
          { label: 'Rucksack', hint: `${imRucksack} Gegenstände`, onSelect: () => screen.push(fachScreen(ORT_RUCKSACK)) },
          { label: 'Waffen', hint: `${(c.waffen || []).length} Waffen`, onSelect: () => screen.push(objektScreen('Waffen', (char().waffen || []))) },
          { label: 'Rüstungen', hint: `${(c.ruestungen || []).length} Rüstungen`, onSelect: () => screen.push(objektScreen('Rüstungen', (char().ruestungen || []))) },
          { label: 'Spiegel', hint: 'Aussehen, Titel, Status, Hintergrund und Beschreibung', onSelect: () => screen.push(spiegelScreen()) },
        ],
      }).build();
    },
  };
}

/**
 * Spiegel: alles, was den Charakter beschreibt und sonst nirgends steht — Aussehen
 * (Geschlecht, Größe, Haarfarbe … und die freien Aussehen-Zeilen), dazu Titel,
 * Sozialstatus, Kurzbeschreibung, Eigenheiten und der Hintergrund. Nur Anzeige.
 */
function spiegelScreen() {
  return {
    title: 'Spiegel',
    build() {
      const c = char();
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Spiegel'));
      let n = 0;
      const zeile = (label, wert, hint) => {
        const t = String(wert == null ? '' : wert).trim();
        if (!t) return;
        wrap.appendChild(infoZeile(`${label}: ${t}`, hint || 'Vom Charakterbogen. Nur Anzeige.'));
        n++;
      };

      zeile('Name', c.name);
      zeile('Titel', c.titel);
      zeile('Spezies', c.spezies);
      zeile('Kultur', c.kultur);
      zeile('Profession', c.profession);
      zeile('Heimat', c.heimat);
      if (typeof c.status === 'number') zeile('Sozialstatus', c.status, 'Gesellschaftlicher Stand, 0 niedrig bis 4 hoch.');

      wrap.appendChild(abschnittTitel('Aussehen'));
      for (const f of BESCHREIBUNG_FELDER) {
        if (f.key === 'titel') continue; // Titel steht schon oben
        zeile(f.label, c[f.key], f.hint ? `Zum Beispiel: ${f.hint}` : undefined);
      }
      const aus = Array.isArray(c.aussehen) ? c.aussehen : [];
      aus.forEach((z, i) => zeile(`Aussehen ${i + 1}`, z, AUSSEHEN_ZEILEN[i] ? `Frei, ${AUSSEHEN_ZEILEN[i]}.` : undefined));

      zeile('Kurzbeschreibung', c.kurzbeschreibung);

      const eig = Array.isArray(c.eigenheiten) ? c.eigenheiten : [];
      if (eig.length) {
        wrap.appendChild(abschnittTitel('Eigenheiten'));
        for (const e of eig) zeile(e.name || 'Eigenheit', [e.positiv, e.negativ].filter(Boolean).join(' / ') || e.name);
      }

      const hg = Array.isArray(c.hintergrund) ? c.hintergrund : [];
      if (hg.some(x => String(x || '').trim())) {
        wrap.appendChild(abschnittTitel('Hintergrund'));
        hg.forEach((z, i) => zeile(`Hintergrund ${i + 1}`, z, HINTERGRUND_ZEILEN[i] ? `Frei, ${HINTERGRUND_ZEILEN[i]}.` : undefined));
      }

      if (n === 0) wrap.appendChild(infoZeile('Noch keine Angaben.', 'Aussehen, Titel und Hintergrund trägst du im Charaktereditor unter Beschreibung ein.'));
      return wrap;
    },
    onShow() { sprache.sage('Spiegel.'); },
  };
}

function geldboerseScreen() {
  return {
    title: 'Geldbörse',
    build() {
      const g = geld();
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Geldbörse'));

      // Oben die haeufigen Aktionen mit automatischer Umrechnung, darunter die
      // vier Muenzzeilen zum Verstellen von Hand (Notfall, z. B. wenn der
      // Meister einen bestimmten Muenzbestand vorgibt).
      wrap.appendChild(infoZeile(`Du hast: ${standText(g)}`,
        '1 Dukat sind 10 Silbertaler, 100 Heller oder 1000 Kreuzer. '
        + 'Ausgeben und Erhalten rechnen automatisch um; die vier Zeilen darunter stellst du bei Bedarf von Hand.'));
      wrap.appendChild(aktionZeile('Geld ausgeben', () => geldAendern('aus'),
        'Münze und Anzahl wählen; es wird automatisch gewechselt'));
      wrap.appendChild(aktionZeile('Geld erhalten', () => geldAendern('ein'),
        'Münze und Anzahl wählen; es wird automatisch gewechselt'));
      wrap.appendChild(aktionZeile('Münzen wechseln/Geldbörse aufräumen', () => muenzenWechseln(),
        'räumt die Börse auf: alles in möglichst große Münzen'));

      wrap.appendChild(abschnittTitel('Von Hand verstellen'));
      const muenze = (key, name) => wertZeile({
        label: name,
        get: () => g[key] || 0,
        set: (v) => { g[key] = v; },
        min: 0, max: 100000,
        onChange: () => { speichere(); return ''; },
      });
      wrap.appendChild(muenze('dukaten', 'Dukaten'));
      wrap.appendChild(muenze('silber', 'Silber'));
      wrap.appendChild(muenze('heller', 'Heller'));
      wrap.appendChild(muenze('kupfer', 'Kreuzer'));
      return wrap;
    },
  };
}

function fachScreen(ort) {
  return {
    title: FACH[ort],
    build() {
      const a = getAbenteuer();
      const alle = gegenstaende();
      const hier = alle.filter(x => (ort === ORT_RUCKSACK ? x.ort === ORT_RUCKSACK : x.ort !== ORT_RUCKSACK));
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(FACH[ort]));

      wrap.appendChild(aktionZeile('Gegenstand hinzufügen', async () => {
        const t = await textDialog({ titel: 'Gegenstand', label: 'Bezeichnung' });
        if (!t || !t.trim()) return;
        if (!await jaNeinDialog({ titel: 'Hinzufügen', frage: `${t.trim()} wirklich hinzufügen?` })) return;
        const liste = gegenstaende();
        liste.push({ text: t.trim(), ort });
        speichereGegenstaende(liste);
        protokolliere(a, `${t.trim()} in ${FACH[ort]} gelegt.`);
        await speichere();
        screen.refresh();
        sprache.sage(`${t.trim()} hinzugefügt.`);
      }, 'Freier Text'));

      if (hier.length === 0) {
        wrap.appendChild(infoZeile('Noch nichts hier.'));
      } else {
        hier.forEach((g, i) => {
          const andererOrt = ort === ORT_RUCKSACK ? ORT_MANN : ORT_RUCKSACK;
          wrap.appendChild(aktionZeile(`${g.text}`, () => screen.push(gegenstandMenu(g, ort, andererOrt)),
            `nach ${FACH[andererOrt]} verschieben oder entfernen`));
        });
      }
      return wrap;
    },
  };
}

function gegenstandMenu(item, ort, andererOrt) {
  return menuScreen({
    title: item.text,
    subtitle: 'Escape zurück.',
    items: [
      {
        label: `Nach ${FACH[andererOrt]} verschieben`,
        onSelect: async () => {
          const a = getAbenteuer();
          const liste = gegenstaende();
          const treffer = liste.find(x => x.text === item.text && x.ort === ort);
          if (treffer) treffer.ort = andererOrt;
          speichereGegenstaende(liste);
          protokolliere(a, `${item.text} nach ${FACH[andererOrt]} verschoben.`);
          await speichere();
          screen.pop();
          screen.refresh();
          sprache.sage(`${item.text} nach ${FACH[andererOrt]} verschoben.`);
        },
      },
      {
        label: 'Entfernen',
        onSelect: async () => {
          if (!await jaNeinDialog({ titel: 'Entfernen', frage: `${item.text} wirklich entfernen?` })) return;
          const a = getAbenteuer();
          let entfernt = false;
          const liste = gegenstaende().filter(x => {
            if (!entfernt && x.text === item.text && x.ort === ort) { entfernt = true; return false; }
            return true;
          });
          speichereGegenstaende(liste);
          protokolliere(a, `${item.text} entfernt.`);
          await speichere();
          screen.pop();
          screen.refresh();
          sprache.sage(`${item.text} entfernt.`);
        },
      },
    ],
  });
}

/** Reine Übersicht (Waffen/Rüstungen) — Tragen läuft über die Sets im Editor. */
function objektScreen(titel, liste) {
  return {
    title: titel,
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(titel));
      if (!liste.length) {
        wrap.appendChild(infoZeile('Nichts vorhanden.', 'Waffen und Rüstungen legst du im Editor an; getragen wird über die Sets.'));
      } else {
        for (const o of liste) wrap.appendChild(infoZeile(o.name || String(o), 'Aus dem Charakterbogen. Tragen über die Sets im Editor.'));
      }
      return wrap;
    },
  };
}

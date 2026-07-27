/**
 * Skularis — Editor-Bereich: Vorteile
 *
 * Wie in Sephrasto werden auch Vorteile angeboten, deren Voraussetzungen noch
 * nicht erfüllt sind: Sephrasto stellt sie in Fehlerfarbe dar und lässt sie
 * trotzdem wählbar. Skularis macht dasselbe und sagt zusätzlich "nicht
 * verfügbar" voran — für den Screenreader steht das damit am Anfang der Zeile
 * und nicht irgendwo hinten. Was genau fehlt und was schon erfüllt ist, steht
 * in der Vollinfo (Shift und Pfeil-runter, oder Strg und I).
 *
 * Beim Entfernen eines Vorteils wird wie in Sephrasto vorher aufgelistet, was
 * dadurch wegfällt (Charakter.py: findUnerfüllteVoraussetzungen).
 */
import * as editor from './editor.js';
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { aktionZeile, abschnittTitel, infoZeile, verbindeDetail } from './widgets.js';
import { zahlDialog, textDialog, jaNeinDialog } from '../ui/dialog.js';
import { auswahlScreen } from '../ui/auswahl-screen.js';
import { pruefeDetail, lesbar } from '../core/voraussetzungen.js';
import { findeVerlorenes } from '../core/character.js';
import { regelAnhangText } from '../core/regelwerk.js';
import { bauInfo } from '../core/infotext.js';
import { VORTEILE_KURZ, VORTEILE_LANG } from './texte.js';

function name(eintrag) { return typeof eintrag === 'string' ? eintrag : eintrag.name; }

/** Wie oft ein Vorteil im Spiel noch dazugekauft werden kann. */
const NACHKAUF_TEXT = {
  'häufig': 'Nachkauf im Spiel ist häufig möglich.',
  'üblich': 'Nachkauf im Spiel ist üblich.',
  'selten': 'Nachkauf im Spiel ist selten.',
  'extrem selten': 'Nachkauf im Spiel ist extrem selten und bleibt besonderen Gestalten vorbehalten.',
  'nicht möglich': 'Ein Nachkauf im Spiel ist nicht möglich, dieser Vorteil muss bei der Erschaffung gewählt werden.',
};

/**
 * Vollinfo eines Vorteils, gegliedert für Shift und Pfeil sowie das Info-Fenster
 * mit Strg und I. Mit Überschriften, zwischen denen Strg und Pfeil springen.
 */
function vorteilDetail(char, db, v) {
  const abschnitte = [
    [v.name, v.variableKosten ? 'Kosten variabel.' : `${v.kosten} EP.`],
  ];

  if (v.voraussetzungen) {
    const d = pruefeDetail(char, db, v.voraussetzungen);
    const zeilen = [];
    if (d.offen.length) zeilen.push('Es fehlt noch: ' + d.offen.join(', ') + '.');
    if (d.erledigt.length) zeilen.push('Bereits erfüllt: ' + d.erledigt.join(', ') + '.');
    if (!zeilen.length) zeilen.push(lesbar(db, v.voraussetzungen) + '.');
    abschnitte.push(['Voraussetzungen', ...zeilen]);
  } else {
    abschnitte.push(['Voraussetzungen', 'Keine.']);
  }

  if (v.nachkauf && NACHKAUF_TEXT[v.nachkauf]) abschnitte.push(['Nachkauf', NACHKAUF_TEXT[v.nachkauf]]);
  if (v.text || v.info) abschnitte.push(['Beschreibung', v.text, v.info]);

  if (v.querverweise) {
    const ziele = String(v.querverweise).split('|')
      .filter(s => !s.trim().startsWith('Regel:'))
      .map(s => s.split(':').pop().trim()).filter(Boolean);
    if (ziele.length) abschnitte.push(['Siehe auch', [...new Set(ziele)]]);
  }

  const regeln = regelAnhangText(db, 'Vorteil', v.name, v.querverweise);
  if (regeln) abschnitte.push(['Regeln', regeln]);

  return bauInfo(abschnitte);
}

/** Vorteil hinzufügen und die Liste der gewählten Vorteile in einen Container hängen. */
export function vorteileInhalt(box) {
  const char = editor.getChar();
  const db = editor.getDb();
  const habenNamen = new Set(char.vorteile.map(name));

  const offen = db.vorteile.filter(v => !habenNamen.has(v.name));
  const gesperrt = offen.filter(v => !pruefeDetail(char, db, v.voraussetzungen).erfuellt).length;

  box.appendChild(aktionZeile(
    `Vorteil hinzufügen, ${offen.length - gesperrt} verfügbar, ${gesperrt} noch nicht`,
    () => {
      const eintraege = offen.map(v => {
        const d = pruefeDetail(char, db, v.voraussetzungen);
        const kosten = v.variableKosten ? 'variabel' : `${v.kosten} EP`;
        return {
          // "Nicht verfügbar" steht bewusst vorn, damit der Screenreader es
          // zuerst liest und man nicht bis zum Zeilenende warten muss.
          label: d.erfuellt ? `${v.name}, ${kosten}` : `Nicht verfügbar: ${v.name}, ${kosten}`,
          wert: v.name,
          gesperrt: !d.erfuellt,
          detail: vorteilDetail(char, db, v),
        };
      });
      auswahlScreen({
        titel: 'Vorteil wählen',
        eintraege,
        onWahl: async (gewaehlt) => {
          const v = db.vorteilByName[gewaehlt];
          const d = pruefeDetail(char, db, v.voraussetzungen);
          const frage = d.erfuellt
            ? `${gewaehlt} wirklich hinzufügen?`
            : `${gewaehlt} ist nicht verfügbar. Es fehlt: ${d.offen.join(', ')}. Trotzdem hinzufügen?`;
          if (!await jaNeinDialog({ titel: 'Hinzufügen', frage })) return;

          let neu;
          if (v.variableKosten) {
            const kosten = await zahlDialog({ titel: `${v.name}: Kosten`, label: 'EP-Kosten', wert: v.kosten, min: -1000, max: 10000 });
            if (kosten === null) return;
            let kommentar = '';
            if (v.kommentar) kommentar = (await textDialog({ titel: `${v.name}: Kommentar`, label: 'Kommentar, zum Beispiel Umgebung oder Gruppe', wert: '' })) || '';
            neu = { name: v.name, kosten, kommentar };
          } else {
            neu = v.name;
          }
          char.vorteile.push(neu);
          const f2 = editor.aktualisiere();
          screen.refresh();
          const hinweis = d.erfuellt ? '' : ' Achtung, Voraussetzung nicht erfüllt.';
          sprache.sage(`${v.name} hinzugefügt, ${f2} EP frei.${hinweis}`);
        },
      });
    },
    'Öffnet eine durchsuchbare Liste aller Vorteile',
  ));

  if (char.vorteile.length === 0) {
    box.appendChild(infoZeile('Noch keine Vorteile gewählt.'));
    return;
  }

  for (const eintrag of [...char.vorteile]) {
    const n = name(eintrag);
    const v = db.vorteilByName[n];
    const kosten = (typeof eintrag === 'object' && typeof eintrag.kosten === 'number') ? eintrag.kosten : (v ? v.kosten : 0);
    const komm = (typeof eintrag === 'object' && eintrag.kommentar) ? `, ${eintrag.kommentar}` : '';
    const d = v ? pruefeDetail(char, db, v.voraussetzungen) : { erfuellt: true, offen: [], erledigt: [] };
    const vorn = d.erfuellt ? '' : 'Voraussetzung fehlt: ';

    const zeile = aktionZeile(
      `${vorn}${n}${komm}, ${kosten} EP, entfernen`,
      () => entferne(char, db, n),
      'Vorteil entfernen',
      v ? vorteilDetail(char, db, v) : '',
    );
    if (!d.erfuellt) zeile.classList.add('ed-gesperrt');
    box.appendChild(zeile);
  }
}

async function entferne(char, db, n) {
  const verlust = findeVerlorenes(char, db, n);
  const teile = [];
  if (verlust.vorteile.length) teile.push(`Vorteile: ${verlust.vorteile.join(', ')}`);
  if (verlust.talente.length) teile.push(`Talente: ${verlust.talente.join(', ')}`);
  if (verlust.fertigkeiten.length) teile.push(`übernatürliche Fertigkeiten: ${verlust.fertigkeiten.join(', ')}`);

  const frage = teile.length
    ? `${n} entfernen? Ohne diesen Vorteil verlieren folgende Einträge ihre Voraussetzung. ${teile.join('. ')}.`
    : `${n} wirklich entfernen?`;
  if (!await jaNeinDialog({ titel: 'Entfernen', frage })) return;

  char.vorteile = char.vorteile.filter(x => name(x) !== n);
  const f2 = editor.aktualisiere();
  screen.refresh();
  sprache.sage(`${n} entfernt, ${f2} EP frei.`);
}

export function vorteileScreen() {
  return {
    title: '',
    build() {
      const frei = editor.aktualisiere();
      this.title = `Vorteile, ${frei} EP frei`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Vorteile'));
      wrap.appendChild(infoZeile(VORTEILE_KURZ, VORTEILE_LANG));

      const box = document.createElement('div');
      vorteileInhalt(box);
      wrap.appendChild(box);

      verbindeDetail(wrap);
      return wrap;
    },
  };
}

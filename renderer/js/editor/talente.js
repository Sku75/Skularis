/**
 * Skularis — Talent-Verwaltung für eine (übernatürliche) Fertigkeit.
 *
 * Wie in Sephrasto (CharakterTalentPickerWrapper) werden nur die Talente zur
 * Auswahl gestellt, deren Voraussetzungen der Charakter erfüllt. Für einen
 * Gildenmagier sind das bei Einfluss 22 statt aller 73 Zauber. Talente, deren
 * Voraussetzung fehlt, werden nicht aufgeführt — Sephrasto blendet sie
 * ebenfalls aus; was sie freischalten würde, steht im Übersichtstext.
 */
import * as editor from './editor.js';
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { aktionZeile, abschnittTitel, infoZeile, verbindeDetail } from './widgets.js';
import { auswahlScreen } from '../ui/auswahl-screen.js';
import { jaNeinDialog } from '../ui/dialog.js';
import { talentKostenFuer } from '../core/regeln.js';
import { pruefe, pruefeDetail, lesbar } from '../core/voraussetzungen.js';
import { hatTalent, setzeTalent, entferneTalent } from '../core/character.js';
import { regelAnhangText } from '../core/regelwerk.js';
import { bauInfo } from '../core/infotext.js';

/** Wie ein Talent heißt: Zauber, Liturgie, Anrufung oder Talent. */
export function talentArt(db, def) {
  if (!def || def.spezialTyp === null || def.spezialTyp === undefined) return 'Talent';
  return (db.spezialTypen && db.spezialTypen[def.spezialTyp]) || 'Talent';
}

/**
 * Vollinfo eines Talents für Shift und Pfeil-runter sowie für das Info-Fenster
 * mit Strg und I: Art, Kosten, Fundstelle im Regelwerk, zugehörige
 * Fertigkeiten, Voraussetzungen und die Beschreibung.
 */
export function talentDetail(char, db, name, sf) {
  const def = db.talentByName[name];
  if (!def) return name;

  const art = talentArt(db, def);
  const kosten = talentKostenFuer(char, db, name, sf);
  const geschenkt = Object.prototype.hasOwnProperty.call(char.geschenkteTalente || {}, name);
  const abschnitte = [
    [name, `${art}, ${geschenkt ? 'kostenlos durch einen Vorteil' : `${kosten} EP`}.`],
  ];

  // Standard-Reihenfolge: zuerst die Beschreibung (was es tut), dann die
  // Voraussetzungen, erst danach die Herkunft (Buchseite, Fertigkeiten).
  if (def.text || def.info) abschnitte.push(['Beschreibung', def.text, def.info]);

  if (def.voraussetzungen) {
    const d = pruefeDetail(char, db, def.voraussetzungen);
    abschnitte.push(['Voraussetzungen', d.offen.length
      ? `Es fehlt noch: ${d.offen.join(', ')}.`
      : `Erfüllt: ${lesbar(db, def.voraussetzungen)}.`]);
  }

  const kopf = [];
  if (def.referenzseite) {
    const buch = (db.referenzbuecher && db.referenzbuecher[def.referenzbuch]) || 'Ilaris';
    kopf.push(`Nachzulesen in ${buch}, Seite ${def.referenzseite}.`);
  }
  if (def.fertigkeiten.length > 1) kopf.push(`Zählt zu den Fertigkeiten ${def.fertigkeiten.join(', ')}.`);
  if (kopf.length) abschnitte.push(['Herkunft', ...kopf]);

  const regeln = regelAnhangText(db, 'Talent', name, '');
  if (regeln) abschnitte.push(['Regeln', regeln]);

  return bauInfo(abschnitte);
}

/**
 * Talente einer Fertigkeit in drei Gruppen: gewählt, verfügbar, gesperrt.
 * Wird auch von fertigkeiten.js und uebernatuerliches.js für den
 * Übersichtstext genutzt.
 */
export function talentGruppen(char, db, fname) {
  const alle = db.talenteByFertigkeit[fname] || [];
  const gewaehlt = [];
  const verfuegbar = [];
  const gesperrt = [];
  for (const t of alle) {
    // Ein Talent gehört oft zu mehreren Fertigkeiten. Der Charakter führt es
    // nur einmal, es gilt also unter jeder davon als gewählt.
    if (hatTalent(char, t.name)) gewaehlt.push(t);
    else if (char.voraussetzungenPruefen === false || pruefe(char, db, t.voraussetzungen)) verfuegbar.push(t);
    else gesperrt.push(t);
  }
  return { alle, gewaehlt, verfuegbar, gesperrt };
}

/**
 * Übersichtstext für eine Fertigkeit: was umfasst sie, was ist davon schon da.
 * Steht im Detailfeld bewusst VOR der Probenrechnung.
 */
export function talentUebersicht(char, db, fname) {
  const g = talentGruppen(char, db, fname);
  if (!g.alle.length) return `${fname} hat keine Talente.`;

  const teile = [];
  if (g.gewaehlt.length) {
    teile.push(`${fname} umfasst bei dir ${g.gewaehlt.length} von ${g.verfuegbar.length + g.gewaehlt.length} `
      + `verfügbaren Talenten: ${g.gewaehlt.map(t => t.name).join(', ')}.`);
  } else {
    teile.push(`${fname} umfasst ${g.verfuegbar.length} für dich verfügbare Talente, noch keines gewählt.`);
  }
  if (g.verfuegbar.length) {
    teile.push(`Noch offen: ${g.verfuegbar.map(t => t.name).join(', ')}.`);
  }
  if (g.gesperrt.length) {
    teile.push(`${g.gesperrt.length} weitere Talente setzen Vorteile voraus, die dir fehlen.`);
  }
  return teile.join(' ');
}

export function talentScreen(fname, isUeber) {
  return {
    title: '',
    build() {
      const char = editor.getChar();
      const db = editor.getDb();
      const fdef = isUeber ? db.uebernatByName[fname] : db.fertigkeitByName[fname];
      const map = isUeber ? char.uebernatuerlich : char.fertigkeiten;
      if (!map[fname]) map[fname] = { wert: 0 };
      const sf = fdef ? fdef.steigerungsfaktor : (isUeber ? 2 : 1);

      const frei = editor.aktualisiere();
      this.title = `Talente ${fname}, ${frei} EP frei`;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel(`Talente: ${fname}`));

      const g = talentGruppen(char, db, fname);
      wrap.appendChild(infoZeile(talentUebersicht(char, db, fname), uebersichtLang(char, db, g)));

      wrap.appendChild(aktionZeile(
        `Talent hinzufügen, ${g.verfuegbar.length} verfügbar`,
        () => {
          if (!g.verfuegbar.length) {
            sprache.sage(g.gesperrt.length
              ? `Keine weiteren Talente verfügbar. ${g.gesperrt.length} setzen Vorteile voraus, die dir fehlen.`
              : 'Keine weiteren Talente verfügbar.');
            return;
          }
          const eintraege = g.verfuegbar.map(t => ({
            label: `${t.name}, ${talentArt(db, t)}, ${talentKostenFuer(char, db, t.name, sf)} EP`,
            wert: t.name,
            detail: talentDetail(char, db, t.name, sf),
          }));
          auswahlScreen({
            titel: `Talent für ${fname}`,
            eintraege,
            onWahl: async (val) => {
              const auch = (db.talentByName[val]?.fertigkeiten || []).filter(x => x !== fname);
              const zusatz = auch.length ? ` Es zählt auch zu ${auch.join(', ')}.` : '';
              if (!await jaNeinDialog({
                titel: 'Hinzufügen',
                frage: `${val} wirklich hinzufügen?${zusatz}`,
              })) return;
              setzeTalent(char, val);
              const f2 = editor.aktualisiere();
              screen.refresh();
              sprache.sage(`${val} hinzugefügt, ${f2} EP frei.${zusatz}`);
            },
          });
        },
        'Öffnet eine durchsuchbare Liste',
      ));

      if (g.gewaehlt.length === 0) {
        wrap.appendChild(infoZeile('Noch keine Talente gewählt.'));
      } else {
        for (const t of g.gewaehlt) {
          const tname = t.name;
          const def = db.talentByName[tname];
          const geschenkt = Object.prototype.hasOwnProperty.call(char.geschenkteTalente || {}, tname);
          const auch = (def?.fertigkeiten || []).filter(x => x !== fname);
          const info = talentDetail(char, db, tname, sf);

          if (geschenkt) {
            wrap.appendChild(infoZeile(`${tname}, kostenlos durch einen Vorteil`, info));
            continue;
          }
          wrap.appendChild(aktionZeile(`${tname}, entfernen`, async () => {
            const zusatz = auch.length ? ` Es verschwindet dann auch bei ${auch.join(', ')}.` : '';
            if (!await jaNeinDialog({ titel: 'Entfernen', frage: `${tname} wirklich entfernen?${zusatz}` })) return;
            entferneTalent(char, tname);
            const f2 = editor.aktualisiere();
            screen.refresh();
            sprache.sage(`${tname} entfernt, ${f2} EP frei.`);
          }, 'Talent entfernen', info));
        }
      }

      verbindeDetail(wrap);
      return wrap;
    },
  };
}

/** Vollinfo zur Übersicht: welche Vorteile würden die gesperrten Talente freischalten? */
function uebersichtLang(char, db, g) {
  if (!g.gesperrt.length) return 'Alle Talente dieser Fertigkeit stehen dir offen.';
  // Nach fehlender Voraussetzung gruppieren, damit die Ansage kurz bleibt.
  const nachBedingung = new Map();
  for (const t of g.gesperrt) {
    const d = pruefeDetail(char, db, t.voraussetzungen);
    const schluessel = d.offen.join(', ') || lesbar(db, t.voraussetzungen);
    if (!nachBedingung.has(schluessel)) nachBedingung.set(schluessel, []);
    nachBedingung.get(schluessel).push(t.name);
  }
  const zeilen = [...nachBedingung]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([bedingung, namen]) => `Mit ${bedingung} kämen ${namen.length} dazu: ${namen.slice(0, 8).join(', ')}`
      + (namen.length > 8 ? ' und weitere' : '') + '.');
  return 'Gesperrte Talente dieser Fertigkeit. ' + zeilen.join(' ');
}

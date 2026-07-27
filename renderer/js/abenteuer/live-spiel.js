/**
 * Skularistool — Abenteuer-Bereich: Live-Spiel.
 * Würfelbecher (Schnellwürfe + freier Wurf, Ergebnis ansagen und nachlesbar)
 * und Charakterstatus (Ressourcenzähler verstellbar, Kampfwerte und Waffe lesbar).
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { wertZeile, infoZeile, abschnittTitel, verbindeDetail } from '../editor/widgets.js';
import { zahlDialog } from '../ui/dialog.js';
import { auswahlScreen } from '../ui/auswahl-screen.js';
import { abgeleiteteWerte, waffenwerte, waffenwerteText, fertigkeitProbenwert } from '../core/regeln.js';
import { getDb } from '../core/db-laden.js';
import { leseInventar, setText, SLOTS } from '../core/ausruestung.js';
import { protokolliere } from '../core/abenteuer.js';
import { getAbenteuer, speichere } from './state.js';

const RES_NAME = {
  Wunden: 'Wunden', Erschoepfung: 'Erschöpfung', SchiP: 'Schicksalspunkte',
  AsP: 'Astralpunkte', KaP: 'Karmapunkte', GuP: 'Gunstpunkte',
};
const ATTR_NAME = {
  KO: 'Konstitution', MU: 'Mut', GE: 'Gewandtheit', KK: 'Körperkraft',
  IN: 'Intuition', KL: 'Klugheit', CH: 'Charisma', FF: 'Fingerfertigkeit',
};

export function liveSpielScreen() {
  return menuScreen({
    title: 'Live-Spiel',
    subtitle: 'Würfeln und Charakterstatus. Escape zurück.',
    items: [
      { label: 'Schnellwurf 1 W6', ergebnisId: 'w6', onSelect: () => wuerfeln(1, 6, 0, 'w6') },
      { label: 'Schnellwurf 1 W20', ergebnisId: 'w20', onSelect: () => wuerfeln(1, 20, 0, 'w20') },
      { label: 'Schnellwurf 3 W20', ergebnisId: 'w20x3', onSelect: () => wuerfeln(3, 20, 0, 'w20x3') },
      { label: 'Freier Wurf', hint: 'Anzahl, Würfeltyp und Modifikator wählen', ergebnisId: 'frei', onSelect: freierWurf },
      {
        label: 'Kampfwerte',
        hint: 'Was gilt: Proben, Waffensets, Verteidigung',
        detail: 'Alle Werte, die im Kampf gewürfelt werden: die Probenwerte der Kampffertigkeiten, '
          + 'jedes Waffenset einzeln mit Attacke und Verteidigung, und die abgeleiteten Werte.',
        onSelect: () => screen.push(kampfwerteScreen()),
      },
    ],
  });
}

/**
 * Kampfwerte: was am Spieltisch gewürfelt wird. Erst die Werte, die immer
 * gelten, dann jedes Waffenset einzeln — so wie es im Editor zusammengestellt
 * wurde.
 */
export function kampfwerteScreen() {
  const a = getAbenteuer();
  const char = a.charakter;
  const db = getDb();
  const w = abgeleiteteWerte(char);
  const items = [];
  const eintrag = (label, detail) => items.push({ label, detail: detail || '', onSelect: () => {} });

  eintrag(`Initiative: ${w.INI}`, 'Gleich dem Attribut Intuition. Wird zu Beginn des Kampfes gewürfelt.');
  eintrag(`Wundschwelle: ${w.WS}`, 'Ab dieser Schadenshöhe gibt es eine Wunde. 4 plus Konstitution durch 4, plus Rüstungsschutz.');
  eintrag(`Magieresistenz: ${w.MR}`, '4 plus Mut durch 4.');
  eintrag(`Geschwindigkeit: ${w.GS}`, '4 plus Gewandtheit durch 4, minus Behinderung.');
  eintrag(`Durchhaltevermögen: ${w.DH}`, 'Konstitution minus zweimal Behinderung.');
  eintrag(`Schadensbonus: ${w.SB}`, 'Körperkraft durch 4, kommt auf jeden Waffenschaden.');
  eintrag(`Rüstungsschutz: ${w.RS}, Behinderung: ${w.BE}`, 'Aus der ersten angelegten Rüstung.');

  // Kampffertigkeiten mit ihren Probenwerten
  if (db) {
    for (const f of db.fertigkeiten.filter(x => x.kampffertigkeit === 1)) {
      const fw = char.fertigkeiten?.[f.name]?.wert || 0;
      if (!fw) continue;
      eintrag(`${f.name}: Probenwert ${fertigkeitProbenwert(char, f, fw, true)} mit Talent, `
        + `${fertigkeitProbenwert(char, f, fw, false)} ohne`,
        `Fertigkeitswert ${fw}. Mit passendem Talent zählt der volle Wert, ohne der halbe.`);
    }

    // Jedes Waffenset einzeln
    const inv = leseInventar(char);
    for (const set of inv.waffenSets) {
      eintrag(`Set ${set.name}: ${setText(set)}`, `Waffenset ${set.name}. ${setText(set)}.`);
      for (const slot of SLOTS) {
        const name = set[slot.toLowerCase()];
        if (!name) continue;
        const waffe = (char.waffen || []).find(x => x.name === name);
        if (!waffe) continue;
        const k = waffenwerte(char, db, waffe);
        eintrag(`  ${slot} ${name}: Attacke ${k.at === null ? 'nicht möglich' : k.at}, `
          + `Verteidigung ${k.vt === null ? 'nicht möglich' : k.vt}`,
          waffenwerteText(char, db, waffe));
      }
    }
  }

  return menuScreen({
    title: 'Kampfwerte',
    subtitle: 'Nur zum Ansehen. Oben filtern, Shift und Pfeil-runter liest Details. Escape zurück.',
    items,
    filter: true,
  });
}

async function freierWurf() {
  const anzahl = await zahlDialog({ titel: 'Freier Wurf', label: 'Anzahl der Würfel', wert: 1, min: 1, max: 50 });
  if (anzahl === null) return;
  auswahlScreen({
    titel: 'Würfeltyp wählen',
    eintraege: [{ label: 'W6', wert: 6 }, { label: 'W20', wert: 20 }],
    onWahl: async (seiten) => {
      const mod = await zahlDialog({ titel: 'Modifikator', label: 'Modifikator, 0 wenn keiner', wert: 0, min: -100, max: 100 });
      if (mod === null) return;
      wuerfeln(anzahl, seiten, mod, 'frei');
    },
  });
}

/**
 * Das Ergebnis rechts in die Zeile schreiben, aus der gewürfelt wurde, und in
 * die Beschriftung des Schalters übernehmen. Sehende sehen es damit direkt
 * neben dem Schalter, und wer später wieder auf die Zeile kommt, hört den
 * letzten Wurf mit.
 */
function zeigeErgebnis(id, kurz, ansage) {
  if (!id) return;
  const feld = document.querySelector(`[data-ergebnis="${id}"]`);
  if (feld) feld.textContent = kurz;
  const schalter = document.querySelector(`[data-ergebnis-ziel="${id}"]`);
  if (schalter) schalter.setAttribute('aria-label', ansage);
}

function wuerfeln(anzahl, seiten, mod, id) {
  const a = getAbenteuer();
  const wuerfe = [];
  for (let i = 0; i < anzahl; i++) wuerfe.push(1 + Math.floor(Math.random() * seiten));
  const summe = wuerfe.reduce((s, n) => s + n, 0) + mod;
  const bez = `${anzahl} W ${seiten}${mod ? (mod > 0 ? ` plus ${mod}` : ` minus ${-mod}`) : ''}`;
  // Summe nur nennen, wenn ein Modifikator im Spiel ist (z. B. Schadenswurf).
  const summeText = mod ? `, Summe ${summe}` : '';
  sounds.playWuerfel();
  protokolliere(a, `Wurf ${bez}: ${wuerfe.join(', ')}${summeText}.`);
  speichere();

  const ansage = `Gewürfelt, ${bez}, Ergebnis: ${wuerfe.join(', ')}${summeText}.`;
  // Kurzform für die Anzeige: die Augen, bei Modifikator zusätzlich die Summe.
  zeigeErgebnis(id, mod ? `${wuerfe.join(' ')} = ${summe}` : wuerfe.join(' '), ansage);
  // Bleibt im Würfelmenü; nur eine kurze Ansage, kein neuer Bildschirm.
  sprache.sage(ansage);
}

export function charakterstatusScreen() {
  return {
    title: 'Charakterstatus',
    build() {
      const a = getAbenteuer();
      const char = a.charakter;
      const w = abgeleiteteWerte(char);

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Charakterstatus'));

      // Ressourcen, verstellbar
      for (const key of Object.keys(a.ressourcen)) {
        const r = a.ressourcen[key];
        const name = RES_NAME[key] || key;
        wrap.appendChild(wertZeile({
          label: name,
          get: () => r.aktuell,
          set: (v) => { r.aktuell = v; },
          min: 0,
          max: (r.max !== undefined) ? r.max : 999,
          suffix: () => (r.max !== undefined ? `von ${r.max}` : ''),
          onChange: () => { protokolliere(a, `${name} auf ${r.aktuell}.`); speichere(); return (r.max !== undefined ? `von ${r.max}` : ''); },
        }));
      }

      // Kampfwerte, nur lesbar
      wrap.appendChild(abschnittTitel('Werte zum Lesen'));
      for (const k of ['KO', 'MU', 'GE', 'KK', 'IN', 'KL', 'CH', 'FF']) {
        wrap.appendChild(infoZeile(`${ATTR_NAME[k]} ${k}: ${char.attribute[k] || 0}`));
      }
      wrap.appendChild(infoZeile(`Wundschwelle: ${w.WS}`, '4 plus Konstitution durch 4, plus Rüstungsschutz.'));
      wrap.appendChild(infoZeile(`Magieresistenz: ${w.MR}`, '4 plus Mut durch 4.'));
      wrap.appendChild(infoZeile(`Geschwindigkeit: ${w.GS}`, '4 plus Gewandtheit durch 4, minus Behinderung.'));
      wrap.appendChild(infoZeile(`Initiative: ${w.INI}`, 'Gleich dem Attribut Intuition.'));
      wrap.appendChild(infoZeile(`Schadensbonus: ${w.SB}`, 'Körperkraft durch 4.'));
      wrap.appendChild(infoZeile(`Durchhaltevermögen: ${w.DH}`, 'Konstitution minus zweimal Behinderung.'));
      wrap.appendChild(infoZeile(`Rüstungsschutz: ${w.RS}, Behinderung: ${w.BE}`, 'Aus der ersten angelegten Rüstung.'));

      // Ausgerüstete Waffen, nur lesbar
      const waffen = (char.waffen || []).filter(x => x.name);
      if (waffen.length) {
        wrap.appendChild(abschnittTitel('Ausgerüstete Waffen'));
        const db = getDb();
        for (const wa of waffen) {
          const k = db ? waffenwerte(char, db, wa) : null;
          const werte = k
            ? `Attacke ${k.at === null ? 'nicht möglich' : k.at}, Verteidigung ${k.vt === null ? 'nicht möglich' : k.vt}`
            : `Schaden ${wa.wuerfel || 0} W ${wa.wuerfelSeiten || 6}`;
          wrap.appendChild(infoZeile(`${wa.name}: ${werte}`,
            db ? waffenwerteText(char, db, wa) + ` Härte ${wa.haerte || 0}.` : `Härte ${wa.haerte || 0}.`));
        }
      }
      verbindeDetail(wrap);
      return wrap;
    },
  };
}

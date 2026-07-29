/**
 * Skularistool — Abenteuer-Bereich: Live-Spiel.
 * Würfelbecher (Schnellwürfe + freier Wurf, Ergebnis ansagen und nachlesbar)
 * und Charakterstatus (Ressourcenzähler verstellbar, Kampfwerte und Waffe lesbar).
 */
import * as screen from '../ui/screen.js';
import { menuScreen } from '../ui/menu-screen.js';
import { wertZeile, infoZeile, abschnittTitel, verbindeDetail } from '../editor/widgets.js';
import { zahlDialog, knopfDialog } from '../ui/dialog.js';
import { abgeleiteteWerte, waffenwerte, waffenwerteText, fertigkeitProbenwert, wundabzug } from '../core/regeln.js';
import { getDb } from '../core/db-laden.js';
import { leseInventar, istFernkampf, SLOTS, SET_WAFFENLOS } from '../core/ausruestung.js';
import { protokolliere } from '../core/abenteuer.js';
import { getAbenteuer, speichere } from './state.js';
import { wuerfeln, kampfProbe, schadenWurf } from './wuerfel-kern.js';
import { aktionenScreen, manoeverScreen, zauberScreen, zauberVorhanden, zauberKategorieLabel, GRUNDREGEL_AKTIONEN } from './kampf-menues.js';

const RES_NAME = {
  Wunden: 'Wunden', Erschoepfung: 'Erschöpfung', SchiP: 'Schicksalspunkte',
  AsP: 'Astralpunkte', KaP: 'Karmapunkte', GuP: 'Gunstpunkte',
};
const ATTR_NAME = {
  KO: 'Konstitution', MU: 'Mut', GE: 'Gewandtheit', KK: 'Körperkraft',
  IN: 'Intuition', KL: 'Klugheit', CH: 'Charisma', FF: 'Fingerfertigkeit',
};
const EINSCHR_REGEL = 'Wunden und Erschöpfung zählen zusammen als Einschränkungen. '
  + 'Ab der dritten Einschränkung sind alle Proben um zwei erschwert, je weitere um zwei mehr: '
  + 'drei gleich minus zwei, vier gleich minus vier, fünf gleich minus sechs. '
  + 'Ab fünf Einschränkungen droht nach jeder weiteren die Kampfunfähigkeit. Sehr hohe Werte führen zum Tod.';

export function liveSpielScreen() {
  const a = getAbenteuer();
  const char = a.charakter;
  const db = getDb();
  const items = [
    { label: 'Schnellwurf 1 W6', ergebnisId: 'w6', onSelect: () => wuerfeln(1, 6, 0, 'w6') },
    { label: 'Schnellwurf 1 W20', ergebnisId: 'w20', onSelect: () => wuerfeln(1, 20, 0, 'w20') },
    { label: 'Schnellwurf 3 W20', ergebnisId: 'w20x3', onSelect: () => wuerfeln(3, 20, 0, 'w20x3') },
    { label: 'Freier Wurf', hint: 'Anzahl, Würfeltyp und Modifikator wählen', ergebnisId: 'frei', onSelect: freierWurf },
    { label: 'Aktionen', hint: 'Was du in deiner Initiativephase tun kannst', detail: GRUNDREGEL_AKTIONEN, onSelect: () => screen.push(aktionenScreen()) },
    {
      label: 'Kampfwerte',
      hint: 'Proben und Schaden je Waffe, dazu die abgeleiteten Werte',
      detail: 'Die abgeleiteten Werte, die Probenwerte der Kampffertigkeiten und je Waffe die '
        + 'Proben für Attacke, Verteidigung und Schaden.',
      onSelect: () => screen.push(kampfwerteScreen()),
    },
    { label: 'Manöver', hint: 'Nahkampf-Manöver mit ihrer Wirkung', onSelect: () => screen.push(manoeverScreen()) },
  ];
  if (zauberVorhanden(char, db)) {
    items.push({ label: zauberKategorieLabel(char, db), hint: 'Deine bekannten Zauber würfeln', onSelect: () => screen.push(zauberScreen()) });
  }
  return menuScreen({
    title: 'Live-Spiel',
    subtitle: 'Würfeln, Aktionen, Kampfwerte, Manöver und Zauber. Escape zurück.',
    items,
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

  eintrag(`Initiative: ${w.INI}`, 'Bestimmt die Reihenfolge im Kampf: wer den höheren Wert hat, handelt zuerst. Zu Kampfbeginn wird 1 W20 plus Initiative gewürfelt. Wert: gleich dem Attribut Intuition.');
  eintrag(`Wundschwelle: ${w.WS}`, 'Modifizierte Wundschwelle, sie enthält den Rüstungsschutz der getragenen Rüstung. Schaden, der über diesem Wert liegt, verursacht eine Wunde; über dem Doppelten zwei, über dem Dreifachen drei, und so weiter. Grundwert ohne Rüstung: 4 plus Konstitution durch 4.');
  eintrag(`Magieresistenz: ${w.MR}`, 'Schwierigkeit, dich mit schädlicher Magie zu treffen. Bei Zaubern gegen die Magieresistenz wird der Wurf des Zaubernden dagegen verglichen. Wert: 4 plus Mut durch 4.');
  eintrag(`Geschwindigkeit: ${w.GS}`, `So viele Schritt kannst du dich mit einer einfachen Aktion Bewegung fortbewegen, hier also ${w.GS} Schritt. Geradeaus vorwärts das Doppelte, ganz ohne Gepäck und Rüstung das Vierfache; auf unsicherem Boden die Hälfte, kniend ein Viertel. Wert: 4 plus Gewandtheit durch 4, minus Behinderung.`);
  eintrag(`Durchhaltevermögen: ${w.DH}`, 'Deine Reserve gegen Erschöpfung durch Anstrengung, Hitze oder Kälte. Wert: Konstitution minus zweimal Behinderung.');
  eintrag(`Schadensbonus: ${w.SB}`, 'Kommt zu jedem Waffenschaden hinzu. Wert: Körperkraft durch 4.');
  eintrag(`Rüstungsschutz: ${w.RS}, Behinderung: ${w.BE}`, 'Rüstungsschutz senkt eingehenden Schaden und hebt die Wundschwelle. Behinderung verringert Geschwindigkeit und Durchhaltevermögen. Beides stammt aus der ersten angelegten Rüstung.');

  // Kampffertigkeiten mit ihren Probenwerten
  if (db) {
    for (const f of db.fertigkeiten.filter(x => x.kampffertigkeit === 1)) {
      const fw = char.fertigkeiten?.[f.name]?.wert || 0;
      if (!fw) continue;
      eintrag(`${f.name}: Probenwert ${fertigkeitProbenwert(char, f, fw, true)} mit Talent, `
        + `${fertigkeitProbenwert(char, f, fw, false)} ohne`,
        `Fertigkeitswert ${fw}. Mit passendem Talent zählt der volle Wert, ohne der halbe.`);
    }

    // Waffen: ein Set bestimmt Haupthand, Nebenhand und Fernkampf. Je Waffe die
    // Proben Attacke, Verteidigung (nicht im Fernkampf) und Schaden auswürfeln.
    const inv = leseInventar(char);
    const slotWaffen = bestimmeSlotWaffen(char, db, inv);
    const kurz = { Haupthand: 'hh', Nebenhand: 'nh', Fernkampf: 'fk' };
    for (const slot of SLOTS) {
      const waffe = slotWaffen[slot];
      if (!waffe) continue;
      const k = waffenwerte(char, db, waffe);
      const key = kurz[slot];
      const detailText = waffenwerteText(char, db, waffe);
      if (k.at !== null) {
        items.push({
          label: `${slot} ${waffe.name}: Attacke ${k.at}`,
          hint: 'Enter würfelt die Attacke-Probe',
          detail: detailText,
          ergebnisId: `${key}-at`,
          onSelect: () => kampfProbe({ id: `${key}-at`, titel: `Attacke ${slot} ${waffe.name}`, vokabel: 'Attacke', probenwert: k.at }),
        });
      }
      if (slot !== 'Fernkampf' && k.vt !== null) {
        items.push({
          label: `${slot} ${waffe.name}: Verteidigung ${k.vt}`,
          hint: 'Enter würfelt die Verteidigungs-Probe',
          detail: detailText,
          ergebnisId: `${key}-vt`,
          onSelect: () => kampfProbe({ id: `${key}-vt`, titel: `Verteidigung ${slot} ${waffe.name}`, vokabel: 'Verteidigung', probenwert: k.vt }),
        });
      }
      const tp = k.tp || 0;
      const schadenBonus = tp + w.SB;
      items.push({
        label: `${slot} ${waffe.name}: Schaden auswürfeln`,
        hint: `${waffe.wuerfel || 0} W ${waffe.wuerfelSeiten || 6} plus Waffenbonus und Schadensbonus`,
        detail: `Schaden ${waffe.wuerfel || 0} W ${waffe.wuerfelSeiten || 6}, dazu Waffenbonus ${tp} und Schadensbonus ${w.SB}.`,
        ergebnisId: `${key}-schaden`,
        onSelect: () => schadenWurf({
          id: `${key}-schaden`, name: `${slot} ${waffe.name}`,
          wuerfel: waffe.wuerfel || 0, seiten: waffe.wuerfelSeiten || 6,
          bonus: schadenBonus, bonusText: `Waffenbonus ${tp}, Schadensbonus ${w.SB}`,
        }),
      });
    }
  }

  return menuScreen({
    title: 'Kampfwerte',
    subtitle: 'Werte lesen und je Waffe würfeln. Enter startet eine Probe. Oben filtern, Shift und Pfeil-runter liest Details. Escape zurück.',
    items,
    filter: true,
  });
}

/**
 * Bestimmt die Waffe je Slot (Haupthand, Nebenhand, Fernkampf). Es gibt kein
 * "aktives Set", daher wird das erste echte Waffenset genommen; fehlt eines,
 * werden die Waffen des Charakters nach Nah- und Fernkampf einsortiert.
 */
function bestimmeSlotWaffen(char, db, inv) {
  const findW = (n) => (n ? (char.waffen || []).find(x => x.name === n) || null : null);
  const echte = (inv.waffenSets || []).filter(s => s.name !== SET_WAFFENLOS);
  if (echte.length) {
    const set = echte[0];
    return { Haupthand: findW(set.haupthand), Nebenhand: findW(set.nebenhand), Fernkampf: findW(set.fernkampf) };
  }
  const res = { Haupthand: null, Nebenhand: null, Fernkampf: null };
  for (const wa of (char.waffen || []).filter(x => x.name)) {
    if (istFernkampf(db, wa)) { if (!res.Fernkampf) res.Fernkampf = wa; }
    else if (!res.Haupthand) res.Haupthand = wa;
    else if (!res.Nebenhand) res.Nebenhand = wa;
  }
  return res;
}

async function freierWurf() {
  const anzahl = await zahlDialog({ titel: 'Freier Wurf', label: 'Anzahl der Würfel', wert: 1, min: 1, max: 50 });
  if (anzahl === null) return;
  // Würfeltyp als schlichte Knopf-Auswahl (kein Filter), damit der
  // Live-Bildschirm samt "Freier Wurf"-Schalter stehen bleibt.
  const seiten = await knopfDialog({ titel: 'Würfeltyp wählen', knoepfe: [{ label: 'W6', wert: 6 }, { label: 'W20', wert: 20 }] });
  if (seiten === null) return;
  const mod = await zahlDialog({ titel: 'Modifikator', label: 'Modifikator, 0 wenn keiner', wert: 0, min: -100, max: 100 });
  if (mod === null) return;
  // Fokus liegt nach dem Dialog schon wieder auf "Freier Wurf"; die Ansage kommt
  // zuverlässig per aria-live (wuerfeln, nicht stumm), das Ergebnis bleibt am Schalter.
  wuerfeln(anzahl, seiten, mod, 'frei');
  const btn = document.querySelector('[data-ergebnis-ziel="frei"]');
  if (btn) btn.focus();
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

      // Einschränkungen = Wunden plus Erschöpfung, mit Wundabzug. Diese Zeile
      // steht über den Zählern; hinter den einzelnen Zählern steht keine Folge,
      // weil sie hier zusammengefasst ist. Aktualisiert sich beim Verstellen.
      const hatWundErsch = a.ressourcen.Wunden || a.ressourcen.Erschoepfung;
      const einschrText = () => {
        const wu = a.ressourcen.Wunden ? (a.ressourcen.Wunden.aktuell || 0) : 0;
        const er = a.ressourcen.Erschoepfung ? (a.ressourcen.Erschoepfung.aktuell || 0) : 0;
        const summe = wu + er;
        const ab = wundabzug(summe);
        let s = `Einschränkungen: ${summe}`;
        if (ab > 0) s += `, alle Proben minus ${ab}`;
        if (summe >= 5) s += ', Kampfunfähigkeit droht';
        return s;
      };
      let einschrZeile = null;
      const aktualisiereEinschr = () => {
        if (!einschrZeile) return '';
        const t = einschrText();
        einschrZeile.textContent = t;
        einschrZeile.setAttribute('data-sr-label', t);
        einschrZeile.dataset.srValue = t;
        einschrZeile.setAttribute('aria-label', t);
        einschrZeile.dispatchEvent(new CustomEvent('detail-refresh', { bubbles: true }));
        return t;
      };
      if (hatWundErsch) {
        einschrZeile = infoZeile(einschrText(), EINSCHR_REGEL);
        wrap.appendChild(einschrZeile);
      }

      // Ressourcen, verstellbar
      for (const key of Object.keys(a.ressourcen)) {
        const r = a.ressourcen[key];
        const name = RES_NAME[key] || key;
        const istEinschr = (key === 'Wunden' || key === 'Erschoepfung');
        wrap.appendChild(wertZeile({
          label: name,
          get: () => r.aktuell,
          set: (v) => { r.aktuell = v; },
          min: 0,
          max: (r.max !== undefined) ? r.max : 999,
          suffix: () => (r.max !== undefined ? `von ${r.max}` : ''),
          onChange: () => {
            protokolliere(a, `${name} auf ${r.aktuell}.`);
            speichere();
            // Bei Wunden/Erschöpfung die Einschränkungen-Zeile aktualisieren und
            // die Folge gleich mit ansagen; sonst nur der Maximal-Hinweis.
            if (istEinschr) return aktualisiereEinschr();
            return (r.max !== undefined ? `von ${r.max}` : '');
          },
        }));
      }

      // Kampfwerte, nur lesbar
      wrap.appendChild(abschnittTitel('Werte zum Lesen'));
      for (const k of ['KO', 'MU', 'GE', 'KK', 'IN', 'KL', 'CH', 'FF']) {
        wrap.appendChild(infoZeile(`${ATTR_NAME[k]} ${k}: ${char.attribute[k] || 0}`));
      }
      wrap.appendChild(infoZeile(`Wundschwelle: ${w.WS}`, 'Modifizierte Wundschwelle, sie enthält den Rüstungsschutz der getragenen Rüstung. Schaden, der über diesem Wert liegt, verursacht eine Wunde; über dem Doppelten zwei, über dem Dreifachen drei, und so weiter. Grundwert ohne Rüstung: 4 plus Konstitution durch 4.'));
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

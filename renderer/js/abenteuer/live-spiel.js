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
import { wuerfeln, kampfProbe, schadenWurf, mitLetztemWurf } from './wuerfel-kern.js';
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
    { label: 'Schnellwurf 1 W6', ergebnisId: 'w6', detail: mitLetztemWurf('w6', 'Ein W6, schneller Wurf.'), onSelect: () => wuerfeln(1, 6, 0, 'w6') },
    { label: 'Schnellwurf 2 W6', ergebnisId: 'w6x2', detail: mitLetztemWurf('w6x2', 'Zwei W6, schneller Wurf.'), onSelect: () => wuerfeln(2, 6, 0, 'w6x2') },
    { label: 'Schnellwurf 1 W20', ergebnisId: 'w20', detail: mitLetztemWurf('w20', 'Ein W20, schneller Wurf.'), onSelect: () => wuerfeln(1, 20, 0, 'w20') },
    { label: 'Schnellwurf 3 W20', ergebnisId: 'w20x3', detail: mitLetztemWurf('w20x3', 'Drei W20, schneller Wurf.'), onSelect: () => wuerfeln(3, 20, 0, 'w20x3') },
    { label: 'Freier Wurf', hint: 'Anzahl, Würfeltyp und Modifikator wählen', ergebnisId: 'frei', detail: mitLetztemWurf('frei', 'Anzahl, Würfeltyp und Modifikator frei wählen.'), onSelect: freierWurf },
    { label: 'Aktionen', hint: 'Was du in deiner Initiativephase tun kannst', detail: GRUNDREGEL_AKTIONEN, onSelect: () => screen.push(aktionenScreen()) },
    {
      label: 'Kämpfen',
      hint: 'Je Waffenset Probe und Schaden würfeln, dazu die abgeleiteten Werte',
      detail: 'Ganz oben je Waffenset eine Probe und ein Schadenswurf, darunter die abgeleiteten '
        + 'Werte und die Probenwerte der Kampffertigkeiten.',
      onSelect: () => screen.push(kampfwerteScreen()),
    },
    { label: 'Manöver', hint: 'Nahkampf-Manöver mit ihrer Wirkung', onSelect: () => screen.push(manoeverScreen()) },
  ];
  if (zauberVorhanden(char, db)) {
    items.push({ label: zauberKategorieLabel(char, db), hint: 'Deine bekannten Zauber würfeln', onSelect: () => screen.push(zauberScreen()) });
  }
  return menuScreen({
    title: 'Meine Initiative-Phase',
    subtitle: 'Würfeln, Aktionen, Kämpfen, Manöver und Zauber. Escape zurück.',
    items,
  });
}

/**
 * Kämpfen: was am Spieltisch gewürfelt wird. GANZ OBEN die würfelbaren
 * Waffensets — je Set eine Probe (Attacke oder Verteidigung) und ein
 * Schadenswurf. Darunter die abgeleiteten Werte und die Kampffertigkeiten.
 */
export function kampfwerteScreen() {
  const a = getAbenteuer();
  const char = a.charakter;
  const db = getDb();
  const w = abgeleiteteWerte(char);
  const items = [];
  const findW = (n) => (n ? (char.waffen || []).find(x => x.name === n) || null : null);

  // --- 1) Waffenset-Angriff ganz oben ---
  items.push({ label: 'Waffenset-Angriff', ueberschrift: true, onSelect: () => {} });
  const inv = leseInventar(char);
  const sets = inv.waffenSets || [];
  sets.forEach((set, si) => {
    const key = `set${si}`;
    // Primärwaffe des Sets: erste belegte Hand (Haupthand, sonst Fernkampf, sonst Nebenhand).
    const primaer = findW(set.haupthand) || findW(set.fernkampf) || findW(set.nebenhand);
    if (primaer && db) {
      const k = waffenwerte(char, db, primaer);
      const detailText = waffenwerteText(char, db, primaer);
      const tp = k.tp || 0;
      const schadenBonus = tp + w.SB;
      const werte = `Attacke ${k.at === null ? 'nicht möglich' : k.at}, Verteidigung ${k.vt === null ? 'nicht möglich' : k.vt}, Schaden ${primaer.wuerfel || 0} W ${primaer.wuerfelSeiten || 6}`;
      // Set-Kopfzeile (nur lesen)
      items.push({ label: `Set ${si + 1}: ${set.name}, ${primaer.name}`, hint: werte, detail: detailText, onSelect: () => {} });
      // Probe würfeln — bietet Attacke oder Verteidigung an.
      items.push({
        label: `Probe würfeln, ${primaer.name}`,
        hint: `Attacke ${k.at === null ? 'nein' : k.at}${k.vt !== null ? `, Verteidigung ${k.vt}` : ''}`,
        detail: mitLetztemWurf(`${key}-probe`, detailText),
        ergebnisId: `${key}-probe`,
        onSelect: async () => {
          const knoepfe = [];
          if (k.at !== null) knoepfe.push({ label: `Attacke ${k.at}`, wert: 'at' });
          if (k.vt !== null) knoepfe.push({ label: `Verteidigung ${k.vt}`, wert: 'vt' });
          if (!knoepfe.length) return;
          let wahl = knoepfe[0].wert;
          if (knoepfe.length > 1) { wahl = await knopfDialog({ titel: `Probe, ${primaer.name}`, knoepfe }); if (wahl === null) return; }
          const vok = wahl === 'vt' ? 'Verteidigung' : 'Attacke';
          const pw = wahl === 'vt' ? k.vt : k.at;
          kampfProbe({ id: `${key}-probe`, titel: `${vok} ${set.name}, ${primaer.name}`, vokabel: vok, probenwert: pw });
        },
      });
      // Schaden würfeln
      items.push({
        label: `Schaden würfeln, ${primaer.name}`,
        hint: `${primaer.wuerfel || 0} W ${primaer.wuerfelSeiten || 6} plus Waffenbonus ${tp} und Schadensbonus ${w.SB}`,
        detail: mitLetztemWurf(`${key}-schaden`, `Schaden ${primaer.wuerfel || 0} W ${primaer.wuerfelSeiten || 6}, dazu Waffenbonus ${tp} und Schadensbonus ${w.SB}.`),
        ergebnisId: `${key}-schaden`,
        onSelect: () => schadenWurf({
          id: `${key}-schaden`, name: `${set.name}, ${primaer.name}`,
          wuerfel: primaer.wuerfel || 0, seiten: primaer.wuerfelSeiten || 6,
          bonus: schadenBonus, bonusText: `Waffenbonus ${tp}, Schadensbonus ${w.SB}`,
        }),
      });
    } else {
      // Waffenlos: Raufen, falls die Fertigkeit vorhanden ist.
      const raufen = db && db.fertigkeitByName ? (db.fertigkeitByName['Raufen'] || null) : null;
      const fw = raufen ? (char.fertigkeiten?.['Raufen']?.wert || 0) : 0;
      const at = raufen ? fertigkeitProbenwert(char, raufen, fw, true) : 0;
      items.push({ label: `Set ${si + 1}: ${set.name}, waffenlos`, hint: raufen ? `Raufen ${at}, Schaden 1 W 6` : 'keine Werte', detail: 'Kampf ohne Waffe (Raufen). Schaden ein W6 plus Schadensbonus.', onSelect: () => {} });
      if (raufen) {
        items.push({
          label: 'Probe würfeln, Raufen',
          hint: `Raufen ${at}`,
          detail: mitLetztemWurf(`${key}-probe`, 'Raufen, Kampf ohne Waffe.'),
          ergebnisId: `${key}-probe`,
          onSelect: () => kampfProbe({ id: `${key}-probe`, titel: `Raufen ${set.name}`, vokabel: 'Raufen', probenwert: at }),
        });
        items.push({
          label: 'Schaden würfeln, Raufen',
          hint: `1 W 6 plus Schadensbonus ${w.SB}`,
          detail: mitLetztemWurf(`${key}-schaden`, `Waffenloser Schaden ein W6 plus Schadensbonus ${w.SB}.`),
          ergebnisId: `${key}-schaden`,
          onSelect: () => schadenWurf({ id: `${key}-schaden`, name: `${set.name}, Raufen`, wuerfel: 1, seiten: 6, bonus: w.SB, bonusText: `Schadensbonus ${w.SB}` }),
        });
      }
    }
  });

  // --- 2) Abgeleitete Werte ---
  const eintrag = (label, detail) => items.push({ label, detail: detail || '', onSelect: () => {} });
  items.push({ label: 'Abgeleitete Werte', ueberschrift: true, onSelect: () => {} });
  eintrag(`Initiative: ${w.INI}`, 'Bestimmt die Reihenfolge im Kampf: wer den höheren Wert hat, handelt zuerst. Zu Kampfbeginn wird 1 W20 plus Initiative gewürfelt. Wert: gleich dem Attribut Intuition.');
  eintrag(`Wundschwelle: ${w.WS}`, 'Modifizierte Wundschwelle, sie enthält den Rüstungsschutz der getragenen Rüstung. Schaden, der über diesem Wert liegt, verursacht eine Wunde; über dem Doppelten zwei, über dem Dreifachen drei, und so weiter. Grundwert ohne Rüstung: 4 plus Konstitution durch 4.');
  eintrag(`Magieresistenz: ${w.MR}`, 'Schwierigkeit, dich mit schädlicher Magie zu treffen. Bei Zaubern gegen die Magieresistenz wird der Wurf des Zaubernden dagegen verglichen. Wert: 4 plus Mut durch 4.');
  eintrag(`Geschwindigkeit: ${w.GS}`, `So viele Schritt kannst du dich mit einer einfachen Aktion Bewegung fortbewegen, hier also ${w.GS} Schritt. Geradeaus vorwärts das Doppelte, ganz ohne Gepäck und Rüstung das Vierfache; auf unsicherem Boden die Hälfte, kniend ein Viertel. Wert: 4 plus Gewandtheit durch 4, minus Behinderung.`);
  eintrag(`Durchhaltevermögen: ${w.DH}`, 'Deine Reserve gegen Erschöpfung durch Anstrengung, Hitze oder Kälte. Wert: Konstitution minus zweimal Behinderung.');
  eintrag(`Schadensbonus: ${w.SB}`, 'Kommt zu jedem Waffenschaden hinzu. Wert: Körperkraft durch 4.');
  eintrag(`Rüstungsschutz: ${w.RS}, Behinderung: ${w.BE}`, 'Rüstungsschutz senkt eingehenden Schaden und hebt die Wundschwelle. Behinderung verringert Geschwindigkeit und Durchhaltevermögen. Beides stammt aus der ersten angelegten Rüstung.');

  // --- 3) Kampffertigkeiten ---
  if (db) {
    items.push({ label: 'Kampffertigkeiten', ueberschrift: true, onSelect: () => {} });
    for (const f of db.fertigkeiten.filter(x => x.kampffertigkeit === 1)) {
      const fw = char.fertigkeiten?.[f.name]?.wert || 0;
      if (!fw) continue;
      eintrag(`${f.name}: Probenwert ${fertigkeitProbenwert(char, f, fw, true)} mit Talent, `
        + `${fertigkeitProbenwert(char, f, fw, false)} ohne`,
        `Fertigkeitswert ${fw}. Mit passendem Talent zählt der volle Wert, ohne der halbe.`);
    }
  }

  return menuScreen({
    title: 'Kämpfen',
    subtitle: 'Oben je Waffenset Probe und Schaden würfeln, darunter die Werte. Enter startet eine Probe. Oben filtern, Shift und Pfeil-runter liest Details. Escape zurück.',
    items,
    filter: true,
  });
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
      // Das zuletzt angesagte Einschränkungs-Ergebnis. Es steht oben im Tooltip
      // von Einschränkungen, Wunden UND Erschöpfung, damit man es dort nachliest.
      const letztes = { text: hatWundErsch ? einschrText() : '' };
      const mitErgebnis = (basis) => () => (letztes.text ? [letztes.text, '', basis] : basis);
      let einschrZeile = null;
      const aktualisiereEinschr = () => {
        if (!einschrZeile) return '';
        const t = einschrText();
        letztes.text = t; // vor dem Refresh setzen, damit die Tooltips den neuen Wert zeigen
        einschrZeile.textContent = t;
        einschrZeile.setAttribute('data-sr-label', t);
        einschrZeile.dataset.srValue = t;
        einschrZeile.setAttribute('aria-label', t);
        einschrZeile.__detail = mitErgebnis(EINSCHR_REGEL);
        delete einschrZeile.__detailText;
        einschrZeile.dispatchEvent(new CustomEvent('detail-refresh', { bubbles: true }));
        return t;
      };
      if (hatWundErsch) {
        einschrZeile = infoZeile(einschrText(), mitErgebnis(EINSCHR_REGEL));
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
          // Bei Wunden/Erschöpfung steht das Einschränkungs-Ergebnis oben im Tooltip.
          detail: istEinschr ? mitErgebnis(`${name} verstellen. ${EINSCHR_REGEL}`) : undefined,
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
            db ? waffenwerteText(char, db, wa) : `Härte ${wa.haerte || 0}.`));
        }
      }
      verbindeDetail(wrap);
      return wrap;
    },
  };
}

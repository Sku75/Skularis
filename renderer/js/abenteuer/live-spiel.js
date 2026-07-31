/**
 * Skularistool — Abenteuer-Bereich: Live-Spiel.
 * Würfelbecher (Schnellwürfe + freier Wurf, Ergebnis ansagen und nachlesbar)
 * und Charakterstatus (Ressourcenzähler verstellbar, Kampfwerte und Waffe lesbar).
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { wertZeile, infoZeile, abschnittTitel, verbindeDetail } from '../editor/widgets.js';
import { zahlDialog, knopfDialog } from '../ui/dialog.js';
import { abgeleiteteWerte, waffenwerte, waffenwerteText, fertigkeitProbenwert, wundabzug } from '../core/regeln.js';
import { getDb } from '../core/db-laden.js';
import { leseInventar, istFernkampf, SLOTS, SET_WAFFENLOS, ergaenzeSets } from '../core/ausruestung.js';
import { protokolliere } from '../core/abenteuer.js';
import { getAbenteuer, speichere } from './state.js';
import { wuerfeln, kampfProbe, schadenWurf, mitLetztemWurf, letztesKurz } from './wuerfel-kern.js';
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

// Gewähltes Waffenset auf der Kämpfen-Seite (bleibt die Sitzung über).
let _kampfSet = 0;

/**
 * Kämpfen: oben ein Waffenset-Wähler (Pfeil links/rechts wechselt das Set und
 * sagt es an), darunter "Attacke oder Parade würfeln" und "Schaden würfeln" für
 * das gewählte Set. Die Ergebnisse wechseln mit dem Set (letztes Ergebnis je Set).
 * Darunter die abgeleiteten Werte.
 */
export function kampfwerteScreen() {
  return {
    title: 'Kämpfen',
    build() {
      const a = getAbenteuer();
      const char = a.charakter;
      const db = getDb();
      const w = abgeleiteteWerte(char);
      const findW = (n) => (n ? (char.waffen || []).find(x => x.name === n) || null : null);
      // Sicherstellen, dass das Waffenlos-Set mit der "Hand" vorne steht (adaptiert
      // auch alte Charaktere) — dann würfelt Waffenlos wie jedes Set.
      ergaenzeSets(char, db);
      const inv = leseInventar(char);
      const sets = inv.waffenSets || [];
      if (sets.length) _kampfSet = Math.max(0, Math.min(sets.length - 1, _kampfSet));

      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      wrap.appendChild(abschnittTitel('Kampfwürfe'));

      // Werte eines Sets zusammenstellen (mit Waffe oder waffenlos/Raufen).
      const setInfo = (i) => {
        const set = sets[i];
        const key = `set${i}`;
        const primaer = findW(set.haupthand) || findW(set.fernkampf) || findW(set.nebenhand);
        if (primaer && db) {
          const k = waffenwerte(char, db, primaer);
          const tp = k.tp || 0;
          return {
            set, key, primaer, waffenlos: false, k, tp, schadenBonus: tp + w.SB,
            kurz: `${set.name}, ${primaer.name}`,
            werte: `Attacke ${k.at === null ? 'nicht möglich' : k.at}, Parade ${k.vt === null ? 'nicht möglich' : k.vt}, Schaden ${primaer.wuerfel || 0} W ${primaer.wuerfelSeiten || 6}`,
            tooltip: waffenwerteText(char, db, primaer),
          };
        }
        const raufen = db && db.fertigkeitByName ? (db.fertigkeitByName['Raufen'] || null) : null;
        const rw = raufen ? (char.fertigkeiten?.['Raufen']?.wert || 0) : 0;
        const at = raufen ? fertigkeitProbenwert(char, raufen, rw, true) : 0;
        return {
          set, key, primaer: null, waffenlos: true, raufen, at,
          kurz: `${set.name}, waffenlos`,
          werte: raufen ? `Raufen ${at}, Schaden 1 W 6` : 'keine Werte',
          tooltip: 'Kampf ohne Waffe (Raufen). Schaden ein W6 plus Schadensbonus.',
        };
      };

      // Einen der beiden Würfel-Schalter (Attacke/Parade oder Schaden) neu befüllen.
      const befuelle = (btn, o) => {
        btn.innerHTML = '';
        btn.setAttribute('aria-label', o.label);
        btn.dataset.ergebnisZiel = o.id;
        btn.__detail = o.detail;
        delete btn.__detailText;
        delete btn.__detailCache;
        const lab = document.createElement('span');
        lab.className = 'db-menu__label';
        lab.textContent = o.label;
        btn.appendChild(lab);
        if (o.hint) {
          const h = document.createElement('span');
          h.className = 'db-menu__hint';
          h.setAttribute('aria-hidden', 'true');
          h.textContent = o.hint;
          btn.appendChild(h);
        }
        const erg = document.createElement('span');
        erg.className = 'db-menu__ergebnis';
        erg.dataset.ergebnis = o.id;
        erg.setAttribute('aria-hidden', 'true');
        erg.textContent = letztesKurz(o.id); // letztes Ergebnis dieses Sets sofort zeigen
        btn.appendChild(erg);
        btn._onSelect = o.onSelect;
      };

      if (!sets.length) {
        wrap.appendChild(infoZeile('Keine Waffensets vorhanden.',
          'Waffensets stellst du im Editor unter Ausrüstung zusammen. Ohne Set kannst du hier nicht würfeln.'));
      } else {
        const macheBtn = () => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'db-btn ed-aktion';
          b.addEventListener('click', () => { if (b._onSelect) b._onSelect(); });
          return b;
        };
        const probeBtn = macheBtn();
        const schadenBtn = macheBtn();

        const zeigeSet = () => {
          const info = setInfo(_kampfSet);
          befuelle(probeBtn, {
            id: `${info.key}-probe`,
            label: 'Attacke oder Parade würfeln',
            hint: info.waffenlos ? `${info.kurz}` : `${info.kurz}. Attacke ${info.k.at === null ? 'nicht möglich' : info.k.at}${info.k.vt !== null ? `, Parade ${info.k.vt}` : ''}`,
            detail: mitLetztemWurf(`${info.key}-probe`, info.tooltip),
            onSelect: async () => {
              if (info.waffenlos) {
                if (!info.raufen) return;
                kampfProbe({ id: `${info.key}-probe`, titel: `Raufen ${info.set.name}`, vokabel: 'Raufen', probenwert: info.at });
                return;
              }
              const k = info.k;
              const knoepfe = [];
              if (k.at !== null) knoepfe.push({ label: `Attacke ${k.at}`, wert: 'at' });
              if (k.vt !== null) knoepfe.push({ label: `Parade ${k.vt}`, wert: 'vt' });
              if (!knoepfe.length) return;
              let wahl = knoepfe[0].wert;
              if (knoepfe.length > 1) { wahl = await knopfDialog({ titel: `${info.primaer.name}: Attacke oder Parade`, knoepfe }); if (wahl === null) return; }
              const vok = wahl === 'vt' ? 'Verteidigung' : 'Attacke';
              const pw = wahl === 'vt' ? k.vt : k.at;
              kampfProbe({ id: `${info.key}-probe`, titel: `${vok} ${info.set.name}, ${info.primaer.name}`, vokabel: vok, probenwert: pw });
            },
          });
          befuelle(schadenBtn, {
            id: `${info.key}-schaden`,
            label: 'Schaden würfeln',
            hint: info.waffenlos ? `${info.kurz}. 1 W 6 plus Schadensbonus ${w.SB}` : `${info.kurz}. ${info.primaer.wuerfel || 0} W ${info.primaer.wuerfelSeiten || 6} plus Waffenbonus ${info.tp} und Schadensbonus ${w.SB}`,
            detail: mitLetztemWurf(`${info.key}-schaden`, info.waffenlos ? `Waffenloser Schaden ein W6 plus Schadensbonus ${w.SB}.` : `Schaden ${info.primaer.wuerfel || 0} W ${info.primaer.wuerfelSeiten || 6}, dazu Waffenbonus ${info.tp} und Schadensbonus ${w.SB}.`),
            onSelect: () => {
              if (info.waffenlos) { schadenWurf({ id: `${info.key}-schaden`, name: `${info.set.name}, Raufen`, wuerfel: 1, seiten: 6, bonus: w.SB, bonusText: `Schadensbonus ${w.SB}` }); return; }
              schadenWurf({ id: `${info.key}-schaden`, name: `${info.set.name}, ${info.primaer.name}`, wuerfel: info.primaer.wuerfel || 0, seiten: info.primaer.wuerfelSeiten || 6, bonus: info.schadenBonus, bonusText: `Waffenbonus ${info.tp}, Schadensbonus ${w.SB}` });
            },
          });
        };

        // Set-Wähler: Pfeil links/rechts wechselt das Set; beim Wechsel die
        // Schalter neu befüllen (die Ergebnisse wechseln so mit zum Set).
        wrap.appendChild(wertZeile({
          label: 'Waffenset',
          get: () => _kampfSet + 1,
          set: (v) => { _kampfSet = Math.max(0, Math.min(sets.length - 1, v - 1)); },
          min: 1,
          max: sets.length,
          suffix: () => setInfo(_kampfSet).kurz,
          onChange: () => { zeigeSet(); const info = setInfo(_kampfSet); return `${info.kurz}. ${info.werte}`; },
          detail: () => setInfo(_kampfSet).tooltip,
        }));
        wrap.appendChild(probeBtn);
        wrap.appendChild(schadenBtn);
        zeigeSet();
      }

      // --- Abgeleitete Werte ---
      wrap.appendChild(abschnittTitel('Abgeleitete Werte'));
      const info2 = (label, detail) => wrap.appendChild(infoZeile(label, detail));
      info2(`Initiative: ${w.INI}`, 'Bestimmt die Reihenfolge im Kampf: wer den höheren Wert hat, handelt zuerst. Zu Kampfbeginn wird 1 W20 plus Initiative gewürfelt. Wert: gleich dem Attribut Intuition.');
      info2(`Wundschwelle: ${w.WS}`, 'Modifizierte Wundschwelle, sie enthält den Rüstungsschutz der getragenen Rüstung. Schaden, der über diesem Wert liegt, verursacht eine Wunde; über dem Doppelten zwei, über dem Dreifachen drei, und so weiter. Grundwert ohne Rüstung: 4 plus Konstitution durch 4.');
      info2(`Magieresistenz: ${w.MR}`, 'Schwierigkeit, dich mit schädlicher Magie zu treffen. Bei Zaubern gegen die Magieresistenz wird der Wurf des Zaubernden dagegen verglichen. Wert: 4 plus Mut durch 4.');
      info2(`Geschwindigkeit: ${w.GS}`, `So viele Schritt kannst du dich mit einer einfachen Aktion Bewegung fortbewegen, hier also ${w.GS} Schritt. Geradeaus vorwärts das Doppelte, ganz ohne Gepäck und Rüstung das Vierfache; auf unsicherem Boden die Hälfte, kniend ein Viertel. Wert: 4 plus Gewandtheit durch 4, minus Behinderung.`);
      info2(`Durchhaltevermögen: ${w.DH}`, 'Deine Reserve gegen Erschöpfung durch Anstrengung, Hitze oder Kälte. Wert: Konstitution minus zweimal Behinderung.');
      info2(`Schadensbonus: ${w.SB}`, 'Kommt zu jedem Waffenschaden hinzu. Wert: Körperkraft durch 4.');
      info2(`Rüstungsschutz: ${w.RS}, Behinderung: ${w.BE}`, 'Rüstungsschutz senkt eingehenden Schaden und hebt die Wundschwelle. Behinderung verringert Geschwindigkeit und Durchhaltevermögen. Beides stammt aus der ersten angelegten Rüstung.');

      verbindeDetail(wrap);
      return wrap;
    },
    onShow() {
      sprache.sage('Kämpfen. Oben mit Pfeil links und rechts das Waffenset wählen, darunter Attacke oder Parade und Schaden würfeln.');
    },
  };
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

      // Kampfwerte, nur lesbar. Die acht Attribute werden hier bewusst NICHT
      // mehr aufgezählt (Wunsch): sie stehen im Charakterbogen.
      wrap.appendChild(abschnittTitel('Werte zum Lesen'));
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

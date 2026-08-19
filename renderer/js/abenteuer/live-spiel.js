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
import { abgeleiteteWerte, waffenwerte, waffenwerteText, fertigkeitProbenwert, wundabzug, ruestungsSetTeile } from '../core/regeln.js';
import { getDb } from '../core/db-laden.js';
import { leseInventar, istFernkampf, SLOTS, SET_WAFFENLOS, ergaenzeSets } from '../core/ausruestung.js';
import { protokolliere } from '../core/abenteuer.js';
import { getAbenteuer, speichere } from './state.js';
import { wuerfeln, kampfProbe, schadenWurf, mitLetztemWurf, letztesKurz, letzterAnhang } from './wuerfel-kern.js';
import { aktionenScreen, manoeverScreen, zauberScreen, zauberVorhanden, zauberKategorieLabel, GRUNDREGEL_AKTIONEN, attributsprobenScreen, profanScreen } from './kampf-menues.js';
import { zauberspeicherVorhanden, zauberspeicherScreen } from './zauberspeicher.js';
import { sendeStatusWennVerbunden } from './status-sync.js';

const RES_NAME = {
  Wunden: 'Wunden', Erschoepfung: 'Erschöpfung', SchiP: 'Schicksalspunkte',
  AsP: 'Astralpunkte', KaP: 'Karmapunkte', GuP: 'Gunstpunkte',
  AstralspeicherStab: 'Astralspeicher Stab',
};
const ATTR_NAME = {
  KO: 'Konstitution', MU: 'Mut', GE: 'Gewandtheit', KK: 'Körperkraft',
  IN: 'Intuition', KL: 'Klugheit', CH: 'Charisma', FF: 'Fingerfertigkeit',
};
// Ilaris wörtlich: "Die Summe aus Wunden und Erschöpfung nennen wir
// Einschränkungen" — jede Wunde UND jeder Punkt Erschöpfung zählt einzeln.
// Ab vier Einschränkungen droht nach jeder weiteren die Kampfunfähigkeit
// (Zähigkeits-Probe), die neunte bedeutet den Tod.
const EINSCHR_REGEL = 'Jede Wunde und jeder Punkt Erschöpfung zählt als eine Einschränkung (Ilaris: die Summe aus Wunden und Erschöpfung). '
  + 'Ab der dritten Einschränkung sind alle Proben um zwei erschwert, je weitere um zwei mehr: '
  + 'drei gleich minus zwei, vier gleich minus vier, fünf gleich minus sechs. '
  + 'Ab vier Einschränkungen droht nach jeder weiteren die Kampfunfähigkeit, die neunte Einschränkung bedeutet den Tod.';

/** Schnellwürfe: die schnellen Würfe ohne Werte, gebündelt in einem Untermenü. */
function schnellwuerfeScreen() {
  return menuScreen({
    title: 'Schnellwürfe',
    subtitle: 'Schnelle Würfe ohne Werte. Escape zurück.',
    items: [
      { label: 'Schnellwurf 1 W6', ergebnisId: 'w6', detail: mitLetztemWurf('w6', 'Ein W6, schneller Wurf.'), onSelect: () => wuerfeln(1, 6, 0, 'w6') },
      { label: 'Schnellwurf 2 W6', ergebnisId: 'w6x2', detail: mitLetztemWurf('w6x2', 'Zwei W6, schneller Wurf.'), onSelect: () => wuerfeln(2, 6, 0, 'w6x2') },
      { label: 'Schnellwurf 1 W20', ergebnisId: 'w20', detail: mitLetztemWurf('w20', 'Ein W20, schneller Wurf.'), onSelect: () => wuerfeln(1, 20, 0, 'w20') },
      { label: 'Schnellwurf 3 W20', ergebnisId: 'w20x3', detail: mitLetztemWurf('w20x3', 'Drei W20, schneller Wurf.'), onSelect: () => wuerfeln(3, 20, 0, 'w20x3') },
      { label: 'Freier Wurf', hint: 'Anzahl, Würfeltyp und Modifikator wählen', ergebnisId: 'frei', detail: mitLetztemWurf('frei', 'Anzahl, Würfeltyp und Modifikator frei wählen.'), onSelect: freierWurf },
    ],
  });
}

export function liveSpielScreen() {
  const a = getAbenteuer();
  const char = a.charakter;
  const db = getDb();
  const items = [
    { label: 'Schnellwürfe', hint: '1 W6, 2 W6, 1 W20, 3 W20, freier Wurf', onSelect: () => screen.push(schnellwuerfeScreen()) },
    { label: 'Aktionen', hint: 'Was du in deiner Initiativephase tun kannst', detail: GRUNDREGEL_AKTIONEN, onSelect: () => screen.push(aktionenScreen()) },
    {
      label: 'Kämpfen',
      hint: 'Je Waffenset Probe und Schaden würfeln, dazu die abgeleiteten Werte',
      detail: 'Ganz oben je Waffenset eine Probe und ein Schadenswurf, darunter die abgeleiteten '
        + 'Werte und die Probenwerte der Kampffertigkeiten.',
      onSelect: () => screen.push(kampfwerteScreen()),
    },
    { label: 'Manöver', hint: 'Nahkampf-Manöver mit ihrer Wirkung', onSelect: () => screen.push(manoeverScreen()) },
    { label: 'Attributsproben', hint: 'je Attribut eine Probe (Attribut mal zwei)', onSelect: () => screen.push(attributsprobenScreen()) },
    { label: 'Profane Fertigkeiten und Talente', hint: 'auf jede Fertigkeit und jedes Talent würfeln, auch nicht gelernte', onSelect: () => screen.push(profanScreen()) },
  ];
  if (zauberVorhanden(char, db)) {
    items.push({ label: zauberKategorieLabel(char, db), hint: 'Deine bekannten Zauber und Rituale würfeln', onSelect: () => screen.push(zauberScreen()) });
  }
  // Zauberspeicher des Magierstabs (Vorteile "Magierstab Zauberspeicher 1/2") —
  // ganz unten, nach Manöver und Zauber. Zauber laden und spaeter wirken.
  if (zauberspeicherVorhanden(char)) {
    items.push({ label: 'Zauberspeicher', hint: 'Zauber in den Magierstab laden und spaeter wirken', onSelect: () => screen.push(zauberspeicherScreen()) });
  }
  return menuScreen({
    title: 'Meine Initiative-Phase',
    subtitle: 'Schnellwürfe, Aktionen, Kämpfen, Manöver, Attributs- und Fertigkeitsproben, Übernatürliches. Escape zurück.',
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

      // Auto-Namen "Set 1/2/3" nicht mitsprechen — die Nummer sagt der Waehler
      // (Position) schon an, sonst doppelt. Eigene Namen (z. B. Waffenlos) bleiben.
      const setLabel = (set) => (set.name && !/^Set \d+$/.test(set.name)) ? `${set.name}, ` : '';

      // Alle vorhandenen Waffen eines Sets (Haupthand, Nebenhand, Fernkampf).
      const setWaffen = (set) => {
        const liste = [];
        for (const [slot, name] of [['Haupthand', set.haupthand], ['Nebenhand', set.nebenhand], ['Fernkampf', set.fernkampf]]) {
          const wa = findW(name);
          if (wa) liste.push({ slot, waffe: wa });
        }
        return liste;
      };

      // Werte eines Sets zusammenstellen. voll = alle Waffen des Sets (auch Nebenhand),
      // primaer = die erste Waffe (Standard für Anzeige/kurzes Ergebnis).
      const setInfo = (i) => {
        const set = sets[i];
        const key = `set${i}`;
        const waffen = setWaffen(set);
        if (waffen.length && db) {
          const voll = waffen.map(x => `${x.slot} ${x.waffe.name}`).join(', ');
          const primaer = waffen[0].waffe;
          const k = waffenwerte(char, db, primaer);
          const tp = k.tp || 0;
          return {
            set, key, waffen, primaer, waffenlos: false, k, tp, schadenBonus: tp + w.SB,
            kurz: `${setLabel(set)}${voll}`, voll,
            werte: `Attacke ${k.at === null ? 'nicht möglich' : k.at}, Parade ${k.vt === null ? 'nicht möglich' : k.vt}, Schaden ${primaer.wuerfel || 0} W ${primaer.wuerfelSeiten || 6}`,
            tooltip: waffenwerteText(char, db, primaer),
          };
        }
        const raufen = db && db.fertigkeitByName ? (db.fertigkeitByName['Raufen'] || null) : null;
        const rw = raufen ? (char.fertigkeiten?.['Raufen']?.wert || 0) : 0;
        const at = raufen ? fertigkeitProbenwert(char, raufen, rw, true) : 0;
        return {
          set, key, waffen: [], primaer: null, waffenlos: true, raufen, at,
          kurz: `${setLabel(set)}waffenlos`, voll: 'waffenlos',
          werte: raufen ? `Raufen ${at}, Schaden 1 W 6` : 'keine Werte',
          tooltip: 'Kampf ohne Waffe (Raufen). Schaden ein W6 plus Schadensbonus.',
        };
      };

      // Bei mehreren Waffen im Set vor dem Wurf fragen, welche Waffe (sonst die
      // eine direkt). Der Fokus steht auf der obersten Waffe; der Dialogname
      // nennt einmal kurz das Waffenset.
      const waehleWaffe = async (info) => {
        if (!info.waffen || info.waffen.length <= 1) return info.primaer;
        const wl = await knopfDialog({ titel: `Waffe wählen, Waffenset ${info.set.name}`, knoepfe: info.waffen.map(x => ({ label: `${x.slot}: ${x.waffe.name}`, wert: x.waffe.name })) });
        if (wl === null) return null;
        const t = info.waffen.find(x => x.waffe.name === wl);
        return t ? t.waffe : info.primaer;
      };

      // Einen der beiden Würfel-Schalter (Attacke/Parade oder Schaden) neu befüllen.
      const befuelle = (btn, o) => {
        btn.innerHTML = '';
        // Beschriftung zuerst, dahinter (falls vorhanden) das letzte Ergebnis
        // dieses Sets — nie umgekehrt. basisLabel mitführen, damit zeigeErgebnis
        // nach dem Würfeln genauso anhängt statt zu ersetzen.
        btn.dataset.basisLabel = o.label;
        const anh = letzterAnhang(o.id);
        btn.setAttribute('aria-label', anh ? `${o.label}. ${anh}` : o.label);
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
              const waffe = await waehleWaffe(info);
              if (!waffe) return;
              const k = waffenwerte(char, db, waffe); // je Waffe eigene Attacke/Parade (Modifikatoren + Vorteile/Kampfstil)
              const knoepfe = [];
              if (k.at !== null) knoepfe.push({ label: 'Attacke würfeln', wert: 'at' });
              if (k.vt !== null) knoepfe.push({ label: 'Parade würfeln', wert: 'vt' });
              if (!knoepfe.length) return;
              let wahl = knoepfe[0].wert;
              if (knoepfe.length > 1) { wahl = await knopfDialog({ titel: 'Angriff oder Parade', knoepfe }); if (wahl === null) return; }
              const vok = wahl === 'vt' ? 'Verteidigung' : 'Attacke';
              const pw = wahl === 'vt' ? k.vt : k.at;
              kampfProbe({ id: `${info.key}-probe`, titel: `${vok} ${info.set.name}, ${waffe.name}`, vokabel: vok, probenwert: pw });
            },
          });
          befuelle(schadenBtn, {
            id: `${info.key}-schaden`,
            label: 'Schaden würfeln',
            hint: info.waffenlos ? `${info.kurz}. 1 W 6 plus Schadensbonus ${w.SB}` : `${info.kurz}. ${info.primaer.wuerfel || 0} W ${info.primaer.wuerfelSeiten || 6} plus Waffenbonus ${info.tp} und Schadensbonus ${w.SB}`,
            detail: mitLetztemWurf(`${info.key}-schaden`, info.waffenlos ? `Waffenloser Schaden ein W6 plus Schadensbonus ${w.SB}.` : `Schaden ${info.primaer.wuerfel || 0} W ${info.primaer.wuerfelSeiten || 6}, dazu Waffenbonus ${info.tp} und Schadensbonus ${w.SB}.`),
            onSelect: async () => {
              if (info.waffenlos) { schadenWurf({ id: `${info.key}-schaden`, name: `${info.set.name}, Raufen`, wuerfel: 1, seiten: 6, bonus: w.SB, bonusText: `Schadensbonus ${w.SB}` }); return; }
              const waffe = await waehleWaffe(info); if (!waffe) return;
              const tp = (waffenwerte(char, db, waffe).tp) || 0; // Waffenbonus der gewählten Waffe (inkl. Kampfstil)
              schadenWurf({ id: `${info.key}-schaden`, name: `${info.set.name}, ${waffe.name}`, wuerfel: waffe.wuerfel || 0, seiten: waffe.wuerfelSeiten || 6, bonus: tp + w.SB, bonusText: `Waffenbonus ${tp}, Schadensbonus ${w.SB}` });
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
      info2(`Rüstungsschutz: ${w.RS}, Behinderung: ${w.BE}`, 'Rüstungsschutz senkt eingehenden Schaden und hebt die Wundschwelle. Behinderung verringert Geschwindigkeit und Durchhaltevermögen. Beides ist die Summe aller angelegten Rüstungsteile (des aktiven Rüstungssets), plus Aufschläge aus Vorteilen. Das Rüstungsset stellst du im Charakterstatus (F2) um.');

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
      // Gibt es Rüstungssets und ist noch keins aktiv, das erste voreinstellen —
      // so passen angezeigtes Set und berechnete Werte von Anfang an zusammen.
      // Bögen ohne Sets bleiben unberührt (weiterhin erste angelegte Rüstung).
      if (char.aktivRuestungsset === undefined) {
        const s0 = (leseInventar(char).ruestungsSets || [])[0];
        if (s0) char.aktivRuestungsset = s0.name;
      }
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
            sendeStatusWennVerbunden(); // F2-Live: den Meister ueber die Aenderung informieren
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

      // Aufschlüsselung für die Tooltips: die Teile des aktiven Rüstungssets mit
      // Einzelwerten; Rüstungsschutz und Behinderung werden über alle Teile summiert.
      const rTeile = ruestungsSetTeile(char);
      const rsSumme = rTeile.reduce((s, t) => s + t.rs, 0);
      const teilListe = rTeile.map(t => `${t.name} Rüstung ${t.rs}, Behinderung ${t.be}`).join('; ');
      const wsBasis = w.WS - w.RS; // Grundwert ohne Rüstung (4 plus Konstitution durch 4, plus evtl. Aufschläge)
      // Erst die Rechenformel, dann die tatsächlich angelegten Werte.
      let wsDetail = 'So wird gerechnet: Wundschwelle gleich 4 plus Konstitution durch 4, plus dem summierten Rüstungsschutz aller angelegten Rüstungsteile. ';
      wsDetail += `Deine Werte: Grundwert ohne Rüstung ${wsBasis}`;
      if (rTeile.length) {
        wsDetail += `, Rüstung summiert ${rsSumme}`;
        if (w.RS !== rsSumme) wsDetail += ` plus Aufschlag ${w.RS - rsSumme}`;
        wsDetail += ` (Teile: ${teilListe})`;
      } else if (w.RS) {
        wsDetail += `, Rüstungsschutz ${w.RS}`;
      }
      wsDetail += `, modifizierte Wundschwelle ${w.WS}. Schaden über der Wundschwelle verursacht eine Wunde, über dem Doppelten zwei, über dem Dreifachen drei, und so weiter.`;

      // Rüstungsset wechseln — GANZ OBEN, VOR den Werten: mit Pfeil links/rechts
      // wie der Waffenset-Wähler unter Kämpfen. Jeder Wechsel berechnet die
      // danach aufgeführten Werte (Wundschwelle, Geschwindigkeit, Durchhalte-
      // vermögen, Rüstungsschutz, Behinderung) neu.
      const OHNE_RUEST = 'Ohne Rüstung';
      const ruestSets = leseInventar(char).ruestungsSets || [];
      if (ruestSets.length) {
        const namen = [...ruestSets.map(s => s.name), OHNE_RUEST];
        const aktName = () => (char.aktivRuestungsset === '__ohne'
          ? OHNE_RUEST
          : (char.aktivRuestungsset && namen.includes(char.aktivRuestungsset) ? char.aktivRuestungsset : namen[0]));
        const zeile = wertZeile({
          label: 'Rüstungsset',
          get: () => namen.indexOf(aktName()) + 1,
          set: (v) => {
            const n = namen[Math.max(0, Math.min(namen.length - 1, v - 1))];
            char.aktivRuestungsset = (n === OHNE_RUEST) ? '__ohne' : n;
          },
          min: 1,
          max: namen.length,
          suffix: () => aktName(),
          detail: 'Wähle das getragene Rüstungsset mit Pfeil links und rechts. Wundschwelle, Geschwindigkeit, Durchhaltevermögen, Rüstungsschutz und Behinderung werden neu berechnet.',
          onChange: () => {
            speichere();
            sendeStatusWennVerbunden(); // Meister bekommt die neuen Werte (F2-Live)
            screen.refresh('[data-ruest-set]'); // Werte darunter neu bauen, Fokus bleibt auf dieser Zeile
            const w2 = abgeleiteteWerte(char);
            return `${aktName()}. Wundschwelle ${w2.WS}, Rüstungsschutz ${w2.RS}, Behinderung ${w2.BE}, Geschwindigkeit ${w2.GS}`;
          },
        });
        zeile.setAttribute('data-ruest-set', '1');
        wrap.appendChild(zeile);
      }

      // Wundschwelle UNTER dem Rüstungsset-Wähler: sie hängt vom getragenen Set ab.
      wrap.appendChild(infoZeile(`Wundschwelle: ${w.WS}`, wsDetail));

      wrap.appendChild(infoZeile(`Magieresistenz: ${w.MR}`, '4 plus Mut durch 4.'));
      wrap.appendChild(infoZeile(`Geschwindigkeit: ${w.GS}`, '4 plus Gewandtheit durch 4, minus Behinderung.'));
      wrap.appendChild(infoZeile(`Initiative: ${w.INI}`, 'Gleich dem Attribut Intuition.'));
      wrap.appendChild(infoZeile(`Schadensbonus: ${w.SB}`, 'Körperkraft durch 4.'));
      wrap.appendChild(infoZeile(`Durchhaltevermögen: ${w.DH}`, 'Konstitution minus zweimal Behinderung.'));
      let rsBeDetail;
      if (rTeile.length) {
        rsBeDetail = `Aus dem aktiven Rüstungsset (oben umschaltbar), Rüstungsschutz und Behinderung über alle Teile summiert. Teile: ${teilListe}.`;
      } else if (ruestSets.length) {
        rsBeDetail = 'Aktives Rüstungsset "Ohne Rüstung" — kein Rüstungsschutz, keine Behinderung. Oben umschaltbar.';
      } else {
        rsBeDetail = 'Aus der ersten angelegten Rüstung.';
      }
      wrap.appendChild(infoZeile(`Rüstungsschutz: ${w.RS}, Behinderung: ${w.BE}`, rsBeDetail));

      // Ausgerüstete Waffen, nur lesbar. Die Überschrift "Waffenliste" ist eine
      // fokussierbare Zeile, damit auch Screenreader-Nutzer hören, dass hier die
      // Waffen beginnen (abschnittTitel wäre nur visuell).
      const waffen = (char.waffen || []).filter(x => x.name);
      if (waffen.length) {
        const kopf = infoZeile('Waffenliste', 'Ab hier folgen deine Waffen mit Attacke und Verteidigung.');
        kopf.classList.add('ed-abschnitt'); // wie eine Abschnitts-Überschrift gestaltet
        wrap.appendChild(kopf);
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

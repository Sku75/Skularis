/**
 * Skularistool — Meistertisch: Kampfspieltisch-Bereich (F3).
 *
 * Ein aktiver Kampfspieltisch. Drei Menuepunkte:
 *   - Kampfspieltisch: das aufgebaute Brett. Oben die Gegner, in der Mitte die
 *     Wuerfelebene (Freier Wurf, Monsterwurf, Spielerwurf), unten Spieler und
 *     freundliche NPC. Pfeil hoch/runter wechselt die Reihe, links/rechts die
 *     Karte. Eingabetaste oeffnet das Karten-Menue (auf der Wuerfelebene den
 *     Wurf), Leertaste tippt/verbindet Karten, Plus und Minus setzen Wunden.
 *   - Kampfspieltisch bestuecken: Karten aus Spieler, freundlichen NPC, Gegnern oder
 *     fertigen Sets auf den Tisch holen.
 *   - Sets: vorbereitete Kartenbuendel anlegen und verwalten.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { jaNeinDialog, knopfDialog } from '../ui/dialog.js';
import { angriffeText } from '../core/meister-abenteuer.js';
import { getMeister, speichere } from './state.js';
import { bestueckenScreen, setsScreen } from './sets.js';
import { oeffneFreierWurf, oeffneMonsterwurf, oeffneSpielerwurf } from './wuerfelebene.js';
import { verdeckteProbe, verdeckterWurf } from './wuerfel.js';

export function szenenBereichScreen() {
  return {
    title: 'Kampfspieltisch',
    build() {
      const a = getMeister();
      const n = ((a.tisch && a.tisch.karten) || []).length;
      const items = [
        { label: 'Kampfspieltisch', hint: `das aufgebaute Brett, ${n} Karten`, onSelect: () => screen.push(tischBoardScreen()) },
        { label: 'Kampfspieltisch bestuecken', hint: 'Karten aus Spieler, NPC, Gegner oder Sets auf den Tisch holen', onSelect: () => screen.push(bestueckenScreen()) },
        { label: 'Sets', hint: 'vorbereitete Kartenbuendel anlegen und verwalten', onSelect: () => screen.push(setsScreen()) },
      ];
      if (n) {
        items.push({
          label: 'Kampfspieltisch leeren', hint: 'alle Karten vom Tisch nehmen',
          onSelect: async () => {
            if (!await jaNeinDialog({ titel: 'Kampfspieltisch leeren', frage: 'Alle Karten vom Kampfspieltisch nehmen?' })) return;
            a.tisch.karten = []; a.tisch.verbindungen = []; await speichere(); screen.refresh(); sprache.sage('Kampfspieltisch geleert.');
          },
        });
      }
      return menuScreen({ title: 'Kampfspieltisch', subtitle: 'Escape zurueck.', items }).build();
    },
    onShow() { sprache.sage('Kampfspieltisch.'); },
  };
}

// --- Das aktive Brett (2D + Wuerfelebene) --------------------------------

function istGegner(k) { return k.art === 'gegner'; }
function istFreund(k) { return k.art === 'spieler' || k.art === 'freund'; }

const WUERFEL = [
  { key: 'frei', name: 'Freier Wurf', oeffne: oeffneFreierWurf },
  { key: 'monster', name: 'Monsterwurf', oeffne: oeffneMonsterwurf },
  { key: 'spieler', name: 'Spielerwurf', oeffne: oeffneSpielerwurf },
];
const REIHEN = ['gegner', 'wuerfel', 'freund'];

function tischBoardScreen() {
  const a = getMeister();
  a.tisch = a.tisch || { karten: [] };
  if (!Array.isArray(a.tisch.karten)) a.tisch.karten = [];
  if (!Array.isArray(a.tisch.verbindungen)) a.tisch.verbindungen = [];

  let maxKid = 0;
  for (const k of a.tisch.karten) if (typeof k.kid === 'number' && k.kid > maxKid) maxKid = k.kid;
  for (const k of a.tisch.karten) if (typeof k.kid !== 'number') k.kid = ++maxKid;

  const zustand = { reihe: 'gegner', spalte: 0, getippt: null };

  const gegner = () => a.tisch.karten.filter(istGegner);
  const freunde = () => a.tisch.karten.filter(istFreund);
  const reiheKarten = () => (zustand.reihe === 'gegner' ? gegner() : (zustand.reihe === 'freund' ? freunde() : []));
  const reiheLen = () => (zustand.reihe === 'wuerfel' ? WUERFEL.length : reiheKarten().length);

  const verb = () => a.tisch.verbindungen;
  const gegnerNamen = (kid) => {
    const namen = [];
    for (const v of verb()) {
      if (v[0] === kid) { const p = a.tisch.karten.find(x => x.kid === v[1]); if (p) namen.push(p.name); }
      else if (v[1] === kid) { const p = a.tisch.karten.find(x => x.kid === v[0]); if (p) namen.push(p.name); }
    }
    return namen;
  };
  const wundText = (k) => { const wu = k.wunden || 0; return wu ? `${wu} Wunden${wu >= 5 ? ', kampfunfaehig' : ''}` : 'unverletzt'; };
  const status = (k) => {
    const geg = gegnerNamen(k.kid);
    const teil = geg.length ? `kaempft gegen ${geg.join(', ')}` : 'frei';
    const erg = k.letztesErgebnis ? `, ${k.letztesErgebnis}` : '';
    const tipp = zustand.getippt === k.kid ? ', angetippt' : '';
    return `${teil}. ${k.name}${erg}, ${wundText(k)}, Wundschwelle ${k.ws}, Ruestung ${k.rs}, Initiative ${k.ini}${tipp}. ${angriffeText(k) || 'keine Angriffe'}`;
  };
  const kurzText = (k) => {
    const teil = gegnerNamen(k.kid).length ? 'kaempft' : 'frei';
    const erg = k.letztesErgebnis ? `, ${k.letztesErgebnis}` : '';
    const wu = k.wunden ? `, ${k.wunden} Wunden` : '';
    const tipp = zustand.getippt === k.kid ? ', angetippt' : '';
    return `${teil}, ${k.name}${erg}${wu}${tipp}`;
  };

  const scr = {
    title: 'Kampfspieltisch',
    _wrap: null,
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      scr._wrap = wrap;
      wrap.addEventListener('keydown', (e) => {
        const k = e.key;
        const abfangen = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', '+', '-', ' ', 'i', 'I'];
        if (!abfangen.includes(k)) return;
        e.preventDefault(); e.stopPropagation();
        if (k === 'ArrowUp') wechsleReihe(-1);
        else if (k === 'ArrowDown') wechsleReihe(1);
        else if (k === 'ArrowLeft') bewege(-1);
        else if (k === 'ArrowRight') bewege(1);
        else if (k === 'Enter') aktiviere();
        else if (k === '+') wundeAendern(1);
        else if (k === '-') wundeAendern(-1);
        else if (k === ' ') tippe();
        else if (k === 'i' || k === 'I') initiative();
      }, true);
      zeichne();
      return wrap;
    },
    onShow() {
      sprache.sage('Kampfspieltisch. Pfeil hoch die Gegner, in der Mitte die Wuerfelebene, Pfeil runter die Spieler und freundlichen NPC. Links und rechts waehlt. Eingabetaste oeffnet das Karten-Menue, auf der Wuerfelebene den Wurf. Leertaste tippt und verbindet Karten. Plus und Minus setzen Wunden. Taste i geht die Initiative durch.');
      setTimeout(fokus, 120);
    },
  };

  function zeichne() {
    const wrap = scr._wrap;
    if (!wrap) return;
    wrap.innerHTML = '';
    const kartenReihe = (titel, karten, art) => {
      const h = document.createElement('div');
      h.className = 'ed-abschnitt'; h.setAttribute('aria-hidden', 'true'); h.textContent = titel;
      wrap.appendChild(h);
      const row = document.createElement('div'); row.className = 'db-menu__list';
      if (!karten.length) {
        const leer = document.createElement('div');
        leer.className = 'db-row'; leer.tabIndex = 0;
        leer.setAttribute('aria-label', `${titel}: keine Karten`); leer.textContent = `${titel}: keine`;
        row.appendChild(leer);
      } else {
        karten.forEach((k) => {
          const b = document.createElement('div');
          b.className = 'db-row ed-zeile'; b.tabIndex = 0;
          b.id = `karte-${art}-${k.kid}`; b.dataset.kid = String(k.kid);
          b.textContent = kurzText(k); b.setAttribute('aria-label', kurzText(k)); b.__detail = status(k);
          row.appendChild(b);
        });
      }
      wrap.appendChild(row);
    };
    kartenReihe('Gegner', gegner(), 'gegner');
    // Wuerfelebene
    const hw = document.createElement('div');
    hw.className = 'ed-abschnitt'; hw.setAttribute('aria-hidden', 'true'); hw.textContent = 'Wuerfelebene';
    wrap.appendChild(hw);
    const wrow = document.createElement('div'); wrow.className = 'db-menu__list';
    WUERFEL.forEach((w, i) => {
      const b = document.createElement('div');
      b.className = 'db-row ed-zeile'; b.tabIndex = 0;
      b.id = `wuerfel-${i}`; b.textContent = w.name; b.setAttribute('aria-label', w.name);
      wrow.appendChild(b);
    });
    wrap.appendChild(wrow);
    kartenReihe('Spieler und freundliche NPC', freunde(), 'freund');
  }

  function aktuelleKarte() {
    if (zustand.reihe === 'wuerfel') return null;
    const arr = reiheKarten();
    if (!arr.length) return null;
    zustand.spalte = Math.max(0, Math.min(arr.length - 1, zustand.spalte));
    return arr[zustand.spalte];
  }

  function fokus() {
    if (zustand.reihe === 'wuerfel') {
      zustand.spalte = Math.max(0, Math.min(WUERFEL.length - 1, zustand.spalte));
      const el = scr._wrap && scr._wrap.querySelector(`#wuerfel-${zustand.spalte}`);
      // NUR fokussieren (NVDA liest das benannte Element selbst) — KEIN
      // zusaetzliches sprache.sage(), sonst kommt der Name doppelt. benenneFuerFokus
      // macht die Zeile zu einem sauberen Schalter, den NVDA genau einmal liest.
      if (el) { sprache.benenneFuerFokus(el); el.focus(); }
      return;
    }
    const k = aktuelleKarte();
    if (!k) { sprache.sage(zustand.reihe === 'gegner' ? 'Gegner: keine Karten.' : 'Spieler und freundliche NPC: keine Karten.'); return; }
    const el = scr._wrap && scr._wrap.querySelector(`#karte-${zustand.reihe}-${k.kid}`);
    // NUR fokussieren, KEIN zusaetzliches sprache.sage() — sonst doppelt.
    if (el) { sprache.benenneFuerFokus(el); el.focus(); }
  }

  function wechsleReihe(d) {
    let idx = REIHEN.indexOf(zustand.reihe);
    idx = Math.max(0, Math.min(REIHEN.length - 1, idx + d));
    zustand.reihe = REIHEN[idx];
    zustand.spalte = 0;
    fokus();
  }
  function bewege(d) {
    const len = reiheLen();
    if (!len) { fokus(); return; }
    zustand.spalte = Math.max(0, Math.min(len - 1, zustand.spalte + d));
    fokus();
  }

  function fokusNach() {
    setTimeout(() => {
      if (zustand.reihe === 'wuerfel') { const el = scr._wrap && scr._wrap.querySelector(`#wuerfel-${zustand.spalte}`); if (el) { sprache.benenneFuerFokus(el); el.focus(); } return; }
      const k = aktuelleKarte(); if (!k) return;
      const el = scr._wrap && scr._wrap.querySelector(`#karte-${zustand.reihe}-${k.kid}`); if (el) { sprache.benenneFuerFokus(el); el.focus(); }
    }, 0);
  }
  function fokusKarte(k) {
    zustand.reihe = istGegner(k) ? 'gegner' : 'freund';
    const arr = reiheKarten(); const i = arr.indexOf(k); if (i >= 0) zustand.spalte = i;
    const el = scr._wrap && scr._wrap.querySelector(`#karte-${zustand.reihe}-${k.kid}`); if (el) { sprache.benenneFuerFokus(el); el.focus(); }
  }

  function aktiviere() {
    if (zustand.reihe === 'wuerfel') { const w = WUERFEL[zustand.spalte]; if (w) w.oeffne(); return; }
    karteMenue();
  }

  function tippe() {
    if (zustand.reihe === 'wuerfel') return;
    const k = aktuelleKarte();
    if (!k) return;
    if (zustand.getippt == null) {
      zustand.getippt = k.kid; sounds.playClick(); zeichne(); fokusNach();
      sprache.sage(`${k.name} angetippt. Waehle eine Karte der anderen Reihe zum Verbinden, oder dieselbe zum Abwaehlen.`); return;
    }
    if (zustand.getippt === k.kid) { zustand.getippt = null; sounds.playClick(); zeichne(); fokusNach(); sprache.sage(`${k.name} abgewaehlt.`); return; }
    const anker = a.tisch.karten.find(x => x.kid === zustand.getippt);
    if (!anker) { zustand.getippt = k.kid; zeichne(); fokusNach(); return; }
    const gleicheReihe = (istGegner(anker) && istGegner(k)) || (istFreund(anker) && istFreund(k));
    if (gleicheReihe) { zustand.getippt = k.kid; sounds.playClick(); zeichne(); fokusNach(); sprache.sage(`${k.name} angetippt.`); return; }
    const idx = verb().findIndex(v => (v[0] === anker.kid && v[1] === k.kid) || (v[0] === k.kid && v[1] === anker.kid));
    if (idx >= 0) { verb().splice(idx, 1); sprache.sage(`Verbindung geloest. ${anker.name} und ${k.name} kaempfen nicht mehr.`); }
    else { verb().push([anker.kid, k.kid]); sprache.sage(`${anker.name} kaempft jetzt gegen ${k.name}.`); }
    speichere(); zeichne(); fokusNach();
  }

  function wundeAendern(d) {
    const k = aktuelleKarte();
    if (!k) return;
    const alt = k.wunden || 0; const neu = Math.max(0, Math.min(99, alt + d));
    if (neu === alt) { sounds.playError(); return; }
    k.wunden = neu; if (d > 0) sounds.playWertHoch(); else sounds.playWertRunter();
    speichere(); zeichne(); fokusNach(); sprache.sage(`${k.name}, ${wundText(k)}, Wundschwelle ${k.ws}.`);
  }

  function karteMenue() {
    const k = aktuelleKarte();
    if (!k) return;
    const knoepfe = [];
    if ((k.angriffe || []).length) { knoepfe.push({ label: 'Angriff wuerfeln', wert: 'at' }); knoepfe.push({ label: 'Schaden wuerfeln', wert: 'sch' }); }
    knoepfe.push({ label: 'Wunde plus', wert: 'w+' });
    knoepfe.push({ label: 'Wunde minus', wert: 'w-' });
    knoepfe.push({ label: 'Vom Kampfspieltisch nehmen', wert: 'entf' });
    knopfDialog({ titel: k.name, knoepfe }).then(async (wahl) => {
      if (wahl === null) { fokusNach(); return; }
      if (wahl === 'w+') { wundeAendern(1); return; }
      if (wahl === 'w-') { wundeAendern(-1); return; }
      if (wahl === 'entf') {
        if (!await jaNeinDialog({ titel: 'Entfernen', frage: `${k.name} vom Kampfspieltisch nehmen?` })) { fokusNach(); return; }
        const i = a.tisch.karten.indexOf(k); if (i >= 0) a.tisch.karten.splice(i, 1);
        a.tisch.verbindungen = verb().filter(v => !v.includes(k.kid));
        speichere(); zeichne(); setTimeout(fokus, 0); sprache.sage(`${k.name} entfernt.`); return;
      }
      const ang = await waehleAngriff(k);
      if (!ang) { fokusNach(); return; }
      if (wahl === 'at') { const r = verdeckteProbe({ wer: k.name, was: `Angriff ${ang.name}`, probenwert: (ang.at != null ? ang.at : ang.wert || 0), anzahl: 1, stumm: true }); k.letztesErgebnis = `Angriff ${ang.name}, Probe ${r.ew}`; }
      else { const r = verdeckterWurf(ang.wuerfel, ang.seiten, ang.bonus, `Schaden ${ang.name}`, true); k.letztesErgebnis = `Schaden ${ang.name}, ${r.summe}`; }
      speichere(); zeichne();
      setTimeout(() => {
        const el = scr._wrap && scr._wrap.querySelector(`#karte-${zustand.reihe}-${k.kid}`);
        if (el) {
          // Ergebnis als Fokus-Namen setzen und NUR fokussieren — NVDA liest es
          // einmal. Kein zusaetzliches sage(), sonst doppelt.
          el.setAttribute('aria-label', `${k.name}, ${k.letztesErgebnis}.`);
          el.setAttribute('role', 'button');
          el.focus();
        } else {
          sprache.sage(`${k.name}, ${k.letztesErgebnis}.`);
        }
      }, 0);
    });
  }

  function waehleAngriff(k) {
    const an = k.angriffe || [];
    if (!an.length) return Promise.resolve(null);
    if (an.length === 1) return Promise.resolve(an[0]);
    return knopfDialog({ titel: 'Welcher Angriff?', knoepfe: an.map((a2, i) => ({ label: a2.name, wert: i })) }).then(i => (i === null ? null : an[i]));
  }

  let initPos = -1;
  function initiative() {
    const alle = [...a.tisch.karten].sort((x, y) => (y.ini || 0) - (x.ini || 0));
    if (!alle.length) { sprache.sage('Keine Karten auf dem Kampfspieltisch.'); return; }
    initPos = (initPos + 1) % alle.length;
    const k = alle[initPos];
    fokusKarte(k);
    sprache.sage(`Initiative, ${initPos + 1} von ${alle.length}. Am Zug: ${k.name}, Initiative ${k.ini}, ${wundText(k)}.`);
  }

  return scr;
}

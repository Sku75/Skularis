/**
 * Skularistool — Meistertisch: Szenen-Bereich.
 *
 * Zwei Wege:
 *   - Meine Szenenpacks: Vorbereitung, nach Abenteuer geordnet (szenenpacks.js).
 *   - Szenen spielen: die Szenen DIESES Meisterabenteuers, durchnummeriert S-1,
 *     S-2, ... (unten die hoechste). Szene erstellen oben. Enter auf einer Szene:
 *     Spielen, Bearbeiten, Loeschen.
 *
 * Das Spielbrett einer Szene ist wie bei Magic oder Hearthstone: oben die Gegner-
 * Reihe, unten die Freunde-Reihe. Pfeil hoch und runter wechselt die Reihe, Pfeil
 * links und rechts die Karte. Eingabetaste tippt eine Karte an; tippt man danach
 * eine Karte der anderen Reihe an, werden beide verbunden (sie kaempfen
 * gegeneinander). Auf einer Karte wird zuerst gesagt, ob sie kaempft oder frei
 * ist, dann Name und Werte.
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import * as sounds from '../sounds.js';
import { menuScreen } from '../ui/menu-screen.js';
import { jaNeinDialog } from '../ui/dialog.js';
import { angriffeText } from '../core/meister-abenteuer.js';
import { getMeister, speichere } from './state.js';
import { szenenpacksScreen, kartenEditorScreen, ladeAufTisch } from './szenenpacks.js';
import { spieltischScreen } from './spieltisch.js';

export function szenenBereichScreen() {
  return {
    title: 'Szenen',
    build() {
      return menuScreen({
        title: 'Szenen',
        subtitle: 'Escape zurueck.',
        items: [
          { label: 'Meine Szenenpacks', hint: 'vorbereitete Kartensets, nach Abenteuer geordnet', onSelect: () => screen.push(szenenpacksScreen()) },
          { label: 'Szenen spielen', hint: 'die Szenen dieses Abenteuers, durchnummeriert', onSelect: () => screen.push(szenenSpielenScreen()) },
          { label: 'Freier Spieltisch', hint: 'Karten frei auf den Tisch legen', onSelect: () => screen.push(spieltischScreen()) },
        ],
      }).build();
    },
  };
}

export function szenenSpielenScreen() {
  return {
    title: '',
    build() {
      const a = getMeister();
      this.title = `Szenen spielen, ${a.szenen.length} Szenen`;
      const items = [];
      items.push({ label: 'Szene erstellen', hint: 'eine neue Szene fuer dieses Abenteuer', onSelect: () => neueSzene() });
      a.szenen.forEach((s, i) => {
        items.push({
          label: `S-${i + 1}${s.name ? ' ' + s.name : ''}`,
          hint: `${(s.karten || []).length} Karten. Enter: spielen, bearbeiten, loeschen`,
          onSelect: () => screen.push(szeneMenuScreen(i)),
        });
      });
      return menuScreen({ title: this.title, subtitle: 'Szene erstellen oben, darunter die Szenen. Escape zurueck.', items }).build();
    },
  };
}

async function neueSzene() {
  const a = getMeister();
  a.szenen.push({ name: '', karten: [], verbindungen: [] });
  await speichere();
  sounds.playOeffnen();
  const i = a.szenen.length - 1;
  screen.push(kartenEditorScreen(a.szenen[i], speichere));
  sprache.sage(`Szene S-${i + 1} erstellt. Fuege Karten hinzu.`);
}

function szeneMenuScreen(index) {
  return {
    title: '',
    build() {
      const a = getMeister();
      const s = a.szenen[index];
      if (!s) { screen.pop(); return document.createElement('div'); }
      this.title = `S-${index + 1}${s.name ? ' ' + s.name : ''}`;
      return menuScreen({
        title: this.title,
        subtitle: 'Escape zurueck.',
        items: [
          { label: 'Spielen', hint: 'das Spielbrett dieser Szene oeffnen', onSelect: () => screen.push(szeneBoardScreen(index)) },
          { label: 'Bearbeiten', hint: 'Karten hinzufuegen und aendern', onSelect: () => screen.push(kartenEditorScreen(s, speichere)) },
          { label: 'Auch auf den freien Spieltisch laden', hint: 'Karten zusaetzlich auf den Tisch legen', onSelect: () => { const n = ladeAufTisch(s); sounds.playOeffnen(); sprache.sage(`${n} Karten auf den Spieltisch geladen.`); } },
          {
            label: 'Loeschen',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Loeschen', frage: `Szene S-${index + 1} loeschen?` })) return;
              a.szenen.splice(index, 1); await speichere(); screen.pop(); sprache.sage('Szene geloescht.');
            },
          },
        ],
      }).build();
    },
  };
}

// --- Spielbrett (2D, Antippen und Verbinden) -----------------------------

function istGegner(k) { return k.art === 'gegner'; }
function istFreund(k) { return k.art === 'spieler' || k.art === 'freund'; }

function szeneBoardScreen(index) {
  const a = getMeister();
  const s = a.szenen[index];
  // Stabile Karten-Id (kid) fuer Verbindungen vergeben.
  let maxKid = 0;
  for (const k of s.karten || []) if (typeof k.kid === 'number' && k.kid > maxKid) maxKid = k.kid;
  for (const k of s.karten || []) if (typeof k.kid !== 'number') k.kid = ++maxKid;
  if (!Array.isArray(s.verbindungen)) s.verbindungen = [];

  const zustand = { reihe: 'gegner', spalte: 0, getippt: null };

  const gegner = () => (s.karten || []).filter(istGegner);
  const freunde = () => (s.karten || []).filter(istFreund);
  const reiheKarten = () => (zustand.reihe === 'gegner' ? gegner() : freunde());

  const kaempft = (kid) => s.verbindungen.some(v => v.includes(kid));
  const gegnerNamen = (kid) => {
    const namen = [];
    for (const v of s.verbindungen) {
      if (v[0] === kid) { const p = (s.karten || []).find(x => x.kid === v[1]); if (p) namen.push(p.name); }
      else if (v[1] === kid) { const p = (s.karten || []).find(x => x.kid === v[0]); if (p) namen.push(p.name); }
    }
    return namen;
  };
  const status = (k) => {
    const geg = gegnerNamen(k.kid);
    const teil = geg.length ? `kaempft gegen ${geg.join(', ')}` : 'frei';
    const tipp = zustand.getippt === k.kid ? ', angetippt' : '';
    return `${teil}. ${k.name}, Wundschwelle ${k.ws}, Ruestung ${k.rs}, Initiative ${k.ini}${tipp}. ${angriffeText(k) || 'keine Angriffe'}`;
  };

  const scr = {
    title: `Spielbrett S-${index + 1}`,
    _wrap: null,
    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';
      scr._wrap = wrap;
      // Eigene 2D-Steuerung: Pfeile und Eingabetaste im Erfassungslauf abfangen,
      // damit die normale Listen-Navigation nicht dazwischenfunkt.
      wrap.addEventListener('keydown', (e) => {
        const k = e.key;
        if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Enter') {
          e.preventDefault(); e.stopPropagation();
          if (k === 'ArrowUp') wechsleReihe('gegner');
          else if (k === 'ArrowDown') wechsleReihe('freund');
          else if (k === 'ArrowLeft') bewege(-1);
          else if (k === 'ArrowRight') bewege(1);
          else if (k === 'Enter') tippe();
        }
      }, true);
      zeichne();
      return wrap;
    },
    onShow() {
      sprache.sage('Spielbrett. Pfeil hoch die Gegner, Pfeil runter die Freunde. Pfeil links und rechts die Karten. Eingabetaste tippt eine Karte an; danach eine Karte der anderen Reihe antippen verbindet beide.');
      setTimeout(fokus, 120);
    },
  };

  function zeichne() {
    const wrap = scr._wrap;
    if (!wrap) return;
    wrap.innerHTML = '';
    const reihe = (titel, karten, art) => {
      const h = document.createElement('div');
      h.className = 'ed-abschnitt'; h.setAttribute('aria-hidden', 'true'); h.textContent = titel;
      wrap.appendChild(h);
      const row = document.createElement('div');
      row.className = 'db-menu__list';
      if (!karten.length) {
        const leer = document.createElement('div');
        leer.className = 'db-row'; leer.tabIndex = 0;
        leer.setAttribute('aria-label', `${titel}: keine Karten`);
        leer.textContent = `${titel}: keine`;
        row.appendChild(leer);
      } else {
        karten.forEach((k) => {
          const b = document.createElement('div');
          b.className = 'db-row ed-zeile';
          b.tabIndex = 0;
          b.id = `karte-${art}-${k.kid}`;
          b.dataset.kid = String(k.kid);
          const kurz = `${kaempft(k.kid) ? 'kaempft' : 'frei'}, ${k.name}${zustand.getippt === k.kid ? ', angetippt' : ''}`;
          b.textContent = kurz;
          b.setAttribute('aria-label', status(k));
          b.__detail = status(k);
          row.appendChild(b);
        });
      }
      wrap.appendChild(row);
    };
    reihe('Gegner', gegner(), 'gegner');
    reihe('Freunde', freunde(), 'freund');
  }

  function aktuelleKarte() {
    const arr = reiheKarten();
    if (!arr.length) return null;
    zustand.spalte = Math.max(0, Math.min(arr.length - 1, zustand.spalte));
    return arr[zustand.spalte];
  }

  function fokus() {
    const k = aktuelleKarte();
    if (!k) { sprache.sage(zustand.reihe === 'gegner' ? 'Gegner: keine Karten.' : 'Freunde: keine Karten.'); return; }
    const el = scr._wrap && scr._wrap.querySelector(`#karte-${zustand.reihe}-${k.kid}`);
    if (el) { el.focus(); sprache.sage(status(k)); }
  }

  function wechsleReihe(reihe) {
    zustand.reihe = reihe;
    fokus();
  }
  function bewege(d) {
    const arr = reiheKarten();
    if (!arr.length) { fokus(); return; }
    zustand.spalte = Math.max(0, Math.min(arr.length - 1, zustand.spalte + d));
    fokus();
  }

  function tippe() {
    const k = aktuelleKarte();
    if (!k) return;
    if (zustand.getippt == null) {
      zustand.getippt = k.kid;
      sounds.playClick();
      zeichne(); fokusNach();
      sprache.sage(`${k.name} angetippt. Waehle eine Karte der anderen Reihe zum Verbinden, oder dieselbe zum Abwaehlen.`);
      return;
    }
    if (zustand.getippt === k.kid) {
      zustand.getippt = null;
      sounds.playClick();
      zeichne(); fokusNach();
      sprache.sage(`${k.name} abgewaehlt.`);
      return;
    }
    const anker = (s.karten || []).find(x => x.kid === zustand.getippt);
    if (!anker) { zustand.getippt = k.kid; zeichne(); fokusNach(); return; }
    const gleicheReihe = (istGegner(anker) && istGegner(k)) || (istFreund(anker) && istFreund(k));
    if (gleicheReihe) {
      zustand.getippt = k.kid;
      sounds.playClick();
      zeichne(); fokusNach();
      sprache.sage(`${k.name} angetippt.`);
      return;
    }
    // Andere Reihe: Verbindung umschalten.
    const idx = s.verbindungen.findIndex(v => (v[0] === anker.kid && v[1] === k.kid) || (v[0] === k.kid && v[1] === anker.kid));
    if (idx >= 0) {
      s.verbindungen.splice(idx, 1);
      sprache.sage(`Verbindung geloest. ${anker.name} und ${k.name} kaempfen nicht mehr.`);
    } else {
      s.verbindungen.push([anker.kid, k.kid]);
      sprache.sage(`${anker.name} kaempft jetzt gegen ${k.name}.`);
    }
    speichere();
    // Anker bleibt angetippt, damit man mehrere Gegner zuweisen kann.
    zeichne(); fokusNach();
  }

  // Nach einem Neuzeichnen den Fokus wieder auf die aktuelle Karte setzen.
  function fokusNach() {
    setTimeout(() => {
      const k = aktuelleKarte();
      if (!k) return;
      const el = scr._wrap && scr._wrap.querySelector(`#karte-${zustand.reihe}-${k.kid}`);
      if (el) el.focus();
    }, 0);
  }

  return scr;
}

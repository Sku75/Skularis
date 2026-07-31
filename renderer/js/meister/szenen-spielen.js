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
import { jaNeinDialog, knopfDialog, textDialog } from '../ui/dialog.js';
import { angriffeText } from '../core/meister-abenteuer.js';
import { getMeister, speichere } from './state.js';
import { szenenpacksScreen, kartenEditorScreen, ladeAufTisch } from './szenenpacks.js';
import { spieltischScreen } from './spieltisch.js';
import { verdeckteProbe, verdeckterWurf } from './wuerfel.js';

export function szenenBereichScreen() {
  return {
    title: 'Kampfszenen',
    build() {
      return menuScreen({
        title: 'Kampfszenen',
        subtitle: 'Escape zurueck.',
        items: [
          { label: 'Meine Kampfszenenpacks', hint: 'vorbereitete Kartensets, nach Abenteuer geordnet', onSelect: () => screen.push(szenenpacksScreen()) },
          { label: 'Kampfszenen spielen', hint: 'die Kampfszenen dieses Abenteuers, durchnummeriert', onSelect: () => screen.push(szenenSpielenScreen()) },
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
      this.title = `Kampfszenen spielen, ${a.szenen.length} Kampfszenen`;
      const items = [];
      items.push({ label: 'Kampfszene erstellen', hint: 'eine neue Kampfszene fuer dieses Abenteuer', onSelect: () => neueSzene() });
      a.szenen.forEach((s, i) => {
        items.push({
          label: `S-${i + 1}${s.name ? ' ' + s.name : ''}`,
          hint: `${(s.karten || []).length} Karten. Enter: spielen, bearbeiten, loeschen`,
          onSelect: () => screen.push(szeneMenuScreen(i)),
        });
      });
      return menuScreen({ title: this.title, subtitle: 'Kampfszene erstellen oben, darunter die Kampfszenen. Escape zurueck.', items }).build();
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
  sprache.sage(`Kampfszene S-${i + 1} erstellt. Fuege Karten hinzu.`);
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
          { label: 'Spielen', hint: 'das Spielbrett dieser Kampfszene oeffnen', onSelect: () => screen.push(szeneBoardScreen(index)) },
          { label: 'Bearbeiten', hint: 'Karten hinzufuegen und aendern', onSelect: () => screen.push(kartenEditorScreen(s, speichere)) },
          { label: 'Vorlesetexte', hint: 'Texte zum Vorlesen in dieser Kampfszene', onSelect: () => screen.push(vorlesetexteScreen(s)) },
          {
            label: `Kampfszenen-Notiz${s.notizen ? ': ' + s.notizen : ''}`,
            onSelect: async () => { const v = await textDialog({ titel: 'Kampfszenen-Notiz', label: 'Notiz zu dieser Kampfszene', wert: s.notizen || '' }); if (v === null) return; s.notizen = v.trim(); await speichere(); screen.refresh(); sprache.sage('Notiz gespeichert.'); },
          },
          {
            label: 'Kampfszene zuruecksetzen',
            hint: 'Wunden und Verbindungen loeschen',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Zuruecksetzen', frage: 'Wunden und Verbindungen dieser Kampfszene loeschen?' })) return;
              for (const k of s.karten || []) { k.wunden = 0; k.letztesErgebnis = ''; }
              s.verbindungen = [];
              await speichere(); sprache.sage('Kampfszene zurueckgesetzt.');
            },
          },
          { label: 'Auch auf den freien Spieltisch laden', hint: 'Karten zusaetzlich auf den Tisch legen', onSelect: () => { const n = ladeAufTisch(s); sounds.playOeffnen(); sprache.sage(`${n} Karten auf den Spieltisch geladen.`); } },
          {
            label: 'Loeschen',
            onSelect: async () => {
              if (!await jaNeinDialog({ titel: 'Loeschen', frage: `Kampfszene S-${index + 1} loeschen?` })) return;
              a.szenen.splice(index, 1); await speichere(); screen.pop(); sprache.sage('Kampfszene geloescht.');
            },
          },
        ],
      }).build();
    },
  };
}

function vorlesetexteScreen(s) {
  if (!Array.isArray(s.vorlesetexte)) s.vorlesetexte = [];
  return {
    title: '',
    build() {
      this.title = `Vorlesetexte, ${s.vorlesetexte.length}`;
      const items = [];
      items.push({
        label: 'Vorlesetext hinzufuegen',
        onSelect: async () => {
          const titel = await textDialog({ titel: 'Vorlesetext', label: 'Titel' }); if (titel === null || !titel.trim()) return;
          const inhalt = await textDialog({ titel: 'Vorlesetext', label: 'Text zum Vorlesen' }); if (inhalt === null) return;
          s.vorlesetexte.push({ titel: titel.trim(), inhalt: inhalt.trim() });
          await speichere(); screen.refresh(); sprache.sage('Vorlesetext gespeichert.');
        },
      });
      s.vorlesetexte.forEach((t, i) => {
        items.push({
          label: t.titel || '(ohne Titel)',
          detail: t.inhalt || '',
          hint: 'Enter: vorlesen, bearbeiten, loeschen',
          onSelect: () => screen.push(vorlesetextEintragScreen(s, i)),
        });
      });
      return menuScreen({ title: this.title, subtitle: 'Hinzufuegen oben. Escape zurueck.', items, leer: 'Noch keine Vorlesetexte.' }).build();
    },
  };
}

function vorlesetextEintragScreen(s, i) {
  return {
    title: '',
    build() {
      const t = (s.vorlesetexte || [])[i];
      if (!t) { screen.pop(); return document.createElement('div'); }
      this.title = t.titel || 'Vorlesetext';
      return menuScreen({
        title: this.title,
        subtitle: 'Escape zurueck.',
        items: [
          { label: 'Vorlesen', onSelect: () => sprache.sage(t.inhalt || '') },
          { label: 'Bearbeiten', onSelect: async () => { const ti = await textDialog({ titel: 'Titel', label: 'Titel', wert: t.titel }); if (ti === null) return; const inh = await textDialog({ titel: 'Text', label: 'Text', wert: t.inhalt }); if (inh === null) return; t.titel = ti.trim(); t.inhalt = inh.trim(); await speichere(); screen.refresh(); sprache.sage('Gespeichert.'); } },
          { label: 'Loeschen', onSelect: async () => { if (!await jaNeinDialog({ titel: 'Loeschen', frage: 'Vorlesetext loeschen?' })) return; s.vorlesetexte.splice(i, 1); await speichere(); screen.pop(); sprache.sage('Geloescht.'); } },
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
  const wundText = (k) => {
    const wu = k.wunden || 0;
    if (!wu) return 'unverletzt';
    return `${wu} Wunden${wu >= 5 ? ', kampfunfaehig' : ''}`;
  };
  const status = (k) => {
    const geg = gegnerNamen(k.kid);
    const teil = geg.length ? `kaempft gegen ${geg.join(', ')}` : 'frei';
    const tipp = zustand.getippt === k.kid ? ', angetippt' : '';
    // Das zuletzt gewuerfelte Ergebnis steht direkt hinter dem Namen, damit es
    // ganz oben im Tooltip erscheint und beim Fokus gleich mit angesagt wird.
    const erg = k.letztesErgebnis ? `, ${k.letztesErgebnis}` : '';
    return `${teil}. ${k.name}${erg}, ${wundText(k)}, Wundschwelle ${k.ws}, Ruestung ${k.rs}, Initiative ${k.ini}${tipp}. ${angriffeText(k) || 'keine Angriffe'}`;
  };
  // Kurze Fokus-Ansage: nur das Noetige, Stueck fuer Stueck. Die vollen Werte
  // (Wundschwelle, Ruestung, Initiative, Angriffe) stehen im Tooltip (Detail).
  const kurzText = (k) => {
    const teil = gegnerNamen(k.kid).length ? 'kaempft' : 'frei';
    const erg = k.letztesErgebnis ? `, ${k.letztesErgebnis}` : '';
    const wu = k.wunden ? `, ${k.wunden} Wunden` : '';
    const tipp = zustand.getippt === k.kid ? ', angetippt' : '';
    return `${teil}, ${k.name}${erg}${wu}${tipp}`;
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
        const abfangen = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', '+', '-', ' ', 'i', 'I', 'v', 'V'];
        if (!abfangen.includes(k)) return;
        e.preventDefault(); e.stopPropagation();
        if (k === 'ArrowUp') wechsleReihe('gegner');
        else if (k === 'ArrowDown') wechsleReihe('freund');
        else if (k === 'ArrowLeft') bewege(-1);
        else if (k === 'ArrowRight') bewege(1);
        else if (k === 'Enter') tippe();
        else if (k === '+') wundeAendern(1);
        else if (k === '-') wundeAendern(-1);
        else if (k === ' ') karteMenue();
        else if (k === 'i' || k === 'I') initiative();
        else if (k === 'v' || k === 'V') vorlesen();
      }, true);
      zeichne();
      return wrap;
    },
    onShow() {
      sprache.sage('Spielbrett. Pfeil hoch die Gegner, Pfeil runter die Freunde, Pfeil links und rechts die Karten. Eingabetaste verbindet Karten. Plus und Minus setzen Wunden. Leertaste oeffnet das Karten-Menue zum Wuerfeln. Taste i geht die Initiative durch, Taste v liest die Vorlesetexte dieser Szene.');
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
          b.textContent = kurzText(k);
          b.setAttribute('aria-label', kurzText(k));
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
    if (el) { el.focus(); sprache.sage(kurzText(k)); }
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

  function fokusKarte(k) {
    zustand.reihe = istGegner(k) ? 'gegner' : 'freund';
    const arr = reiheKarten();
    const i = arr.indexOf(k);
    if (i >= 0) zustand.spalte = i;
    const el = scr._wrap && scr._wrap.querySelector(`#karte-${zustand.reihe}-${k.kid}`);
    if (el) el.focus();
  }

  // Wunden je Karte, mit Plus und Minus.
  function wundeAendern(d) {
    const k = aktuelleKarte();
    if (!k) return;
    const alt = k.wunden || 0;
    const neu = Math.max(0, Math.min(99, alt + d));
    if (neu === alt) { sounds.playError(); return; }
    k.wunden = neu;
    if (d > 0) sounds.playWertHoch(); else sounds.playWertRunter();
    speichere();
    zeichne(); fokusNach();
    sprache.sage(`${k.name}, ${wundText(k)}, Wundschwelle ${k.ws}.`);
  }

  // Karten-Menue (Leertaste): Angriff und Schaden verdeckt wuerfeln, Wunden,
  // Karte entfernen.
  function karteMenue() {
    const k = aktuelleKarte();
    if (!k) return;
    const knoepfe = [];
    if ((k.angriffe || []).length) { knoepfe.push({ label: 'Angriff wuerfeln', wert: 'at' }); knoepfe.push({ label: 'Schaden wuerfeln', wert: 'sch' }); }
    knoepfe.push({ label: 'Wunde plus', wert: 'w+' });
    knoepfe.push({ label: 'Wunde minus', wert: 'w-' });
    knoepfe.push({ label: 'Aus der Szene entfernen', wert: 'entf' });
    knopfDialog({ titel: k.name, knoepfe }).then(async (wahl) => {
      if (wahl === null) { fokusNach(); return; }
      if (wahl === 'w+') { wundeAendern(1); return; }
      if (wahl === 'w-') { wundeAendern(-1); return; }
      if (wahl === 'entf') {
        if (!await jaNeinDialog({ titel: 'Entfernen', frage: `${k.name} aus der Kampfszene nehmen?` })) { fokusNach(); return; }
        const i = s.karten.indexOf(k); if (i >= 0) s.karten.splice(i, 1);
        s.verbindungen = s.verbindungen.filter(v => !v.includes(k.kid));
        speichere(); zeichne(); setTimeout(fokus, 0); sprache.sage(`${k.name} entfernt.`);
        return;
      }
      const ang = await waehleAngriff(k);
      if (!ang) { fokusNach(); return; }
      // Verdeckt wuerfeln (stumm), Ergebnis auf der Karte merken, dann selbst mit
      // dem Kartennamen ZUERST ansagen und in den Tooltip schreiben.
      if (wahl === 'at') {
        const r = verdeckteProbe({ wer: k.name, was: `Angriff ${ang.name}`, probenwert: (ang.at != null ? ang.at : ang.wert || 0), anzahl: 1, stumm: true });
        k.letztesErgebnis = `Angriff ${ang.name}, Probe ${r.ew}`;
      } else {
        const r = verdeckterWurf(ang.wuerfel, ang.seiten, ang.bonus, `Schaden ${ang.name}`, true);
        k.letztesErgebnis = `Schaden ${ang.name}, ${r.summe}`;
      }
      speichere();
      zeichne();
      setTimeout(() => {
        const el = scr._wrap && scr._wrap.querySelector(`#karte-${zustand.reihe}-${k.kid}`);
        if (el) el.focus();
        sprache.sage(`${k.name}, ${k.letztesErgebnis}.`);
      }, 0);
    });
  }

  function waehleAngriff(k) {
    const an = k.angriffe || [];
    if (!an.length) return Promise.resolve(null);
    if (an.length === 1) return Promise.resolve(an[0]);
    return knopfDialog({ titel: 'Welcher Angriff?', knoepfe: an.map((a2, i) => ({ label: a2.name, wert: i })) }).then(i => (i === null ? null : an[i]));
  }

  // Initiative: durch die Reihenfolge steppen (hoechste zuerst).
  let initPos = -1;
  function initiative() {
    const alle = [...(s.karten || [])].sort((x, y) => (y.ini || 0) - (x.ini || 0));
    if (!alle.length) { sprache.sage('Keine Karten in der Kampfszene.'); return; }
    initPos = (initPos + 1) % alle.length;
    const k = alle[initPos];
    fokusKarte(k);
    sprache.sage(`Initiative, ${initPos + 1} von ${alle.length}. Am Zug: ${k.name}, Initiative ${k.ini}, ${wundText(k)}.`);
  }

  // Vorlesetexte der Szene durchgehen.
  let vorlesePos = -1;
  function vorlesen() {
    const vt = s.vorlesetexte || [];
    if (!vt.length) { sprache.sage('Keine Vorlesetexte in dieser Kampfszene. Du kannst sie beim Bearbeiten der Kampfszene anlegen.'); return; }
    vorlesePos = (vorlesePos + 1) % vt.length;
    const t = vt[vorlesePos];
    sprache.sage(`Vorlesetext ${vorlesePos + 1} von ${vt.length}. ${t.titel ? t.titel + '. ' : ''}${t.inhalt || ''}`);
  }

  return scr;
}

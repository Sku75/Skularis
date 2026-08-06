/**
 * Skularistool — Meistertisch: Abenteuertexte.
 *
 * Einen Ordner waehlen und bestaetigen; der Ordner wird zu einem Menue mit den
 * txt-Dokumenten darin. Ein Dokument oeffnet sich zum Lesen, der Cursor steht
 * oben. Verlaesst man das Dokument und kehrt zurueck, steht der Fokus wieder an
 * derselben Zeile (je Datei gemerkt). Ein Lesezeichen je Datei laesst sich setzen
 * und wieder anspringen. Zeilenweises Lesen mit den Pfeiltasten, Pos1 und Ende
 * an Anfang und Ende, Bild auf und ab seitenweise (Standard-Navigation).
 */
import * as screen from '../ui/screen.js';
import * as sprache from '../sprache.js';
import { menuScreen } from '../ui/menu-screen.js';
import { getMeister, speichere } from './state.js';

const ipc = window.skularis?.ipc;

function ordnerName(pfad) { return String(pfad || '').split(/[\\/]/).filter(Boolean).pop() || pfad; }

function merker(a, pfad) {
  if (!a.textLesezeichen[pfad]) a.textLesezeichen[pfad] = { position: 0, lesezeichen: null };
  return a.textLesezeichen[pfad];
}

let _saveTimer = null;
function speichereBald() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => { _saveTimer = null; speichere(); }, 1500);
}

/**
 * Abenteuertexte-Leser. `slot` erlaubt zwei UNABHAENGIGE Leser (F7 und F8): jeder
 * merkt sich seinen EIGENEN Ordner (textOrdner bzw. textOrdner2), sodass man zwei
 * verschiedene Ordner gleichzeitig offen hat und zwischen ihnen wechselt. Die
 * Lesezeichen stehen pro Datei-Pfad und kollidieren nicht (verschiedene Ordner).
 */
export function texteScreen(slot = 1) {
  const ordnerKey = slot === 2 ? 'textOrdner2' : 'textOrdner';
  const scr = {
    title: slot === 2 ? 'Abenteuertexte (2)' : 'Abenteuertexte',
    _dateien: null,
    async ladeListe() {
      const a = getMeister();
      if (!a[ordnerKey]) { scr._dateien = []; return; }
      try { scr._dateien = await ipc.textDateienListe(a[ordnerKey]); }
      catch { scr._dateien = []; }
      screen.refresh();
    },
    build() {
      const a = getMeister();
      a.textLesezeichen = a.textLesezeichen || {};
      const items = [];

      if (a[ordnerKey] && Array.isArray(scr._dateien)) {
        for (const d of scr._dateien) {
          const m = a.textLesezeichen[d.pfad];
          const marke = m && (m.position || m.lesezeichen != null) ? ' (angefangen)' : '';
          items.push({
            label: `${d.name}${marke}`,
            hint: 'Enter oeffnet zum Lesen',
            onSelect: () => oeffneDokument(d),
          });
        }
      }

      // Ordner-Schaltflaeche IMMER ganz oben. Bei gewaehltem Ordner heisst sie
      // "Neuen Ordner waehlen oder aktualisieren": man kann denselben Ordner
      // erneut oder einen anderen waehlen; danach werden alle Texte neu von der
      // Platte gelesen (uebernimmt aussen geaenderte Dateien und neue/entfernte).
      const ordnerPunkt = {
        label: a[ordnerKey] ? `Neuen Ordner waehlen oder aktualisieren, aktuell ${ordnerName(a[ordnerKey])}` : 'Ordner waehlen und bestaetigen',
        hint: a[ordnerKey]
          ? 'denselben oder einen anderen Ordner waehlen; danach werden alle Texte neu geladen'
          : 'einen Ordner mit txt-Dokumenten waehlen (nur fuer dieses Text-Menue)',
        onSelect: async () => {
          const r = await ipc.ordnerWaehlen('Ordner mit Abenteuertexten waehlen');
          if (!r || !r.pfad) return;
          a[ordnerKey] = r.pfad;
          scr._dateien = null;
          await speichere();
          await scr.ladeListe();
          const n = (scr._dateien || []).length;
          sprache.sage(`Ordner ${ordnerName(a[ordnerKey])}, ${n} ${n === 1 ? 'Text' : 'Texte'} neu geladen.`);
        },
      };
      items.unshift(ordnerPunkt);

      return menuScreen({
        title: this.title,
        subtitle: a[ordnerKey] ? 'Oben den Ordner neu waehlen oder aktualisieren. Enter oeffnet ein Dokument. Escape zurueck.' : 'Erst einen Ordner waehlen und bestaetigen. Escape zurueck.',
        items,
        leer: 'Keine txt-Dokumente in diesem Ordner.',
        filter: (scr._dateien || []).length >= 10,
      }).build();
    },
    onShow() {
      const a = getMeister();
      if (a[ordnerKey] && scr._dateien === null) scr.ladeListe();
      else sprache.sage(scr.title + '.');
    },
  };
  return scr;
}

function oeffneDokument(d) {
  const a = getMeister();
  const m = merker(a, d.pfad);
  screen.push(dokumentScreen(d, m.position || 0));
}

function dokumentScreen(d, initialPos) {
  const state = { zeilen: null, letzteZeile: initialPos || 0, geladen: false, initialPos: initialPos || 0 };
  const scr = {
    title: d.name,
    async lade() {
      try { const r = await ipc.textDateiLaden(d.pfad); state.zeilen = String(r.inhalt || '').replace(/\r\n/g, '\n').split('\n'); }
      catch { state.zeilen = ['Datei konnte nicht gelesen werden.']; }
      state.geladen = true;
      // Nach dem Laden an die gemerkte Zeile springen (Cursor steht sonst oben).
      const ziel = state.initialPos > 0 && state.initialPos < (state.zeilen || []).length ? `#zeile-${state.initialPos}` : undefined;
      state.initialPos = 0;
      screen.refresh(ziel);
    },
    build() {
      const a = getMeister();
      const m = merker(a, d.pfad);
      const wrap = document.createElement('div');
      wrap.className = 'db-menu';
      // Lesemodus: kein Klickton bei hoch und runter (nur Anschlag am Rand), und
      // keine Rollen-Ansagen wie "Schalter" oder "Leerzeile".
      wrap.dataset.lesemodus = '1';

      const kopf = document.createElement('div');
      kopf.className = 'db-menu__title';
      kopf.setAttribute('aria-hidden', 'true');
      kopf.textContent = d.name;
      wrap.appendChild(kopf);

      // Zuerst der Text, damit der Fokus beim Oeffnen direkt in einer Zeile steht
      // und man beim Lesen keine Schaltflaechen hoert.
      const liste = document.createElement('div');
      liste.className = 'db-menu__list';
      if (!state.geladen) {
        const z = document.createElement('div');
        z.className = 'db-row'; z.tabIndex = 0; z.textContent = 'Wird geladen...';
        z.setAttribute('aria-label', 'Wird geladen.');
        liste.appendChild(z);
      } else {
        (state.zeilen || []).forEach((zeile, i) => {
          const row = document.createElement('div');
          row.className = 'db-row';
          row.id = `zeile-${i}`;
          row.dataset.zeile = String(i);
          // Leere Zeile: sichtbarer Abstand, aber NICHT fokussierbar und fuer den
          // Screenreader unsichtbar. So wird beim Durchlesen keine Leerzeile als
          // "Absatz" angesagt; sie wird still uebersprungen.
          if (!zeile || !zeile.trim()) {
            row.tabIndex = -1;
            row.setAttribute('aria-hidden', 'true');
            row.innerHTML = '&nbsp;';
            liste.appendChild(row);
            return;
          }
          row.tabIndex = 0;
          const istMarke = m.lesezeichen === i;
          const label = (istMarke ? 'Lesezeichen. ' : '') + zeile;
          row.textContent = (istMarke ? '▶ ' : '') + zeile;
          row.setAttribute('data-sr-label', label);
          row.setAttribute('aria-label', label);
          row.addEventListener('focusin', () => {
            state.letzteZeile = i;
            m.position = i;
            speichereBald();
          });
          liste.appendChild(row);
        });
      }
      wrap.appendChild(liste);

      // Lesezeichen-Schalter ganz unten, damit man sie beim Lesen nicht hoert.
      const setzen = document.createElement('button');
      setzen.type = 'button';
      setzen.className = 'db-btn db-menu__item';
      setzen.textContent = 'Lesezeichen hier setzen';
      setzen.setAttribute('aria-label', 'Lesezeichen bei der zuletzt gelesenen Zeile setzen');
      setzen.addEventListener('click', () => {
        m.lesezeichen = state.letzteZeile;
        speichere();
        sprache.sage(`Lesezeichen gesetzt bei Zeile ${state.letzteZeile + 1}.`);
      });
      wrap.appendChild(setzen);

      if (m.lesezeichen != null) {
        const springen = document.createElement('button');
        springen.type = 'button';
        springen.className = 'db-btn db-menu__item';
        springen.textContent = `Zum Lesezeichen springen, Zeile ${m.lesezeichen + 1}`;
        springen.setAttribute('aria-label', `Zum Lesezeichen springen, Zeile ${m.lesezeichen + 1}`);
        springen.addEventListener('click', () => { screen.refresh(`#zeile-${m.lesezeichen}`); });
        wrap.appendChild(springen);
      }

      return wrap;
    },
    onShow() {
      if (!state.geladen) scr.lade();
    },
    onBack() { speichere(); return true; },
  };
  return scr;
}

/**
 * Skularis — Standard-Rahmen einer Seite der assistierten Charaktererstellung.
 *
 * Jede Seite ist gleich aufgebaut, damit die Bedienung überall dieselbe bleibt.
 * Die Reihenfolge ist zugleich die Reihenfolge der Pfeil-Navigation:
 *
 *   1. Überschrift          hier landet der Fokus beim Öffnen
 *   2. Info                 der erklärende Text (Vollinfo per Strg und I)
 *   3. ein Schritt zurück
 *   4. ein Schritt vor
 *   5. Seite zurücksetzen
 *   6. Filter               nur wenn die Seite eine lange Liste hat
 *   7. Inhalt der Seite     Auswahlliste, Eingabefelder, Wertzeilen ...
 *
 * Die Eingaben einer Seite werden beim Seitenwechsel gespeichert: vor dem
 * Weiter- oder Zurückgehen ruft der Rahmen uebernehmen() der Seite auf.
 */

import * as screen from '../ui/screen.js';
import * as sounds from '../sounds.js';
import * as sprache from '../sprache.js';
import { infoZeile, verbindeDetail } from './widgets.js';
import { jaNeinDialog } from '../ui/dialog.js';

/**
 * @param {object} o
 * @param {string}   o.titel          Überschrift der Seite
 * @param {number}   o.schritt        Nummer des Schritts (1-basiert)
 * @param {number}   o.gesamt         Gesamtzahl der Schritte
 * @param {string}   o.info           kurzer Erklärtext für das Info-Feld
 * @param {string}  [o.infoDetail]    ausführlicher Text (Shift+Pfeil-runter, Strg+I)
 * @param {boolean} [o.filter]        Filterfeld anbieten
 * @param {string}  [o.filterLabel]   Beschriftung des Filterfelds
 * @param {(box:HTMLElement, filter:string) => void} o.inhalt
 * @param {() => void}   [o.uebernehmen]     Eingaben in den Charakter schreiben
 * @param {() => void}   [o.zuruecksetzen]   Seite auf den Standard zurücksetzen
 * @param {() => string} [o.pruefe]          Fehlertext, falls Weiter nicht erlaubt ist
 * @param {() => void}   o.onZurueck
 * @param {() => void}   o.onVor
 * @param {string}  [o.vorLabel]      abweichende Beschriftung für "ein Schritt vor"
 * @param {() => Promise<boolean>} [o.onBack]  Escape-Wächter
 */
export function assistentSeite(o) {
  let filterText = '';

  const seite = {
    title: `Assistierte Charaktererstellung, Schritt ${o.schritt} von ${o.gesamt}`,
    onBack: o.onBack,

    build() {
      const wrap = document.createElement('div');
      wrap.className = 'db-menu ed-bereich';

      // 1. Überschrift — fokussierbar, damit der Fokus hier landet und NVDA sie liest.
      const h = document.createElement('div');
      h.className = 'db-row ed-ueberschrift';
      h.tabIndex = 0;
      h.textContent = o.titel;
      h.setAttribute('data-sr-label', o.titel);
      h.dataset.srValue = o.titel;
      h.setAttribute('aria-label', o.titel);
      h.__detail = `Schritt ${o.schritt} von ${o.gesamt} der assistierten Charaktererstellung.`;
      wrap.appendChild(h);

      // 2. Info
      wrap.appendChild(infoZeile(o.info, o.infoDetail || o.info));

      // 3. + 4. Schrittweise Navigation
      const navKnopf = (label, hint, detail, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'db-btn ed-aktion';
        b.textContent = label;
        b.setAttribute('aria-label', hint ? `${label}. ${hint}` : label);
        if (detail !== undefined) b.__detail = detail;
        b.addEventListener('click', onClick);
        wrap.appendChild(b);
        return b;
      };

      navKnopf('ein Schritt zurück', 'zur vorigen Seite', 'Speichert diese Seite und geht eine Seite zurück.', () => {
        if (o.uebernehmen) o.uebernehmen();
        sounds.playClick();
        o.onZurueck();
      });

      navKnopf(o.vorLabel || 'ein Schritt vor', 'zur nächsten Seite', 'Speichert diese Seite und geht eine Seite weiter.', () => {
        if (o.uebernehmen) o.uebernehmen();
        const fehler = o.pruefe ? o.pruefe() : '';
        if (fehler) { sounds.playError(); sprache.sage(fehler); return; }
        sounds.playClick();
        o.onVor();
      });

      // 5. Seite zurücksetzen
      if (o.zuruecksetzen) {
        navKnopf('Seite zurücksetzen', 'Eingaben dieser Seite verwerfen',
          'Setzt nur diese Seite auf den Standard zurück. Es wird vorher nachgefragt.', async () => {
            const ja = await jaNeinDialog({
              titel: 'Seite zurücksetzen',
              frage: `Die Seite ${o.titel} wirklich zurücksetzen?`,
              jaLabel: 'Zurücksetzen', neinLabel: 'Behalten',
            });
            if (!ja) return;
            o.zuruecksetzen();
            filterText = '';
            screen.refresh();
            sprache.sage(`${o.titel} zurückgesetzt.`);
          });
      }

      // 6. Filterfeld
      const box = document.createElement('div');
      box.className = 'as-inhalt';

      const zeichneInhalt = () => {
        box.innerHTML = '';
        o.inhalt(box, filterText.trim().toLowerCase());
      };

      if (o.filter) {
        const feld = document.createElement('div');
        feld.className = 'db-row ed-feld';
        const label = document.createElement('label');
        label.className = 'ed-feld__label';
        label.setAttribute('for', 'as-filter');
        label.textContent = o.filterLabel || 'Filtern';
        const input = document.createElement('input');
        input.className = 'db-input';
        input.id = 'as-filter';
        input.type = 'text';
        input.autocomplete = 'off';
        input.value = filterText;
        input.setAttribute('aria-label', `${o.filterLabel || 'Filtern'}, Suchbegriff eingeben, dann Pfeil runter in die Liste`);
        input.addEventListener('input', () => {
          filterText = input.value;
          zeichneInhalt();
          const treffer = box.querySelectorAll('.db-menu__item, .ed-aktion').length;
          sprache.sageZusatz(`${treffer} Treffer.`);
        });
        feld.appendChild(label);
        feld.appendChild(input);
        wrap.appendChild(feld);
      }

      // 7. Inhalt
      zeichneInhalt();
      wrap.appendChild(box);

      verbindeDetail(wrap);
      return wrap;
    },
  };

  return seite;
}

/**
 * Ein Listen-Schalter für den Inhaltsbereich einer Assistenten-Seite.
 * Gleiche Optik und Ansage wie im Standard-Menü (menu-screen).
 */
export function listenSchalter({ label, hint, detail, gewaehlt, onSelect }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'db-btn db-menu__item' + (gewaehlt ? ' db-menu__item--gewaehlt' : '');

  const text = document.createElement('span');
  text.className = 'db-menu__label';
  text.textContent = gewaehlt ? `${label}, gewählt` : label;
  b.appendChild(text);

  if (hint) {
    const h = document.createElement('span');
    h.className = 'db-menu__hint';
    h.textContent = hint;
    b.appendChild(h);
  }
  b.setAttribute('aria-label', [gewaehlt ? `${label}, gewählt` : label, hint].filter(Boolean).join('. '));
  if (detail !== undefined) b.__detail = detail;

  b.addEventListener('click', () => { sounds.playClick(); onSelect(); });
  return b;
}

/**
 * Ein beschriftetes Textfeld für den Inhaltsbereich (Aussehen, Eigenheiten).
 * Mit typ 'number' entsteht ein Zahlenfeld (etwa für Erfahrungspunkte).
 */
export function textFeld({ label, id, wert = '', mehrzeilig = false, hint, typ = 'text', min }) {
  const box = document.createElement('div');
  box.className = 'db-row ed-feld';

  const l = document.createElement('label');
  l.className = 'ed-feld__label';
  l.setAttribute('for', id);
  l.textContent = label;
  box.appendChild(l);

  const input = document.createElement(mehrzeilig ? 'textarea' : 'input');
  input.className = mehrzeilig ? 'db-textarea' : 'db-input';
  input.id = id;
  if (!mehrzeilig) input.type = typ;
  if (typ === 'number') input.inputMode = 'numeric';
  if (min !== undefined) input.min = String(min);
  if (mehrzeilig) input.rows = 2;
  input.value = wert;
  input.setAttribute('aria-label', hint ? `${label}, ${hint}` : label);
  box.appendChild(input);

  box.__eingabe = input;
  return box;
}

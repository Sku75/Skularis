/**
 * Skularistool — Menü-Bildschirm-Helfer (Auswahlliste mit Detail und Filter).
 *
 * Standard-Muster fürs ganze Programm:
 * - vertikale Liste großer Schalter, ein Fokus, Pfeil-Navigation, Einfachklick wählt
 * - Titel/Untertitel nur visuell (aria-hidden), Ansage macht das Bildschirm-System
 * - Detailbereich unter der Liste: für Sehende sichtbar, für Blinde per aria-hidden
 *   aus der Navigation genommen; aktualisiert sich beim Fokuswechsel
 * - jeder Eintrag trägt seine Vollinfo (item.detail) auf dem Schalter (__detailText);
 *   Shift+Pfeil-runter und Strg+I lesen sie (siehe app.js)
 * - sichtbarer Zurück-Schalter (oben links per CSS, im Fokus zuletzt), Escape gleich
 * - lange Listen (oder opts.filter) bekommen oben "Filtern": Eingabetaste, Suchbegriff
 *   eintippen, Eingabetaste, danach zeigt die Liste nur die Treffer
 */

import * as sounds from '../sounds.js';
import * as sprache from '../sprache.js';
import * as screen from './screen.js';
import { textDialog } from './dialog.js';
import { alsText } from '../core/infotext.js';

const FILTER_AB = 10; // ab so vielen Einträgen automatisch Filter anbieten

function resolveDetail(b) {
  if (b.__detailText !== undefined) return Promise.resolve(b.__detailText);
  // Ein Detail kann String oder strukturierte Zeilenliste sein; die sichtbare
  // Detailleiste zeigt beides als Text.
  const fin = (t) => { b.__detailText = alsText(t); return b.__detailText; };
  const d = b.__detail;
  if (typeof d === 'function') {
    try { return Promise.resolve(d()).then(fin).catch(() => fin('')); }
    catch { return Promise.resolve(fin('')); }
  }
  return Promise.resolve(fin(d));
}

export function menuScreen(opts) {
  const alleItems = opts.items || [];
  // opts.filter: true erzwingt den Filter, false schaltet ihn ab (feste Menüs
  // wie der Editor-Hub sollen keinen bekommen), sonst ab FILTER_AB Einträgen.
  const brauchtFilter = opts.filter === false ? false : (opts.filter || alleItems.length >= FILTER_AB);

  const obj = {
    title: opts.title,
    build() {
      // Der Filter-Suchbegriff lebt am dauerhaften Bildschirm-Objekt, NICHT in
      // einer Closure: Wrapper wie auswahlScreen und die Editor-Bereiche bauen
      // menuScreen bei jedem screen.refresh() neu auf; eine lokale Variable
      // spraenge dabei jedes Mal auf leer zurueck — der Filter griffe nie.
      // owner wird bewusst erst HIER (im build) gelesen: dann ist es in beiden
      // Mustern der stabile Bildschirm — bei Wrappern der Wrapper, bei direkt
      // gepushten menuScreens dieses obj selbst. So ueberlebt der Suchbegriff
      // jeden refresh und startet beim Neuoeffnen frisch.
      const owner = screen.current();
      const getFilter = () => (owner && owner.__menuFilter) || '';
      const setFilter = (v) => { if (owner) owner.__menuFilter = v; };
      const filterText = getFilter();
      const q = filterText.toLowerCase();
      const sichtbar = q ? alleItems.filter(it => it.label.toLowerCase().includes(q)) : alleItems;
      obj.title = filterText
        ? `${opts.title}, Filter ${filterText}, ${sichtbar.length} Treffer`
        : opts.title;
      // Den angesagten Bildschirmtitel mitziehen, damit der Screenreader die
      // Trefferzahl hoert. Der Wrapper setzt seinen Titel vor unserem Aufbau.
      if (owner && owner !== obj) owner.title = obj.title;

      const wrap = document.createElement('div');
      wrap.className = 'db-menu';

      const h = document.createElement('div');
      h.className = 'db-menu__title';
      h.setAttribute('aria-hidden', 'true');
      h.textContent = obj.title;
      wrap.appendChild(h);

      if (opts.subtitle) {
        const p = document.createElement('p');
        p.className = 'db-menu__sub';
        p.setAttribute('aria-hidden', 'true');
        p.textContent = opts.subtitle;
        wrap.appendChild(p);
      }

      const list = document.createElement('div');
      list.className = 'db-menu__list';
      // Pfeil links/rechts springt in dieser Liste nur zu den verfügbaren
      // (nicht gesperrten) Einträgen — siehe navigation.js.
      if (opts.sprungVerfuegbar) list.dataset.sprungVerfuegbar = '1';

      const filtern = async () => {
        const eingabe = await textDialog({ titel: 'Filtern', label: 'Suchbegriff eingeben, dann Eingabetaste' });
        if (eingabe === null) return;
        setFilter(eingabe.trim());
        sounds.playClick();
        screen.refresh();
      };

      // Reihenfolge: ungefiltert steht "Filtern" oben; gefiltert stehen die
      // Treffer oben und die Filter-Schalter unten.
      const renderItems = [];
      if (brauchtFilter && !filterText) {
        renderItems.push({ label: 'Filtern', hint: 'Liste durchsuchen', detail: 'Eingabetaste, dann Suchbegriff eingeben.', onSelect: filtern });
      }
      for (const it of sichtbar) renderItems.push(it);
      if (brauchtFilter && filterText) {
        renderItems.push({ label: 'Filter aufheben', hint: `zeigt wieder alle ${alleItems.length}`, onSelect: () => { setFilter(''); sounds.playClick(); screen.refresh(); } });
        renderItems.push({ label: 'Filter ändern', hint: 'neuen Suchbegriff eingeben', onSelect: filtern });
      }

      if (renderItems.length === 0 && opts.leer) {
        const leer = document.createElement('div');
        leer.className = 'db-menu__empty';
        leer.tabIndex = 0;
        leer.setAttribute('data-sr-label', opts.leer);
        leer.setAttribute('aria-label', opts.leer);
        leer.textContent = opts.leer;
        list.appendChild(leer);
      } else if (sichtbar.length === 0 && filterText) {
        const leer = document.createElement('div');
        leer.className = 'db-menu__empty';
        leer.tabIndex = 0;
        leer.setAttribute('data-sr-label', 'Keine Treffer.');
        leer.setAttribute('aria-label', 'Keine Treffer.');
        leer.textContent = 'Keine Treffer.';
        list.appendChild(leer);
      }

      for (const it of renderItems) {
        const b = document.createElement('button');
        b.className = 'db-btn db-menu__item';
        b.type = 'button';
        if (it.id) b.id = it.id;
        if (it.klasse) b.classList.add(it.klasse);
        if (it.disabled) b.disabled = true;
        // Überschrift-Zeilen (Charakterbogen): mit Strg und Pfeil anspringbar.
        if (it.ueberschrift) { b.classList.add('db-menu__ueberschrift'); b.dataset.ueberschrift = '1'; }
        // Kapitel-Zeilen (Regeldokument): zusätzlich mit Strg und Bild auf/ab
        // anspringbar. Zählen auch als Überschrift, damit Strg und Pfeil hier hält.
        if (it.kapitel) { b.classList.add('db-menu__kapitel'); b.dataset.ueberschrift = '1'; b.dataset.kapitel = '1'; }

        // Ergebnisfeld rechts in der Zeile, z. B. für den Würfelwurf. Für
        // Sehende steht das Ergebnis damit direkt neben dem Schalter; für den
        // Screenreader steckt es in der Beschriftung, deshalb aria-hidden.
        if (it.ergebnisId) {
          const erg = document.createElement('span');
          erg.className = 'db-menu__ergebnis';
          erg.dataset.ergebnis = it.ergebnisId;
          erg.setAttribute('aria-hidden', 'true');
          b.appendChild(erg);
          b.dataset.ergebnisZiel = it.ergebnisId;
        }

        const label = document.createElement('span');
        label.className = 'db-menu__label';
        label.textContent = it.label;
        b.appendChild(label);

        if (it.hint) {
          const hint = document.createElement('span');
          hint.className = 'db-menu__hint';
          hint.textContent = it.hint;
          // Der Hinweis ist nur fuer Sehende sichtbar; NVDA liest beim Fokus nur
          // das kurze Label. Der Hinweis steckt im Detail (Shift+Pfeil / Strg+I).
          hint.setAttribute('aria-hidden', 'true');
          b.appendChild(hint);
        }
        // Kurze Fokus-Ansage: nur das Label, damit die Sprachausgabe nicht bei
        // jeder Zeile den ganzen Hinweis mitplappert. Details kommen auf Abruf.
        b.setAttribute('aria-label', it.label);

        b.__detail = (it.detail !== undefined) ? it.detail : (it.hint || '');
        b.__item = it; // fuer Sondertasten wie Strg und Eingabetaste

        b.addEventListener('click', () => {
          if (it.disabled) { sounds.playError(); return; }
          sounds.playClick();
          try { it.onSelect(); } catch (e) { console.error('Menü-Aktion:', e); }
        });

        list.appendChild(b);
      }

      wrap.appendChild(list);

      const detail = document.createElement('div');
      detail.className = 'ed-detail';
      detail.setAttribute('aria-hidden', 'true');
      wrap.appendChild(detail);

      list.addEventListener('focusin', (e) => {
        const b = e.target.closest('.db-menu__item');
        if (!b) { detail.textContent = ''; return; }
        resolveDetail(b).then((t) => { if (document.activeElement === b) detail.textContent = t; });
      });

      // Strg und Eingabetaste: Sonderaktion eines Eintrags (z. B. Vorhoeren im
      // Audio-Bereich). Nur wenn der Eintrag ein onCtrlEnter anbietet.
      list.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !e.ctrlKey) return;
        const b = e.target.closest('.db-menu__item');
        if (!b || !b.__item || typeof b.__item.onCtrlEnter !== 'function') return;
        e.preventDefault();
        e.stopPropagation();
        try { b.__item.onCtrlEnter(); } catch (err) { console.error('Strg-Eingabe-Aktion:', err); }
      });

      if (screen.tiefe() > 1) {
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'db-btn ed-zurueck';
        back.textContent = 'Zurück';
        back.setAttribute('aria-label', 'Zurück');
        // Aus der Pfeil-/Pos1-/Ende-Navigation nehmen, damit Ende auf den letzten
        // echten Menüpunkt springt. Für Sehende per Maus klickbar, Escape gleich.
        back.tabIndex = -1;
        back.addEventListener('click', () => { screen.zurueck(); });
        wrap.appendChild(back);
      }

      return wrap;
    },
  };
  // Optionale gesprochene Ansage beim Öffnen (z. B. Tastenhilfe für die
  // Vorteil-Liste). Ersetzt die schlichte Titel-Ansage.
  if (opts.ansage) obj.onShow = () => sprache.sage(opts.ansage);
  return obj;
}

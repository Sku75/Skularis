/**
 * Skularistool — barrierefreie Dialoge (Zahl-Eingabe, Text, Auswahl mit Filter).
 *
 * Wichtig: Ein per showModal() geöffneter <dialog> macht alles AUSSERHALB inert
 * (für Screenreader unsichtbar). Ansagen müssen daher über eine aria-live-Region
 * INNERHALB des Dialogs laufen (melde()). In der Auswahlliste wird zusätzlich der
 * echte Fokus auf den aktiven Eintrag gesetzt, damit NVDA ihn nativ vorliest.
 */

import * as sounds from '../sounds.js';

function baueDialog(ariaLabel) {
  const dlg = document.createElement('dialog');
  dlg.className = 'db-dialog';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-label', ariaLabel);
  const live = document.createElement('div');
  live.className = 'sr-only dlg-live';
  live.setAttribute('aria-live', 'assertive');
  live.setAttribute('aria-atomic', 'true');
  dlg.appendChild(live);
  return dlg;
}

/** Ansage über die dialog-interne Live-Region. */
function melde(dlg, text) {
  const el = dlg.querySelector('.dlg-live');
  if (!el || !text) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = String(text); });
}

/** Zahl-Eingabe. @returns Promise<number|null> */
export function zahlDialog({ titel, label, wert = 0, min = -100000, max = 100000 }) {
  return new Promise((resolve) => {
    sounds.playClick();
    const dlg = baueDialog(titel);
    dlg.insertAdjacentHTML('beforeend', `
      <div class="db-dialog__header"><span class="db-dialog__title">${titel}</span></div>
      <div class="db-dialog__body">
        <label class="db-dialog__label" for="dlg-zahl">${label}</label>
        <input id="dlg-zahl" class="db-input" type="number" inputmode="numeric" value="${wert}" aria-label="${label}">
      </div>
      <div class="db-dialog__footer">
        <button class="db-btn db-btn--primary" id="dlg-ok">OK</button>
        <button class="db-btn" id="dlg-ab">Abbrechen</button>
      </div>`);
    document.body.appendChild(dlg);
    const input = dlg.querySelector('#dlg-zahl');
    const fertig = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    const ok = () => {
      let v = parseInt(input.value, 10);
      if (Number.isNaN(v)) v = 0;
      fertig(Math.max(min, Math.min(max, v)));
    };
    dlg.querySelector('#dlg-ok').addEventListener('click', ok);
    dlg.querySelector('#dlg-ab').addEventListener('click', () => fertig(null));
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); ok(); }
      else if (e.key === 'Escape') { e.preventDefault(); fertig(null); }
    });
    dlg.showModal();
    input.focus(); input.select();
    melde(dlg, `${titel}. ${label}. Zahl eingeben, Eingabetaste bestätigt.`);
  });
}

/**
 * Erschwernis einstellen mit Pfeiltasten. Pfeil hoch erschwert (Wert steigt,
 * wirkt als Minus auf die Probe), Pfeil runter erleichtert (Wert sinkt, wirkt
 * als Plus). Eingabetaste bestätigt, Escape bricht ab.
 * @returns Promise<number|null>  positiv = Erschwernis, negativ = Erleichterung
 */
export function erschwernisDialog({ titel = 'Erschwernis', wert = 0 }) {
  return new Promise((resolve) => {
    sounds.playClick();
    const dlg = baueDialog(titel);
    dlg.insertAdjacentHTML('beforeend', `
      <div class="db-dialog__header"><span class="db-dialog__title">${titel} einstellen</span></div>
      <div class="db-dialog__body">
        <p class="db-dialog__label">Pfeil hoch: Erschwernis. Pfeil runter: Erleichterung. Eingabetaste bestätigt.</p>
        <div id="dlg-ersch" class="db-input" tabindex="0" role="spinbutton"></div>
      </div>
      <div class="db-dialog__footer">
        <button class="db-btn db-btn--primary" id="dlg-ok">OK</button>
        <button class="db-btn" id="dlg-ab">Abbrechen</button>
      </div>`);
    document.body.appendChild(dlg);
    let v = wert | 0;
    const anzeige = dlg.querySelector('#dlg-ersch');
    const text = () => (v > 0 ? `${v} erschwert, minus ${v}` : (v < 0 ? `${-v} erleichtert, plus ${-v}` : 'keine, null'));
    const zeige = () => { anzeige.textContent = text(); anzeige.setAttribute('aria-label', text()); };
    const fertig = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    dlg.querySelector('#dlg-ok').addEventListener('click', () => fertig(v));
    dlg.querySelector('#dlg-ab').addEventListener('click', () => fertig(null));
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); v = Math.min(100, v + 1); zeige(); melde(dlg, text()); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); v = Math.max(-100, v - 1); zeige(); melde(dlg, text()); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fertig(v); }
      else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); fertig(null); }
    });
    dlg.showModal();
    anzeige.focus();
    zeige();
    melde(dlg, `${titel} einstellen. Pfeil hoch erschwert, Pfeil runter erleichtert. Aktuell ${text()}. Eingabetaste bestätigt, Escape bricht ab.`);
  });
}

/**
 * Spinner-Auswahl: durch eine Liste fester Optionen blaettern (Pfeil runter =
 * naechste, hoch = vorige), Eingabetaste bestaetigt, Escape/Ruecktaste bricht ab.
 * @returns Promise<any|null> die gewaehlte Option oder null
 */
export function spinnerDialog({ titel, optionen, index = 0, format }) {
  return new Promise((resolve) => {
    sounds.playClick();
    const dlg = baueDialog(titel);
    const fmt = format || ((v) => String(v));
    dlg.insertAdjacentHTML('beforeend', `
      <div class="db-dialog__header"><span class="db-dialog__title">${titel}</span></div>
      <div class="db-dialog__body">
        <p class="db-dialog__label">Pfeil runter und hoch waehlt. Eingabetaste bestätigt.</p>
        <div id="dlg-spin" class="db-input" tabindex="0" role="spinbutton"></div>
      </div>
      <div class="db-dialog__footer">
        <button class="db-btn db-btn--primary" id="dlg-ok">OK</button>
        <button class="db-btn" id="dlg-ab">Abbrechen</button>
      </div>`);
    document.body.appendChild(dlg);
    let i = Math.max(0, Math.min(optionen.length - 1, index | 0));
    const anzeige = dlg.querySelector('#dlg-spin');
    const text = () => fmt(optionen[i]);
    const zeige = () => { anzeige.textContent = text(); anzeige.setAttribute('aria-label', text()); };
    const fertig = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    dlg.querySelector('#dlg-ok').addEventListener('click', () => fertig(optionen[i]));
    dlg.querySelector('#dlg-ab').addEventListener('click', () => fertig(null));
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); i = Math.min(optionen.length - 1, i + 1); zeige(); melde(dlg, text()); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); i = Math.max(0, i - 1); zeige(); melde(dlg, text()); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fertig(optionen[i]); }
      else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); fertig(null); }
    });
    dlg.showModal();
    anzeige.focus();
    zeige();
    melde(dlg, `${titel}. Pfeil runter und hoch waehlt. Aktuell ${text()}. Eingabetaste bestätigt, Escape bricht ab.`);
  });
}

/**
 * Text-Eingabe. @returns Promise<string|null>
 * @param {boolean} [mehrzeilig]  grosses, dokumentartiges Feld (Textarea). Dann
 *   speichert die Eingabetaste wie gewohnt, und Steuerung und Eingabetaste macht
 *   einen Zeilenumbruch. Fuer Fliesstext (Tagebuch, Notizen, Vorlesetexte usw.).
 */
export function textDialog({ titel, label, wert = '', mehrzeilig = false }) {
  return new Promise((resolve) => {
    sounds.playClick();
    const dlg = baueDialog(titel);
    const feld = mehrzeilig
      ? `<textarea id="dlg-text" class="db-input db-input--mehrzeilig" rows="8" aria-label="${label}"></textarea>`
      : `<input id="dlg-text" class="db-input" type="text" aria-label="${label}">`;
    dlg.insertAdjacentHTML('beforeend', `
      <div class="db-dialog__header"><span class="db-dialog__title">${titel}</span></div>
      <div class="db-dialog__body">
        <label class="db-dialog__label" for="dlg-text">${label}</label>
        ${feld}
      </div>
      <div class="db-dialog__footer">
        <button class="db-btn db-btn--primary" id="dlg-ok">OK</button>
        <button class="db-btn" id="dlg-ab">Abbrechen</button>
      </div>`);
    document.body.appendChild(dlg);
    const input = dlg.querySelector('#dlg-text');
    input.value = String(wert); // sicher setzen (kein HTML-Escaping noetig)
    const fertig = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    dlg.querySelector('#dlg-ok').addEventListener('click', () => fertig(input.value));
    dlg.querySelector('#dlg-ab').addEventListener('click', () => fertig(null));
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fertig(null); return; }
      if (e.key === 'Enter') {
        if (mehrzeilig && (e.ctrlKey || e.metaKey)) {
          // Steuerung und Eingabetaste: Zeilenumbruch an der Cursorstelle einfuegen.
          e.preventDefault(); e.stopPropagation();
          const s = input.selectionStart, en = input.selectionEnd;
          input.value = input.value.slice(0, s) + '\n' + input.value.slice(en);
          input.selectionStart = input.selectionEnd = s + 1;
          return;
        }
        // Eingabetaste speichert (auch im Mehrzeilenfeld).
        e.preventDefault(); fertig(input.value);
      }
    });
    dlg.showModal();
    input.focus();
    // Einzeilig: alles markieren (schnelles Ueberschreiben). Mehrzeilig: Cursor
    // ans Ende, damit man den vorhandenen Text weiterschreiben kann.
    if (mehrzeilig) { const n = input.value.length; try { input.setSelectionRange(n, n); } catch { /* egal */ } }
    else input.select();
    melde(dlg, mehrzeilig
      ? `${titel}. ${label}. Mehrere Zeilen moeglich. Eingabetaste speichert, Steuerung und Eingabetaste macht einen Zeilenumbruch.`
      : `${titel}. ${label}.`);
  });
}

/**
 * Ja/Nein-Bestätigung. @returns Promise<boolean>
 * Eingabetaste bestätigt (Ja), Escape bricht ab (Nein).
 */
export function jaNeinDialog({ titel, frage, jaLabel = 'Ja', neinLabel = 'Nein' }) {
  return new Promise((resolve) => {
    sounds.playClick();
    const dlg = baueDialog(titel);
    // Der Fragetext ist fokussierbar (tabindex 0), damit man ihn mit Tab und den
    // Pfeiltasten erreicht und der Screenreader ihn vorliest — nicht nur Ja/Nein.
    dlg.insertAdjacentHTML('beforeend', `
      <div class="db-dialog__header"><span class="db-dialog__title">${titel}</span></div>
      <div class="db-dialog__body">
        <p class="db-dialog__label" id="dlg-frage" tabindex="0" role="note">${frage}</p>
      </div>
      <div class="db-dialog__footer">
        <button class="db-btn db-btn--primary" id="dlg-ja">${jaLabel}</button>
        <button class="db-btn" id="dlg-nein">${neinLabel}</button>
      </div>`);
    document.body.appendChild(dlg);
    const fertig = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    const frageEl = dlg.querySelector('#dlg-frage');
    const ja = dlg.querySelector('#dlg-ja');
    const nein = dlg.querySelector('#dlg-nein');
    ja.addEventListener('click', () => fertig(true));
    nein.addEventListener('click', () => fertig(false));
    // Fokus-Ring: Fragetext, Ja, Nein — mit Pfeil hoch/runter erreichbar.
    const ring = [frageEl, ja, nein];
    let idx = 1; // Start auf Ja
    const fokus = (i) => { idx = (i + ring.length) % ring.length; ring[idx].focus(); };
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fertig(false); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); fokus(idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); fokus(idx - 1); }
      else if (e.key === 'Home' || e.key === 'PageUp') { e.preventDefault(); fokus(0); }
      else if (e.key === 'End' || e.key === 'PageDown') { e.preventDefault(); fokus(ring.length - 1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        // Enter bestätigt den fokussierten Knopf; auf dem Fragetext gilt Ja als Vorgabe.
        fertig(document.activeElement === nein ? false : true);
      }
    });
    dlg.showModal();
    ja.focus();
    melde(dlg, `${frage}. ${jaLabel} oder ${neinLabel}. Pfeil hoch liest die Frage, Eingabetaste bestätigt, Escape bricht ab.`);
  });
}

/**
 * Schlichte Knopf-Auswahl OHNE Filter: ein paar Möglichkeiten als Schalter,
 * Pfeil rauf/runter, Eingabetaste wählt, Escape bricht ab. Für kurze Auswahlen
 * (z. B. 1 oder 3 Würfel), wo ein Tippfilter nur stören würde.
 * @param {object} o
 * @param {string} o.titel
 * @param {string} [o.frage]
 * @param {Array<{label:string, wert:any}>} o.knoepfe
 * @returns Promise<any|null>  (der gewählte wert)
 */
export function knopfDialog({ titel, frage, knoepfe }) {
  return new Promise((resolve) => {
    sounds.playClick();
    const dlg = baueDialog(titel);
    // Grosse, farbige Text-Schaltflaechen. KEIN Abbrechen-Knopf — Escape geht
    // zurueck; Pfeile wechseln, Eingabetaste (oder Klick) waehlt.
    const knopfHtml = knoepfe
      .map((k, i) => `<button class="db-btn db-btn--primary db-dialog__wahl" data-i="${i}">${k.label}</button>`)
      .join('');
    // Der Fragetext ist fokussierbar (tabindex 0), damit man ihn mit Pfeil hoch
    // erreicht und der Screenreader ihn vorliest — nicht nur die Knöpfe.
    dlg.insertAdjacentHTML('beforeend', `
      <div class="db-dialog__header"><span class="db-dialog__title">${titel}</span></div>
      ${frage ? `<div class="db-dialog__body"><p class="db-dialog__label" id="dlg-frage" tabindex="0" role="note">${frage}</p></div>` : ''}
      <div class="db-dialog__footer db-dialog__footer--spalte">
        ${knopfHtml}
      </div>`);
    document.body.appendChild(dlg);
    const fertig = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    const knopfEls = Array.from(dlg.querySelectorAll('.db-dialog__wahl'));
    knopfEls.forEach((b) => b.addEventListener('click', () => fertig(knoepfe[+b.dataset.i].wert)));
    const frageEl = dlg.querySelector('#dlg-frage');
    // Fokus-Ring: erst der Fragetext (falls vorhanden), dann die Knöpfe.
    const ring = frageEl ? [frageEl, ...knopfEls] : knopfEls.slice();
    let idx = frageEl ? 1 : 0; // Start auf dem ersten Knopf
    const fokus = (i) => { idx = (i + ring.length) % ring.length; ring[idx].focus(); };
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fertig(null); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); fokus(idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); fokus(idx - 1); }
      else if (e.key === 'Home' || e.key === 'PageUp') { e.preventDefault(); fokus(0); }
      else if (e.key === 'End' || e.key === 'PageDown') { e.preventDefault(); fokus(ring.length - 1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const b = document.activeElement;
        if (b && b.dataset && b.dataset.i !== undefined) fertig(knoepfe[+b.dataset.i].wert);
        else { const erster = ring.findIndex(el => el.dataset && el.dataset.i !== undefined); if (erster >= 0) fokus(erster); } // vom Fragetext zum ersten Knopf
      }
    });
    dlg.showModal();
    fokus(idx);
    // Kurze Ansage: nur Titel/Frage — den fokussierten Knopf liest der
    // Screenreader selbst; die Bedienung (Pfeile, Eingabetaste, Escape) ist Standard.
    melde(dlg, `${titel}${frage ? '. ' + frage : ''}.`);
  });
}

/**
 * Einen Code (oder kurzen Wert) GROSS und umrahmt anzeigen — nicht mitten im Satz.
 * Die Code-Box ist fokussierbar; ihr aria-label spricht die Ziffern einzeln, damit
 * der Screenreader sie klar vorliest. Darunter ein Hinweis, dann OK.
 * @returns Promise<void>
 */
export function codeAnzeigeDialog({ titel = 'Code', code = '', hinweis = '' }) {
  return new Promise((resolve) => {
    sounds.playClick();
    const dlg = baueDialog(titel);
    const ziffernGesprochen = String(code).split('').join(' ');
    const boxStil = 'display:block;margin:0.6rem 0;padding:0.7rem 1rem;border:3px solid currentColor;'
      + 'border-radius:0.6rem;font-size:2.4rem;font-weight:800;letter-spacing:0.5rem;text-align:center;';
    dlg.insertAdjacentHTML('beforeend', `
      <div class="db-dialog__header"><span class="db-dialog__title">${titel}</span></div>
      <div class="db-dialog__body">
        <div id="dlg-code" class="db-dialog__code" tabindex="0" role="note" style="${boxStil}"></div>
        ${hinweis ? `<p class="db-dialog__label" id="dlg-hinweis" tabindex="0" role="note">${hinweis}</p>` : ''}
      </div>
      <div class="db-dialog__footer">
        <button class="db-btn db-btn--primary" id="dlg-ok">OK</button>
      </div>`);
    document.body.appendChild(dlg);
    const codeEl = dlg.querySelector('#dlg-code');
    codeEl.textContent = String(code);           // sicher setzen
    codeEl.setAttribute('aria-label', `Code ${ziffernGesprochen}`);
    const hinweisEl = dlg.querySelector('#dlg-hinweis');
    const ok = dlg.querySelector('#dlg-ok');
    const fertig = () => { dlg.close(); dlg.remove(); resolve(); };
    ok.addEventListener('click', fertig);
    const ring = [codeEl, hinweisEl, ok].filter(Boolean);
    let idx = 0;
    const fokus = (i) => { idx = (i + ring.length) % ring.length; ring[idx].focus(); };
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); fertig(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); fokus(idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); fokus(idx - 1); }
      else if (e.key === 'Home' || e.key === 'PageUp') { e.preventDefault(); fokus(0); }
      else if (e.key === 'End' || e.key === 'PageDown') { e.preventDefault(); fokus(ring.length - 1); }
    });
    dlg.showModal();
    codeEl.focus();
    melde(dlg, `${titel}. Code ${ziffernGesprochen}.${hinweis ? ' ' + hinweis : ''} Pfeiltasten lesen die Zeilen, Eingabetaste schließt.`);
  });
}

/**
 * Auswahl aus einer Liste, mit Tipp-Filter.
 * Fokus wandert auf die Einträge (NVDA liest sie nativ vor).
 * @param {object} o
 * @param {string} o.titel
 * @param {Array<{label:string, wert:any}>} o.eintraege
 * @returns Promise<any|null>  (der gewählte wert)
 */
export function auswahlDialog({ titel, eintraege }) {
  return new Promise((resolve) => {
    sounds.playClick();
    const dlg = baueDialog(titel);
    dlg.insertAdjacentHTML('beforeend', `
      <div class="db-dialog__header"><span class="db-dialog__title">${titel}</span></div>
      <div class="db-dialog__body">
        <label class="db-dialog__label" for="dlg-filter">Filter, tippen zum Suchen</label>
        <input id="dlg-filter" class="db-input" type="text" autocomplete="off" aria-label="Filter, tippen zum Suchen">
        <div id="dlg-liste" class="db-list" role="listbox" aria-label="${titel}"></div>
      </div>
      <div class="db-dialog__footer">
        <button class="db-btn" id="dlg-ab">Abbrechen</button>
      </div>`);
    document.body.appendChild(dlg);

    const filter = dlg.querySelector('#dlg-filter');
    const liste = dlg.querySelector('#dlg-liste');
    let gefiltert = [];
    let aktiv = -1;

    const fertig = (val) => { dlg.close(); dlg.remove(); resolve(val); };

    function zeichne() {
      const q = filter.value.trim().toLowerCase();
      gefiltert = q ? eintraege.filter(e => e.label.toLowerCase().includes(q)) : eintraege.slice();
      liste.innerHTML = '';
      gefiltert.forEach((e) => {
        const item = document.createElement('div');
        item.className = 'db-list__item';
        item.setAttribute('role', 'option');
        item.tabIndex = -1;
        item.textContent = e.label;
        item.addEventListener('click', () => fertig(e.wert));
        liste.appendChild(item);
      });
      aktiv = -1;
    }

    function items() { return liste.querySelectorAll('.db-list__item'); }

    function fokusItem(i) {
      const it = items();
      if (!it.length) return;
      aktiv = Math.max(0, Math.min(it.length - 1, i));
      it.forEach((el, idx) => el.classList.toggle('db-list__item--selected', idx === aktiv));
      it[aktiv].focus();
      it[aktiv].scrollIntoView({ block: 'nearest' });
    }

    filter.addEventListener('input', () => { zeichne(); melde(dlg, `${gefiltert.length} Treffer.`); });

    dlg.addEventListener('keydown', (e) => {
      const aufItem = document.activeElement && document.activeElement.classList.contains('db-list__item');
      if (e.key === 'Escape') { e.preventDefault(); fertig(null); }
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!aufItem) { if (items().length) fokusItem(0); else sounds.playError(); }
        else if (aktiv < items().length - 1) fokusItem(aktiv + 1);
        else sounds.playError();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (aufItem && aktiv > 0) fokusItem(aktiv - 1);
        else if (aufItem) { filter.focus(); }
        else sounds.playError();
      } else if (e.key === 'Home' || e.key === 'PageUp') {
        e.preventDefault();
        if (items().length) fokusItem(0); else sounds.playError();
      } else if (e.key === 'End' || e.key === 'PageDown') {
        e.preventDefault();
        if (items().length) fokusItem(items().length - 1); else sounds.playError();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const idx = Array.from(items()).indexOf(document.activeElement);
        if (idx >= 0 && gefiltert[idx]) fertig(gefiltert[idx].wert);
        else if (gefiltert.length) fertig(gefiltert[0].wert);
      }
    });
    dlg.querySelector('#dlg-ab').addEventListener('click', () => fertig(null));

    zeichne();
    dlg.showModal();
    filter.focus();
    melde(dlg, `${titel}. ${eintraege.length} Einträge. Tippen filtert, Pfeil runter geht in die Liste, Eingabetaste wählt.`);
  });
}

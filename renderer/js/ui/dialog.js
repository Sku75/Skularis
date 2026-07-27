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

/** Text-Eingabe. @returns Promise<string|null> */
export function textDialog({ titel, label, wert = '' }) {
  return new Promise((resolve) => {
    sounds.playClick();
    const dlg = baueDialog(titel);
    dlg.insertAdjacentHTML('beforeend', `
      <div class="db-dialog__header"><span class="db-dialog__title">${titel}</span></div>
      <div class="db-dialog__body">
        <label class="db-dialog__label" for="dlg-text">${label}</label>
        <input id="dlg-text" class="db-input" type="text" value="${String(wert).replace(/"/g, '&quot;')}" aria-label="${label}">
      </div>
      <div class="db-dialog__footer">
        <button class="db-btn db-btn--primary" id="dlg-ok">OK</button>
        <button class="db-btn" id="dlg-ab">Abbrechen</button>
      </div>`);
    document.body.appendChild(dlg);
    const input = dlg.querySelector('#dlg-text');
    const fertig = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    dlg.querySelector('#dlg-ok').addEventListener('click', () => fertig(input.value));
    dlg.querySelector('#dlg-ab').addEventListener('click', () => fertig(null));
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); fertig(input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); fertig(null); }
    });
    dlg.showModal();
    input.focus(); input.select();
    melde(dlg, `${titel}. ${label}.`);
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
    dlg.insertAdjacentHTML('beforeend', `
      <div class="db-dialog__header"><span class="db-dialog__title">${titel}</span></div>
      <div class="db-dialog__body">
        <p class="db-dialog__label">${frage}</p>
      </div>
      <div class="db-dialog__footer">
        <button class="db-btn db-btn--primary" id="dlg-ja">${jaLabel}</button>
        <button class="db-btn" id="dlg-nein">${neinLabel}</button>
      </div>`);
    document.body.appendChild(dlg);
    const fertig = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    const ja = dlg.querySelector('#dlg-ja');
    ja.addEventListener('click', () => fertig(true));
    dlg.querySelector('#dlg-nein').addEventListener('click', () => fertig(false));
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); fertig(true); }
      else if (e.key === 'Escape') { e.preventDefault(); fertig(false); }
    });
    dlg.showModal();
    ja.focus();
    melde(dlg, `${frage}. ${jaLabel} oder ${neinLabel}. Eingabetaste bestätigt, Escape bricht ab.`);
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

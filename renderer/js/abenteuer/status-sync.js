/**
 * Skularistool — F2-Live-Übertragung (Spielerseite).
 *
 * Sammelt den Charakterstatus (F2) des Spielers zu einem kleinen Schnappschuss und
 * schickt ihn über den Meisterpost-Datenkanal an den Meister. Aufgerufen beim
 * Verbinden und immer, wenn der Spieler einen Zähler (Wunden, Erschöpfung, AsP …)
 * verstellt. Der Meister zeigt den Stand nur an (read-only) und hört auf Änderungen.
 */
import { abgeleiteteWerte } from '../core/regeln.js';
import { getAbenteuer } from './state.js';
import * as post from '../net/post.js';

/** F2-Schnappschuss aus dem aktuellen Abenteuer bauen. */
export function sammleStatus(a) {
  if (!a || !a.charakter) return {};
  const w = abgeleiteteWerte(a.charakter);
  const res = a.ressourcen || {};
  const paar = (k) => (res[k] ? { aktuell: res[k].aktuell || 0, max: (res[k].max !== undefined ? res[k].max : null) } : null);
  const wu = res.Wunden ? (res.Wunden.aktuell || 0) : 0;
  const er = res.Erschoepfung ? (res.Erschoepfung.aktuell || 0) : 0;
  // Zauberspeicher des Magierstabs (geladene Zauber je Slot) mituebertragen.
  const zauberspeicher = Array.isArray(a.zauberspeicher)
    ? a.zauberspeicher.map(s => (s ? { name: s.name, qualitaet: s.qualitaet } : null))
    : [];
  return {
    einschraenkungen: wu + er,
    Wunden: paar('Wunden'), Erschoepfung: paar('Erschoepfung'),
    SchiP: paar('SchiP'), AsP: paar('AsP'), KaP: paar('KaP'), GuP: paar('GuP'),
    AstralspeicherStab: paar('AstralspeicherStab'), // Magierstab-Astralspeicher
    zauberspeicher,
    WS: w.WS, MR: w.MR, GS: w.GS, INI: w.INI, SB: w.SB, DH: w.DH, RS: w.RS, BE: w.BE,
  };
}

/** Wenn als Spieler verbunden: aktuellen F2-Stand senden. */
export function sendeStatusWennVerbunden() {
  try {
    if (post.rolle && post.rolle() === 'spieler' && post.istVerbunden()) {
      post.spielerStatus(sammleStatus(getAbenteuer()));
    }
  } catch { /* egal */ }
}

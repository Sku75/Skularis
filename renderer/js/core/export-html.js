/**
 * Skularistool — Charakter als lesbares, barrierefreies HTML-Blatt exportieren.
 */
import { abgeleiteteWerte, waffenwerteText } from './regeln.js';
import { BESCHREIBUNG_FELDER, eigenheitBuchstabe } from './character.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function vName(v) { return typeof v === 'string' ? v : v.name; }

export function exportHtml(char, db) {
  const w = abgeleiteteWerte(char);
  const finanzen = String(db.einstellungen['Finanzen'] || '').split(',').map(s => s.trim());

  const attrRows = db.attribute.map(a =>
    `<tr><th scope="row">${esc(a.anzeigename)} (${esc(a.name)})</th><td>${char.attribute[a.name] || 0}</td></tr>`
  ).join('');

  const abgRows = ['WS', 'MR', 'GS', 'SB', 'INI', 'DH', 'RS', 'BE', 'SchiP'].map(k =>
    `<tr><th scope="row">${k}</th><td>${w[k]}</td></tr>`).join('');

  const vorteile = (char.vorteile || []).map(v => {
    const n = vName(v);
    const komm = (typeof v === 'object' && v.kommentar) ? ` (${esc(v.kommentar)})` : '';
    return `<li>${esc(n)}${komm}</li>`;
  }).join('') || '<li>keine</li>';

  // Talente stehen in einer Liste am Charakter und erscheinen unter jeder
  // Fertigkeit, zu der sie gehören.
  const talenteVon = (fname) => (char.talente || [])
    .filter(n => (db.talentByName[n]?.fertigkeiten || []).includes(fname));

  const fertRows = Object.entries(char.fertigkeiten || {})
    .filter(([name, fe]) => fe.wert > 0 || talenteVon(name).length)
    .map(([name, fe]) => `<tr><th scope="row">${esc(name)}</th><td>${fe.wert}</td><td>${esc(talenteVon(name).join(', '))}</td></tr>`)
    .join('') || '<tr><td colspan="3">keine</td></tr>';

  const ufRows = Object.entries(char.uebernatuerlich || {})
    .map(([name, ue]) => `<tr><th scope="row">${esc(name)}</th><td>${ue.wert}</td><td>${esc(talenteVon(name).join(', '))}</td></tr>`)
    .join('');

  const freie = (char.freieFertigkeiten || []).filter(f => f.name)
    .map(f => `<li>${esc(f.name)} ${f.wert}</li>`).join('') || '<li>keine</li>';

  const waffen = (char.waffen || []).filter(x => x.name).map(x => `<li>${esc(x.name)}: ${esc(waffenwerteText(char, db, x))}</li>`).join('') || '<li>keine</li>';
  const ruestungen = (char.ruestungen || []).filter(x => x.name).map(x => `<li>${esc(x.name)} (RS ${esc(x.rs)}, BE ${x.be})</li>`).join('') || '<li>keine</li>';
  const gegenstaende = (char.ausruestung || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li>keine</li>';

  const statusse = String(db.einstellungen['Statusse'] || '').split(',').map(s => s.trim());

  const aussehenRows = BESCHREIBUNG_FELDER
    .filter(f => (char[f.key] || '').trim())
    .map(f => `<tr><th scope="row">${esc(f.label)}</th><td>${esc(char[f.key])}</td></tr>`)
    .join('');

  const aussehenZeilen = (char.aussehen || []).filter(z => (z || '').trim())
    .map(z => `<li>${esc(z)}</li>`).join('');

  const hintergrund = (char.hintergrund || []).filter(z => (z || '').trim())
    .map(z => `<li>${esc(z)}</li>`).join('');

  const eigenheiten = (char.eigenheiten || []).map((e, i) => {
    const teile = [`<strong>${eigenheitBuchstabe(i)}: ${esc(e.name)}</strong>`];
    if (e.positiv) teile.push(`<br>Positive Aspekte: ${esc(e.positiv)}`);
    if (e.negativ) teile.push(`<br>Negative Aspekte: ${esc(e.negativ)}`);
    return `<li>${teile.join('')}</li>`;
  }).join('');

  const frei = (char.erfahrung.gesamt || 0) - (char.erfahrung.ausgegeben || 0);

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<title>${esc(char.name || 'Charakter')} — Ilaris</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 1rem auto; padding: 0 1rem; line-height: 1.5; }
  h1 { margin-bottom: 0.2rem; }
  h2 { margin-top: 1.6rem; border-bottom: 2px solid #888; }
  table { border-collapse: collapse; margin: 0.5rem 0; }
  th, td { border: 1px solid #bbb; padding: 0.3rem 0.6rem; text-align: left; }
  .meta { color: #444; }
</style></head><body>
<h1>${esc(char.name || 'Unbenannter Charakter')}</h1>
<p class="meta">Spezies: ${esc(char.spezies || '—')} · Heimat: ${esc(char.heimat || '—')} · Status: ${esc(statusse[char.status] || 'Mittelschicht')} · Finanzen: ${esc(finanzen[char.finanzen] || 'Normal')}</p>
<p class="meta">Erfahrung: ${char.erfahrung.gesamt || 0} gesamt, ${char.erfahrung.ausgegeben || 0} ausgegeben, ${frei} frei</p>

${aussehenRows || aussehenZeilen ? `<h2>Aussehen</h2>${aussehenRows ? `<table><tbody>${aussehenRows}</tbody></table>` : ''}${aussehenZeilen ? `<ul>${aussehenZeilen}</ul>` : ''}` : ''}
${eigenheiten ? `<h2>Eigenheiten</h2><ul>${eigenheiten}</ul>` : ''}
${hintergrund ? `<h2>Familie, Hintergrund und Herkunft</h2><ul>${hintergrund}</ul>` : ''}

<h2>Attribute</h2><table><tbody>${attrRows}</tbody></table>
<h2>Abgeleitete Werte</h2><table><tbody>${abgRows}</tbody></table>
<h2>Vorteile</h2><ul>${vorteile}</ul>
<h2>Fertigkeiten und Talente</h2>
<table><thead><tr><th>Fertigkeit</th><th>Wert</th><th>Talente</th></tr></thead><tbody>${fertRows}</tbody></table>
${ufRows ? `<h2>Übernatürliches</h2><table><thead><tr><th>Fertigkeit</th><th>Wert</th><th>Zauber / Liturgien</th></tr></thead><tbody>${ufRows}</tbody></table>` : ''}
<h2>Freie Fertigkeiten</h2><ul>${freie}</ul>
<h2>Ausrüstung</h2>
<h3>Waffen</h3><ul>${waffen}</ul>
<h3>Rüstungen</h3><ul>${ruestungen}</ul>
<h3>Gegenstände</h3><ul>${gegenstaende}</ul>
<p class="meta">Erstellt mit Skularis 0.08 — Regelwerk Ilaris.</p>
</body></html>
`;
}

/**
 * Skularistool — Erschaffungspakete additiv anwenden (Spezies/Kultur/Profession).
 * Ein Paket ist ein geparster Sephrasto-<Charakter>. Reine Funktion, testbar.
 */

function vorteilName(v) { return typeof v === 'string' ? v : v.name; }

export function mergePaket(char, paket, kategorie, paketName) {
  char.waffen = char.waffen || [];
  char.ruestungen = char.ruestungen || [];
  char.freieFertigkeiten = char.freieFertigkeiten || [];

  // Attribute additiv
  for (const a of Object.keys(paket.attribute || {})) {
    char.attribute[a] = (char.attribute[a] || 0) + (paket.attribute[a] || 0);
  }

  // Vorteile (Duplikate vermeiden)
  const haben = new Set(char.vorteile.map(vorteilName));
  for (const v of paket.vorteile || []) {
    const n = vorteilName(v);
    if (!haben.has(n)) { char.vorteile.push(v); haben.add(n); }
  }

  // Profane Fertigkeiten: Werte addieren
  for (const [name, fe] of Object.entries(paket.fertigkeiten || {})) {
    if (!char.fertigkeiten[name]) char.fertigkeiten[name] = { wert: 0 };
    char.fertigkeiten[name].wert += fe.wert || 0;
  }

  // Übernatürliche Fertigkeiten: analog
  for (const [name, ue] of Object.entries(paket.uebernatuerlich || {})) {
    if (!char.uebernatuerlich[name]) char.uebernatuerlich[name] = { wert: 0 };
    char.uebernatuerlich[name].wert += ue.wert || 0;
  }

  // Talente: eine gemeinsame Liste, jedes Talent nur einmal
  char.talente = char.talente || [];
  for (const t of paket.talente || []) {
    if (!char.talente.includes(t)) char.talente.push(t);
  }

  // Freie Fertigkeiten
  for (const ff of paket.freieFertigkeiten || []) {
    if (!ff.name) {
      // namenlose Muttersprache-Platzhalter: nur einen behalten
      if (!char.freieFertigkeiten.some(x => !x.name)) char.freieFertigkeiten.push({ ...ff });
      continue;
    }
    const vorhanden = char.freieFertigkeiten.find(x => x.name === ff.name);
    if (vorhanden) vorhanden.wert = Math.max(vorhanden.wert, ff.wert || 0);
    else char.freieFertigkeiten.push({ ...ff });
  }

  // Talente mit variablen Kosten bringen ihren Preis und Kommentar mit.
  char.talentKosten = char.talentKosten || {};
  char.talentKommentar = char.talentKommentar || {};
  for (const [name, kosten] of Object.entries(paket.talentKosten || {})) {
    if (!(name in char.talentKosten)) char.talentKosten[name] = kosten;
  }
  for (const [name, text] of Object.entries(paket.talentKommentar || {})) {
    if (!(name in char.talentKommentar)) char.talentKommentar[name] = text;
  }

  // Gekaufte Energien additiv
  for (const k of ['AsP', 'KaP', 'GuP']) {
    if (paket.energien && paket.energien[k]) {
      char.energien[k] = char.energien[k] || { gekauft: 0 };
      char.energien[k].gekauft += paket.energien[k].gekauft || 0;
    }
  }

  // Meta. Kultur und Profession führt Sephrasto in BeschreibungDetails, deshalb
  // merken wir uns den Paketnamen und schreiben ihn beim Speichern dorthin.
  if (kategorie === 'Spezies' && paketName) char.spezies = paketName;
  if (kategorie === 'Kultur' && paketName) char.kultur = paketName;
  if (kategorie === 'Kultur' && paket.heimat) char.heimat = paket.heimat;
  if (kategorie === 'Profession' && paketName) char.profession = paketName;
}

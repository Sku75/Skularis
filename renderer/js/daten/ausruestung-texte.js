/**
 * Skularistool — Erklärungen zu Waffen und Rüstungen.
 *
 * Weder die Sephrasto-Datenbank noch der extrahierte Regeltext enthalten
 * Beschreibungen für Waffen oder Rüstungen (nur Spielwerte). Diese Datei
 * ergänzt kurze, Ilaris-treue Erklärungen je Waffengattung, je Schild und je
 * Rüstungszone sowie den Sinn der Werte, damit die Tooltips die Ausrüstung
 * verständlich machen. Reine Daten und Funktionen, in Node nutzbar.
 */

// Erklärung je Waffengattung (Talent der Waffe).
const GATTUNG = {
  'Einhandklingenwaffen': 'Einhändige Klingen wie Schwert, Säbel oder Degen. Vielseitig, gut zum Angreifen und Parieren.',
  'Zweihandklingenwaffen': 'Große Klingen, beidhändig geführt. Hoher Schaden, brauchen aber Platz und Kraft.',
  'Einhandhiebwaffen': 'Einhändige Wuchtwaffen wie Keule, Streitkolben oder Beil. Durchschlagend, oft gut gegen Rüstung.',
  'Zweihandhiebwaffen': 'Schwere beidhändige Wuchtwaffen wie Zweihandaxt oder Kriegshammer. Sehr hoher Schaden, aber langsam.',
  'Infanteriewaffen und Speere': 'Stangen- und Speerwaffen mit großer Reichweite. Gut, um Gegner auf Abstand zu halten.',
  'Handgemengewaffen': 'Kleine Waffen fürs Gedränge und den Nahkampf auf Tuchfühlung, etwa Dolch, Faustschild oder Schlagring. Gut zum Parieren.',
  'Unbewaffnet': 'Der Kampf mit bloßen Händen und Füßen, ohne Waffe.',
  'Bögen': 'Fernkampfwaffen. Sie brauchen eine Aktion Vorbereitung, treffen dafür auf Distanz.',
  'Armbrüste': 'Fernkampfwaffen mit hoher Durchschlagskraft, aber langem Nachladen.',
  'Kurze Wurfwaffen': 'Wurfwaffen wie Wurfmesser oder Wurfbeil für den schnellen Fernangriff auf kurze Distanz.',
  'Wurfspeere': 'Speere zum Werfen, für den Fernangriff auf mittlere Distanz.',
  'Schleudern': 'Einfache Fernwaffe, die Steine oder Bleikugeln verschießt.',
  'Diskusse': 'Wurfscheiben für den Fernkampf.',
  'Blasrohre': 'Lautlose Fernwaffe, verschießt kleine, oft vergiftete Pfeile.',
  'Reiten': 'Angriffe, die vom Rücken eines Reittiers geführt werden.',
  'Lanzenreiten': 'Die Lanze im Reiterangriff. Beim Ansturm richtet sie gewaltigen Schaden an.',
  'Schilde': 'Ein Schild. Sein Waffenmodifikator erhöht vor allem deine Verteidigung, im Schildkampf-Stil besonders stark.',
};

// Erklärung je Schild (Name ohne den Klammer-Zusatz).
const SCHILD = {
  'Buckler': 'Kleiner Faustschild. Wenig Verteidigungsbonus, dafür sehr hart und leicht zu führen.',
  'Bock': 'Kleiner, harter Parierschild, ähnlich dem Buckler, mit etwas mehr Schlagkraft.',
  'Holzschild': 'Mittelgroßer Schild. Guter Verteidigungsbonus bei brauchbarer Härte.',
  'Lederschild': 'Leichter Schild. Handlich, aber wenig widerstandsfähig.',
  'Großschild': 'Großer Schild. Bester Verteidigungsbonus, dafür weniger Schlagkraft und geringere Härte.',
};

const WERT_HINWEIS = 'Der Waffenmodifikator kommt auf Attacke und Verteidigung. '
  + 'Die Härte zeigt, wie viel die Waffe aushält, bevor sie beschädigt wird.';

/** Klartext-Erklärung einer Waffe: Gattung oder Schild plus Sinn der Werte. */
export function waffenErklaerung(name, talent) {
  const roh = String(name || '').replace(/\s*\(.*\)\s*$/, '').trim();
  const teile = [];
  if (SCHILD[roh]) teile.push(SCHILD[roh]);
  else if (GATTUNG[talent]) teile.push(GATTUNG[talent]);
  teile.push(WERT_HINWEIS);
  return teile.join(' ');
}

/** Klartext-Erklärung einer Rüstung aus ihren Zonenwerten. */
export function ruestungErklaerung(def) {
  const zonen = [
    ['Beine', def.rsBeine], ['linker Arm', def.rsLArm], ['rechter Arm', def.rsRArm],
    ['Bauch', def.rsBauch], ['Brust', def.rsBrust], ['Kopf', def.rsKopf],
  ].filter(([, v]) => Number(v) > 0).map(([n]) => n);
  let wo;
  if (zonen.length >= 4) wo = 'nahezu den ganzen Körper';
  else if (zonen.length) wo = zonen.join(', ');
  else wo = 'einen Körperbereich';
  return `Schützt ${wo}. Der Rüstungsschutz senkt eingehenden Schaden und hebt die Wundschwelle; `
    + 'die Behinderung verringert Geschwindigkeit und Durchhaltevermögen. Mehrere Teile ergänzen sich zum vollen Schutz.';
}

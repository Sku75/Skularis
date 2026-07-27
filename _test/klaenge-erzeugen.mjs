/**
 * Skularis — die drei eigenen Klänge erzeugen.
 *
 * Läuft mit der Node-Laufzeit von Electron:
 *   Skularis.exe _test/klaenge-erzeugen.mjs <pfad zu renderer/assets/sounds>
 * mit gesetztem ELECTRON_RUN_AS_NODE=1.
 *
 * Erzeugt werden:
 *   ebene-vor.wav      eine Ebene tiefer, also ein Bildschirm weiter: zwei Töne
 *                      aufwärts, weich anklingend, mit langem Ausklang
 *   ebene-zurueck.wav  der Spiegel dazu: dieselben zwei Töne abwärts. Gleiche
 *                      Klangfarbe, gleiche Länge, nur die Richtung dreht sich —
 *                      so hört man sofort, ob es vor oder zurück ging.
 *   wuerfel.wav        ein Würfel, der aufkommt, zweimal springt und ausrollt
 *
 * Die Töne sind bewusst leise und obertonarm: sie erklingen bei jedem
 * Bildschirmwechsel und dürfen die Sprachausgabe nicht überdecken.
 *
 * Format wie die vorhandenen Klänge: 44100 Hz, 16 Bit, Stereo.
 */
import fs from 'node:fs';
import path from 'node:path';

const RATE = 44100;
const ZIEL = process.argv[2];

/** Kleiner Zufallsgenerator mit festem Anfang, damit die Datei reproduzierbar ist. */
function zufall(saat) {
  let z = saat >>> 0;
  return () => {
    z ^= z << 13; z >>>= 0;
    z ^= z >> 17;
    z ^= z << 5; z >>>= 0;
    return z / 4294967296 * 2 - 1;
  };
}

function spur(sekunden) {
  const n = Math.ceil(sekunden * RATE);
  return { links: new Float64Array(n), rechts: new Float64Array(n), n };
}

/**
 * Ein weicher, glockiger Ton. Die Obertöne klingen schneller ab als der
 * Grundton, das gibt den warmen Anschlag ohne Schärfe.
 */
function ton(s, startSek, freq, dauer, amp, breite = 0) {
  const start = Math.floor(startSek * RATE);
  const n = Math.floor(dauer * RATE);
  for (let i = 0; i < n && start + i < s.n; i++) {
    const t = i / RATE;
    const anstieg = Math.min(1, t / 0.008);            // kein Knacken am Anfang
    const huelle = anstieg * Math.exp(-t / (dauer * 0.30));
    const wert = amp * huelle * (
      Math.sin(2 * Math.PI * freq * t)
      + 0.26 * Math.exp(-t / (dauer * 0.10)) * Math.sin(2 * Math.PI * freq * 2 * t)
      + 0.09 * Math.exp(-t / (dauer * 0.06)) * Math.sin(2 * Math.PI * freq * 3.01 * t)
    );
    // Leichte Verbreiterung: der rechte Kanal kommt ein paar Muster später.
    s.links[start + i] += wert * (1 - breite * 0.25);
    const versatz = start + i + Math.floor(breite * 0.0009 * RATE);
    if (versatz < s.n) s.rechts[versatz] += wert * (1 - breite * 0.05);
  }
}

/** Ein Aufschlag: kurzes Rauschen mit Resonanz, wie Holz auf Holz. */
function klopfen(s, startSek, freq, dauer, amp, rnd) {
  const start = Math.floor(startSek * RATE);
  const n = Math.floor(dauer * RATE);
  let tief = 0;
  for (let i = 0; i < n && start + i < s.n; i++) {
    const t = i / RATE;
    const huelle = Math.exp(-t / (dauer * 0.22));
    // Rauschen leicht geglättet, damit es nicht zischt
    tief = tief * 0.55 + rnd() * 0.45;
    const wert = amp * huelle * (0.55 * tief + 0.75 * Math.sin(2 * Math.PI * freq * t));
    s.links[start + i] += wert;
    s.rechts[start + i] += wert * 0.92;
  }
}

function schreibeWav(datei, s) {
  // Auf einen sicheren Pegel normieren, damit nichts übersteuert.
  let spitze = 0;
  for (let i = 0; i < s.n; i++) {
    spitze = Math.max(spitze, Math.abs(s.links[i]), Math.abs(s.rechts[i]));
  }
  const faktor = spitze > 0 ? (0.82 / spitze) : 1;

  const daten = Buffer.alloc(s.n * 4);
  for (let i = 0; i < s.n; i++) {
    const l = Math.max(-1, Math.min(1, s.links[i] * faktor));
    const r = Math.max(-1, Math.min(1, s.rechts[i] * faktor));
    daten.writeInt16LE(Math.round(l * 32767), i * 4);
    daten.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
  }

  const kopf = Buffer.alloc(44);
  kopf.write('RIFF', 0, 'ascii');
  kopf.writeUInt32LE(36 + daten.length, 4);
  kopf.write('WAVE', 8, 'ascii');
  kopf.write('fmt ', 12, 'ascii');
  kopf.writeUInt32LE(16, 16);
  kopf.writeUInt16LE(1, 20);          // PCM
  kopf.writeUInt16LE(2, 22);          // Stereo
  kopf.writeUInt32LE(RATE, 24);
  kopf.writeUInt32LE(RATE * 4, 28);   // Bytes je Sekunde
  kopf.writeUInt16LE(4, 32);          // Bytes je Rahmen
  kopf.writeUInt16LE(16, 34);
  kopf.write('data', 36, 'ascii');
  kopf.writeUInt32LE(daten.length, 40);

  fs.writeFileSync(datei, Buffer.concat([kopf, daten]));
  console.log(`  ${path.basename(datei)}  ${(s.n / RATE).toFixed(2)} s`);
}

// --- Eine Ebene vor: zwei Töne aufwärts ---------------------------------
{
  const s = spur(1.05);
  ton(s, 0.00, 493.88, 0.55, 0.55, 1);   // H4
  ton(s, 0.11, 739.99, 0.92, 0.62, 1);   // Fis5, klingt lange aus
  schreibeWav(path.join(ZIEL, 'ebene-vor.wav'), s);
}

// --- Eine Ebene zurück: dieselben Töne abwärts --------------------------
{
  const s = spur(1.05);
  ton(s, 0.00, 739.99, 0.55, 0.55, 1);
  ton(s, 0.11, 493.88, 0.92, 0.62, 1);
  schreibeWav(path.join(ZIEL, 'ebene-zurueck.wav'), s);
}

// --- Würfel: aufkommen, zweimal springen, ausrollen ---------------------
{
  const s = spur(0.75);
  const rnd = zufall(20260723);
  //        Zeit   Frequenz  Dauer  Lautstärke
  klopfen(s, 0.000, 900, 0.075, 0.85, rnd);
  klopfen(s, 0.095, 780, 0.065, 0.62, rnd);
  klopfen(s, 0.170, 1020, 0.055, 0.50, rnd);
  klopfen(s, 0.228, 840, 0.048, 0.38, rnd);
  klopfen(s, 0.272, 960, 0.040, 0.28, rnd);
  klopfen(s, 0.305, 720, 0.034, 0.20, rnd);
  // Letztes Aufkommen: etwas tiefer, liegen bleiben
  klopfen(s, 0.345, 520, 0.130, 0.42, rnd);
  schreibeWav(path.join(ZIEL, 'wuerfel.wav'), s);
}

console.log('Fertig.');

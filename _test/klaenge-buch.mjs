/**
 * Skularis — die beiden Buch-Klänge für das Info-Fenster erzeugen.
 *   buch-auf.wav   das Fenster öffnet: mehrere schnelle Papierblätter, wie wenn
 *                  man ein Buch aufblättert. Hell und trocken, kein Metall.
 *   buch-zu.wav    das Fenster schließt: ein kurzes Blättern, dann ein weicher,
 *                  tiefer Schlag, wie ein zugeschlagenes Buch.
 *
 * Kurz (etwa halb so lang wie die alten Rollo-Klänge), sanft ausgeblendet.
 * Die Lautstärke im Programm regelt sounds.js zusätzlich herunter.
 *
 * Aufruf mit der Node-Laufzeit von Electron (ELECTRON_RUN_AS_NODE=1):
 *   Skularis.exe _test/klaenge-buch.mjs <pfad zu renderer/assets/sounds>
 */
import fs from 'node:fs';
import path from 'node:path';

const RATE = 44100;
const ZIEL = process.argv[2];

function zufall(saat) {
  let z = saat >>> 0;
  return () => { z ^= z << 13; z >>>= 0; z ^= z >> 17; z ^= z << 5; z >>>= 0; return z / 4294967296; };
}

function spur(sek) {
  const n = Math.ceil(sek * RATE);
  return { l: new Float64Array(n), r: new Float64Array(n), n };
}

/**
 * Ein einzelnes Papierblatt: ein kurzer, heller Rausch-Stoß. Die Hochpass-Bildung
 * (Differenz aufeinanderfolgender Werte) nimmt das Dumpfe heraus, sodass es
 * trocken und papieren knistert. Eine kurze Hülle mit schnellem Anschlag gibt
 * das „Fwip" eines umgeschlagenen Blattes.
 * @param seite -1 nach links, 1 nach rechts (leichte Stereo-Wanderung)
 */
function blatt(s, start, dauer, amp, seite, rnd) {
  const a = Math.floor(start * RATE);
  const n = Math.floor(dauer * RATE);
  let prev = 0;
  for (let i = 0; i < n && a + i < s.n; i++) {
    const t = i / n;
    // Schneller Anschlag, weiches Ausklingen — das typische Blätter-Fwip.
    const huelle = Math.pow(1 - t, 1.5) * Math.min(1, t / 0.04);
    const roh = rnd() * 2 - 1;
    const hp = roh - prev;           // Hochpass: hell und trocken
    prev = roh;
    const wert = amp * huelle * hp;
    // Leichte Stereo-Wanderung, damit es sich anfühlt wie eine bewegte Hand.
    const links = seite < 0 ? 1.0 : 0.8;
    const rechts = seite < 0 ? 0.8 : 1.0;
    s.l[a + i] += wert * links;
    s.r[a + i] += wert * rechts;
  }
}

/**
 * Der weiche, tiefe Schlag eines zugeschlagenen Buches: ein tiefer Körper, der
 * schnell abklingt, mit einem kurzen Aufprall-Knack ganz am Anfang.
 */
function schlag(s, start, freqVon, freqBis, dauer, amp, rnd) {
  const a = Math.floor(start * RATE);
  const n = Math.floor(dauer * RATE);
  for (let i = 0; i < n && a + i < s.n; i++) {
    const t = i / RATE;
    const tn = i / n;
    const anstieg = Math.min(1, t / 0.002);
    const huelle = anstieg * Math.exp(-t / (dauer * 0.22));
    const freq = freqVon + (freqBis - freqVon) * tn;   // sackt tiefer ab
    const koerper = Math.sin(2 * Math.PI * freq * t);
    // Aufprall-Knack: sehr kurzes Rauschen, das den Anschlag greifbar macht.
    const knack = i < 500 ? (rnd() * 2 - 1) * Math.exp(-i / 140) : 0;
    const wert = amp * huelle * (koerper * 0.9 + knack * 0.5);
    s.l[a + i] += wert;
    s.r[a + i] += wert;
  }
}

function schreibe(datei, s) {
  let spitze = 0;
  for (let i = 0; i < s.n; i++) spitze = Math.max(spitze, Math.abs(s.l[i]), Math.abs(s.r[i]));
  const f = spitze > 0 ? 0.8 / spitze : 1;
  const daten = Buffer.alloc(s.n * 4);
  for (let i = 0; i < s.n; i++) {
    daten.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s.l[i] * f)) * 32767), i * 4);
    daten.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s.r[i] * f)) * 32767), i * 4 + 2);
  }
  const k = Buffer.alloc(44);
  k.write('RIFF', 0); k.writeUInt32LE(36 + daten.length, 4); k.write('WAVE', 8);
  k.write('fmt ', 12); k.writeUInt32LE(16, 16); k.writeUInt16LE(1, 20); k.writeUInt16LE(2, 22);
  k.writeUInt32LE(RATE, 24); k.writeUInt32LE(RATE * 4, 28); k.writeUInt16LE(4, 32); k.writeUInt16LE(16, 34);
  k.write('data', 36); k.writeUInt32LE(daten.length, 40);
  fs.writeFileSync(datei, Buffer.concat([k, daten]));
  console.log(`  ${path.basename(datei)}  ${(s.n / RATE).toFixed(2)} s`);
}

{
  // Auf: vier schnelle Blätter, aufwärts leiser werdend abgeschlossen — als
  // würde man ein Buch aufschlagen und kurz durchblättern.
  const s = spur(0.34);
  const rnd = zufall(20260724);
  blatt(s, 0.00, 0.11, 0.9, -1, rnd);
  blatt(s, 0.07, 0.11, 0.8,  1, rnd);
  blatt(s, 0.15, 0.10, 0.7, -1, rnd);
  blatt(s, 0.22, 0.10, 0.6,  1, rnd);
  schreibe(path.join(ZIEL, 'buch-auf.wav'), s);
}
{
  // Zu: zwei rasche Blätter, dann der weiche tiefe Schlag des zugeschlagenen Buches.
  const s = spur(0.34);
  const rnd = zufall(72620240);
  blatt(s, 0.00, 0.09, 0.7, -1, rnd);
  blatt(s, 0.05, 0.08, 0.6,  1, rnd);
  schlag(s, 0.11, 150, 82, 0.22, 0.95, rnd);
  schreibe(path.join(ZIEL, 'buch-zu.wav'), s);
}
console.log('Fertig.');

/**
 * Skularis — die beiden Rollo-Klänge für das Info-Fenster erzeugen.
 *   rollo-auf.wav   das Fenster rollt auf: ein aufwärts laufendes Rascheln,
 *                   das in einem kurzen hellen Ton mündet (Bling)
 *   rollo-zu.wav    das Fenster rollt zu: dasselbe abwärts, endet dumpfer (Blong)
 *
 * Aufruf mit der Node-Laufzeit von Electron (ELECTRON_RUN_AS_NODE=1):
 *   Skularis.exe _test/klaenge-rollo.mjs <pfad zu renderer/assets/sounds>
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
 * Ein rollendes Rascheln: gefiltertes Rauschen, dessen Klanghöhe über die
 * Dauer wandert, dazu ein leichter Puls im Rhythmus einer sich drehenden Rolle.
 * @param richtung 1 aufwärts, -1 abwärts
 */
function rollen(s, von, bis, amp, richtung, rnd) {
  const a = Math.floor(von * RATE);
  const b = Math.floor(bis * RATE);
  let tief = 0, band = 0;
  for (let i = a; i < b && i < s.n; i++) {
    const t = (i - a) / (b - a);                       // 0..1 über die Rolldauer
    const huelle = Math.sin(Math.PI * t);              // sanft ein und aus
    const rausch = rnd() * 2 - 1;
    tief = tief * 0.6 + rausch * 0.4;                  // etwas glätten
    // Bandmitte wandert je nach Richtung, das gibt das Auf- oder Zurollen.
    const mitte = richtung > 0 ? (0.15 + 0.7 * t) : (0.85 - 0.7 * t);
    band = band * (1 - mitte * 0.5) + tief * (mitte * 0.5);
    // Rollpuls: die Rolle dreht sich, etwa 22 Umdrehungsgeräusche je Sekunde.
    const puls = 0.6 + 0.4 * Math.sin(2 * Math.PI * 22 * (i - a) / RATE);
    const wert = amp * huelle * band * puls;
    s.l[i] += wert;
    s.r[i] += wert * 0.9;
  }
}

/** Ein weicher Ton als Abschluss (Bling hell, Blong dumpf). */
function ton(s, start, freq, dauer, amp) {
  const a = Math.floor(start * RATE);
  const n = Math.floor(dauer * RATE);
  for (let i = 0; i < n && a + i < s.n; i++) {
    const t = i / RATE;
    const anstieg = Math.min(1, t / 0.006);
    const huelle = anstieg * Math.exp(-t / (dauer * 0.3));
    const wert = amp * huelle * (Math.sin(2 * Math.PI * freq * t)
      + 0.2 * Math.exp(-t / (dauer * 0.12)) * Math.sin(2 * Math.PI * freq * 2 * t));
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
  // Auf: Rascheln aufwärts, dann helles Bling.
  const s = spur(0.60);
  rollen(s, 0.00, 0.42, 0.7, 1, zufall(20260724));
  ton(s, 0.40, 880, 0.20, 0.5);
  schreibe(path.join(ZIEL, 'rollo-auf.wav'), s);
}
{
  // Zu: Rascheln abwärts, dann dumpfes Blong.
  const s = spur(0.55);
  rollen(s, 0.00, 0.40, 0.7, -1, zufall(72620240));
  ton(s, 0.36, 392, 0.18, 0.5);
  schreibe(path.join(ZIEL, 'rollo-zu.wav'), s);
}
console.log('Fertig.');

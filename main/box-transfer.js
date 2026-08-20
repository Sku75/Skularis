/**
 * Skularis — Charakterbogen-Transfer über ntfy.sh (accountlos, Code = Zimmer).
 *
 * Ein Spieler lädt seinen Bogen unter einem 4-stelligen Code hoch (als Anhang, da
 * meist größer als 4 KB), der Meister holt ihn unter demselben Code wieder ab. KEIN
 * Konto nötig. Die Daten verfallen automatisch nach ~3 Stunden (ein aktives Löschen
 * bietet der öffentliche Dienst nicht). Bewusst GETRENNT vom Radio/Post (PeerJS).
 *
 * Läuft im Hauptprozess (Node https), damit keine CSP/CORS-Grenzen des Renderers
 * greifen. Verifizierter Ablauf: PUT mit Filename-Header -> Anhang; GET
 * /<topic>/json?poll=1&since=all -> Nachricht mit attachment.url; diese URL laden.
 */
const https = require('https');

const HOST = 'ntfy.sh';

/** Topic (Zimmer) aus dem Code ableiten. Nur der Code entscheidet über den Zugang. */
function topicVon(code) {
  const rein = String(code || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
  return rein ? ('skularis-transfer-' + rein) : null;
}

/** Eine HTTPS-Anfrage als Promise (mit Timeout). Rückgabe { status, body:Buffer }. */
function anfrage(optionen, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(optionen, (res) => {
      const teile = [];
      res.on('data', (d) => teile.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(teile) }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('Zeitüberschreitung')); });
    if (body) req.write(body);
    req.end();
  });
}

/** Bogen (XML-String) unter dem Code hochladen. */
async function uploadBogen(code, inhalt) {
  const topic = topicVon(code);
  if (!topic) return { ok: false, fehler: 'Kein gültiger Code.' };
  const body = Buffer.from(String(inhalt || ''), 'utf-8');
  if (!body.length) return { ok: false, fehler: 'Leerer Bogen.' };
  try {
    const r = await anfrage({
      host: HOST, path: '/' + topic, method: 'PUT',
      headers: {
        'Filename': 'bogen.xml',
        'Title': 'Skularis Charakterbogen',
        'Content-Type': 'application/octet-stream',
        'Content-Length': body.length,
      },
    }, body);
    if (r.status >= 200 && r.status < 300) return { ok: true };
    return { ok: false, fehler: 'Server-Status ' + r.status };
  } catch (e) {
    return { ok: false, fehler: String((e && e.message) || e) };
  }
}

/** Bogen unter dem Code abholen (neuester Anhang). Rückgabe { ok, inhalt } oder { ok:false, fehler }. */
async function downloadBogen(code) {
  const topic = topicVon(code);
  if (!topic) return { ok: false, fehler: 'Kein gültiger Code.' };
  try {
    // 1) Gecachte Nachrichten des Topics einmalig abfragen.
    const r = await anfrage({ host: HOST, path: '/' + topic + '/json?poll=1&since=all', method: 'GET', headers: {} });
    if (r.status < 200 || r.status >= 300) return { ok: false, fehler: 'Server-Status ' + r.status };
    const zeilen = r.body.toString('utf-8').trim().split('\n').filter(Boolean);
    let attUrl = null; // die neueste Anhang-URL gewinnt
    for (const z of zeilen) {
      try { const m = JSON.parse(z); if (m.event === 'message' && m.attachment && m.attachment.url) attUrl = m.attachment.url; }
      catch { /* defekte Zeile überspringen */ }
    }
    if (!attUrl) return { ok: false, fehler: 'Kein Charakter unter diesem Code.' };
    // 2) Anhang herunterladen.
    const u = new URL(attUrl);
    const a = await anfrage({ host: u.host, path: u.pathname + (u.search || ''), method: 'GET', headers: {} });
    if (a.status < 200 || a.status >= 300) return { ok: false, fehler: 'Anhang-Status ' + a.status };
    return { ok: true, inhalt: a.body.toString('utf-8') };
  } catch (e) {
    return { ok: false, fehler: String((e && e.message) || e) };
  }
}

// --- Abruf-Post (seit 1.20) ----------------------------------------------
//
// Die Meisterpost laeuft nicht mehr als Push ueber den PeerJS-Datenkanal,
// sondern als Ablage auf ntfy: Topic skularis-post-<code>-<empfaenger>
// (empfaenger = normalisierter Name oder "alle"). Die Nachricht liegt als
// TEXT im Nachrichtenkoerper (nicht als Anhang): Texte bleiben so etwa 12
// Stunden abrufbar statt 3 (Anhaenge verfallen frueher). Zugestellt wird NUR,
// wenn der Empfaenger aktiv abruft (Strg B). Bewusst unverschluesselt
// (Entscheidung des Nutzers: Inhalte unkritisch, oeffentlicher Ablagedienst).

/** Namen fuer das Topic normalisieren (Umlaute umschreiben, dann nur a-z und 0-9). */
function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^0-9a-z]/g, '');
}

function postTopic(code, empfaenger) {
  const c = String(code || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
  const e = normName(empfaenger);
  if (!c || !e) return null;
  return `skularis-post-${c}-${e}`;
}

/**
 * Eine Post-Nachricht ablegen. daten = { von, an, text, zeit }.
 * Rueckgabe { ok, id } (id = ntfy-Nachrichten-Id, fuer das Gesehen-Gedaechtnis
 * des Absenders) oder { ok:false, fehler }.
 */
async function postSenden(code, empfaenger, daten) {
  const topic = postTopic(code, empfaenger);
  if (!topic) return { ok: false, fehler: 'Kein gültiger Code oder Empfänger.' };
  const body = Buffer.from(JSON.stringify(daten || {}), 'utf-8');
  if (!body.length) return { ok: false, fehler: 'Leere Nachricht.' };
  try {
    const kopf = { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length };
    // Sehr lange Nachrichten (ueber dem ntfy-Textlimit) als Anhang; die kuerzere
    // Haltbarkeit von Anhaengen ist dann der Preis der Laenge.
    if (body.length > 3800) kopf.Filename = 'post.json';
    const r = await anfrage({ host: HOST, path: '/' + topic, method: 'PUT', headers: kopf }, body);
    if (r.status >= 200 && r.status < 300) {
      let id = '';
      try { const m = JSON.parse(r.body.toString('utf-8')); if (m && m.id) id = m.id; } catch { /* egal */ }
      return { ok: true, id };
    }
    return { ok: false, fehler: 'Server-Status ' + r.status };
  } catch (e) {
    return { ok: false, fehler: String((e && e.message) || e) };
  }
}

/**
 * Alle abrufbaren Post-Nachrichten eines Empfaenger-Topics holen.
 * Rueckgabe { ok, nachrichten: [{ id, zeit, daten }] } oder { ok:false, fehler }.
 */
async function postAbrufen(code, empfaenger) {
  const topic = postTopic(code, empfaenger);
  if (!topic) return { ok: false, fehler: 'Kein gültiger Code oder Empfänger.' };
  try {
    const r = await anfrage({ host: HOST, path: '/' + topic + '/json?poll=1&since=all', method: 'GET', headers: {} });
    if (r.status < 200 || r.status >= 300) return { ok: false, fehler: 'Server-Status ' + r.status };
    const zeilen = r.body.toString('utf-8').trim().split('\n').filter(Boolean);
    const nachrichten = [];
    for (const z of zeilen) {
      let m;
      try { m = JSON.parse(z); } catch { continue; }
      if (!m || m.event !== 'message' || !m.id) continue;
      let daten = null;
      if (m.attachment && m.attachment.url) {
        // Uebergrosse Nachricht als Anhang: nachladen.
        try {
          const u = new URL(m.attachment.url);
          const a = await anfrage({ host: u.host, path: u.pathname + (u.search || ''), method: 'GET', headers: {} });
          if (a.status >= 200 && a.status < 300) daten = JSON.parse(a.body.toString('utf-8'));
        } catch { /* defekten Anhang ueberspringen */ }
      } else if (m.message) {
        try { daten = JSON.parse(m.message); } catch { /* fremde Nachricht ueberspringen */ }
      }
      if (daten && typeof daten === 'object' && daten.text !== undefined) {
        nachrichten.push({ id: m.id, zeit: (m.time ? m.time * 1000 : Date.now()), daten });
      }
    }
    return { ok: true, nachrichten };
  } catch (e) {
    return { ok: false, fehler: String((e && e.message) || e) };
  }
}

module.exports = { uploadBogen, downloadBogen, postSenden, postAbrufen };

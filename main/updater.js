/**
 * Skularis — Selbst-Update über GitHub.
 *
 * Prüft die neueste Veröffentlichung im Repo Sku75/Skularis-alpha, lädt bei
 * Bedarf die portable ZIP (fester Name, stabiler latest-Link) herunter und
 * startet ein kleines PowerShell-Hilfsskript. Das Hilfsskript wartet, bis
 * Skularis beendet ist, tauscht die Installation aus (Nutzerdaten bleiben
 * erhalten) und startet Skularis neu.
 *
 * Läuft nur auf Knopfdruck (Optionen, "Update Skularis"), lädt bewusst immer die
 * ganze portable Version frisch.
 */
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO = 'Sku75/Skularis-alpha';
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const ASSET_NAME = 'Skularis-portable.zip';
const PORTABLE_URL = `https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}`;

// --- HTTPS mit Weiterleitungen ---

function holen(url, ziel, onProgress, tiefe = 0) {
  return new Promise((resolve, reject) => {
    if (tiefe > 6) return reject(new Error('Zu viele Weiterleitungen.'));
    const req = https.get(url, {
      headers: { 'User-Agent': 'Skularis-Updater', 'Accept': 'application/octet-stream' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(holen(res.headers.location, ziel, onProgress, tiefe + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download fehlgeschlagen, Status ${res.statusCode}.`));
      }
      const gesamt = parseInt(res.headers['content-length'] || '0', 10);
      let geladen = 0, letzteMeldung = 0;
      const out = fs.createWriteStream(ziel);
      res.on('data', (chunk) => {
        geladen += chunk.length;
        if (gesamt && onProgress) {
          const pct = Math.floor((geladen / gesamt) * 100);
          if (pct >= letzteMeldung + 20) { letzteMeldung = pct; onProgress(pct); }
        }
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve({ pfad: ziel, bytes: geladen })));
      out.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('Zeitüberschreitung beim Laden.')));
  });
}

function holenText(url, tiefe = 0) {
  return new Promise((resolve, reject) => {
    if (tiefe > 6) return reject(new Error('Zu viele Weiterleitungen.'));
    https.get(url, {
      headers: { 'User-Agent': 'Skularis-Updater', 'Accept': 'application/vnd.github+json' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(holenText(res.headers.location, tiefe + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`GitHub-Abfrage fehlgeschlagen, Status ${res.statusCode}.`));
      }
      let daten = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { daten += c; });
      res.on('end', () => resolve(daten));
    }).on('error', reject).setTimeout(30000, function () { this.destroy(new Error('Zeitüberschreitung.')); });
  });
}

// --- Versionsvergleich ---

function versionsZahl(text) {
  const m = String(text || '').match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3] || '0', 10)];
}

function istNeuer(remote, lokal) {
  if (!remote || !lokal) return false;
  for (let i = 0; i < 3; i++) {
    if ((remote[i] || 0) > (lokal[i] || 0)) return true;
    if ((remote[i] || 0) < (lokal[i] || 0)) return false;
  }
  return false;
}

/**
 * Neueste Version bei GitHub prüfen.
 * @returns {Promise<{neuer:boolean, tag:string, lokaleVersion:string, fehler?:string}>}
 */
async function pruefe(lokaleVersion) {
  try {
    const json = JSON.parse(await holenText(LATEST_API));
    const tag = json.tag_name || json.name || '';
    const neuer = istNeuer(versionsZahl(tag), versionsZahl(lokaleVersion));
    return { neuer, tag, lokaleVersion };
  } catch (e) {
    return { neuer: false, tag: '', lokaleVersion, fehler: e.message || 'Unbekannter Fehler' };
  }
}

// --- Herunterladen und Installieren ---

function pruefeZip(pfad) {
  const stat = fs.statSync(pfad);
  if (stat.size < 1024 * 1024) throw new Error('Der Download ist zu klein, vermutlich unvollständig.');
  const fd = fs.openSync(pfad, 'r');
  const buf = Buffer.alloc(2);
  fs.readSync(fd, buf, 0, 2, 0);
  fs.closeSync(fd);
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('Der Download ist keine gültige ZIP-Datei.');
}

/**
 * Portable ZIP laden, Hilfsskript schreiben und detached starten.
 * @param {{installPfad:string, exePfad:string, onProgress?:(pct:number)=>void}} o
 */
async function ladeUndInstalliere({ installPfad, exePfad, onProgress }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skularis-update-'));
  const zipPfad = path.join(tmp, ASSET_NAME);
  await holen(PORTABLE_URL, zipPfad, onProgress);
  pruefeZip(zipPfad);

  const skriptPfad = path.join(tmp, 'skularis-update.ps1');
  fs.writeFileSync(skriptPfad, HILFSSKRIPT, 'utf8');

  const args = [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
    '-File', skriptPfad,
    '-ZipPfad', zipPfad,
    '-InstallPfad', installPfad,
    '-WartePid', String(process.pid),
  ];
  const child = spawn('powershell.exe', args, { detached: true, stdio: 'ignore' });
  child.unref();
  return { gestartet: true };
}

// Das Hilfsskript. Läuft AUSSERHALB von Skularis (in einem Temp-Ordner), damit es
// den Installationsordner umbenennen darf. Nutzerdaten werden übernommen, bei
// Fehler wird die alte Installation zurückgeholt.
const HILFSSKRIPT = String.raw`
param(
  [Parameter(Mandatory=$true)][string]$ZipPfad,
  [Parameter(Mandatory=$true)][string]$InstallPfad,
  [Parameter(Mandatory=$true)][int]$WartePid
)
$ErrorActionPreference = 'Stop'

# 1. Warten, bis Skularis wirklich beendet ist.
try { Wait-Process -Id $WartePid -Timeout 60 -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 2

# 2. Neue Version entpacken.
$Extrakt = Join-Path ([System.IO.Path]::GetTempPath()) ("skularis-neu-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Extrakt | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPfad, $Extrakt)

# 3. App-Wurzel im Entpackten finden (Ordner mit Skularis.exe).
$NeuExe = Get-ChildItem -Path $Extrakt -Filter 'Skularis.exe' -Recurse | Select-Object -First 1
if (-not $NeuExe) { exit 1 }
$NeuRoot = $NeuExe.Directory.FullName

# 4. Nutzerdaten aus der bestehenden Installation übernehmen.
foreach ($item in @('Charakter-Dateien','Abenteuer-Daten','skularistool_config.json')) {
  $q = Join-Path $InstallPfad $item
  if (Test-Path -LiteralPath $q) {
    Copy-Item -LiteralPath $q -Destination (Join-Path $NeuRoot $item) -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# 5. Alte Installation sichern, neue an ihren Platz. Ordnernamen bleiben gleich.
$Leaf   = Split-Path $InstallPfad -Leaf
$Parent = Split-Path $InstallPfad -Parent
$BackupLeaf = $Leaf + '.alt-' + (Get-Date -Format 'yyyyMMddHHmmss')
$Backup = Join-Path $Parent $BackupLeaf

$umbenannt = $false
for ($i = 0; $i -lt 40; $i++) {
  try { Rename-Item -LiteralPath $InstallPfad -NewName $BackupLeaf -ErrorAction Stop; $umbenannt = $true; break }
  catch { Start-Sleep -Milliseconds 500 }
}
if (-not $umbenannt) { exit 2 }

try {
  Move-Item -LiteralPath $NeuRoot -Destination $InstallPfad -Force
} catch {
  # Rückfall: alte Installation zurückholen.
  Rename-Item -LiteralPath $Backup -NewName $Leaf -ErrorAction SilentlyContinue
  exit 3
}

# 6. Skularis neu starten.
try { Start-Process -FilePath (Join-Path $InstallPfad 'Skularis.exe') } catch {}

# 7. Aufräumen (Fehler hier sind harmlos).
try { Remove-Item -LiteralPath $Backup -Recurse -Force -ErrorAction SilentlyContinue } catch {}
try { Remove-Item -LiteralPath $ZipPfad -Force -ErrorAction SilentlyContinue } catch {}
try { Remove-Item -LiteralPath $Extrakt -Recurse -Force -ErrorAction SilentlyContinue } catch {}
`;

module.exports = { pruefe, ladeUndInstalliere, versionsZahl, istNeuer, HILFSSKRIPT };

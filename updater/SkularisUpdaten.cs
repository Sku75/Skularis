/*
 * Skularis Updaten — eigenständiger Updater (kein Teil von Skularis selbst).
 *
 * Liegt im Portable-Wurzelordner, NEBEN dem Programmordner "Skularis x.xx".
 * Er tauscht diesen Geschwister-Programmordner aus und rührt die Nutzerdaten
 * (Charakter-Dateien, Abenteuer-Daten) nie an.
 *
 * Zwei Adressen: zuerst wird beim neuen Projekt (Sku75/Skularis) nach der
 * neuesten Version gefragt; klappt das nicht, wird auf die frühere Adresse
 * (Sku75/Skularis-alpha) zurückgegriffen. So bleibt der Updater auch nach einer
 * Umbenennung des Projekts nutzbar.
 *
 * Selbst-Erneuerung: liegt im Download eine neuere Fassung dieses Updaters, wird
 * sie nach getaner Arbeit über ein kleines Hilfsskript ausgetauscht, sobald sich
 * der Updater beendet. So verteilen sich künftige Adress- oder Ablauf-Änderungen
 * von allein, ohne dass die Updater-Datei von Hand getauscht werden muss.
 *
 * Ablauf: eigene Version aus dem Ordnernamen lesen, GitHub nach der neuesten
 * Version fragen, bei Bedarf die Portable-ZIP in einen Temp-Ordner laden und
 * entpacken, Skularis schließen, den alten Programmordner durch den neuen
 * ersetzen, Beilagen und Updater erneuern, aufräumen, neue Version ansagen.
 *
 * Während der Arbeit alle 10 Sekunden ein Warteton (Console.Beep, keine Datei).
 *
 * Kompilieren (bordeigener .NET-Framework-Compiler):
 *   csc /target:exe /out:"Skularis Updaten.exe" \
 *       /r:System.IO.Compression.FileSystem.dll /r:System.Windows.Forms.dll \
 *       SkularisUpdaten.cs
 */
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

class SkularisUpdaten
{
    // Zuerst das neue Projekt, dann die frühere Adresse als Rückfall.
    static readonly string[] Repos = { "Sku75/Skularis", "Sku75/Skularis-alpha" };

    static string ApiUrl(string repo)   { return "https://api.github.com/repos/" + repo + "/releases/latest"; }
    static string AssetUrl(string repo) { return "https://github.com/" + repo + "/releases/latest/download/Skularis-Portable.zip"; }

    static string _repoGewaehlt = null; // das Repo, bei dem eine Version gefunden wurde

    static System.Threading.Timer _tonTimer;
    static bool _leise = false;

    [STAThread]
    static int Main(string[] args)
    {
        try { Console.OutputEncoding = System.Text.Encoding.UTF8; } catch { }
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | (SecurityProtocolType)3072;

        // Testhaken (stört den Normalbetrieb nicht): ein Dateipfad als Argument
        // nutzt eine lokale ZIP statt Download und erzwingt das Update; "-leise"
        // unterdrückt die Abschluss-Meldung (für automatische Tests).
        string testZip = (args.Length > 0 && File.Exists(args[0])) ? args[0] : null;
        _leise = Array.IndexOf(args, "-leise") >= 0;

        // Warteton alle 10 Sekunden, solange der Updater läuft.
        _tonTimer = new System.Threading.Timer(_ => { try { Console.Beep(660, 180); } catch { } }, null, 10000, 10000);

        string wurzel = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
        try
        {
            Log("Skularis Updaten.");
            Log("Wird geprüft, bitte warten.");

            string altProgramm = FindeProgrammordner(wurzel);
            string lokal = altProgramm != null ? VersionAusName(Path.GetFileName(altProgramm)) : null;
            Log(lokal != null ? ("Installiert: Version " + lokal + ".") : "Keine installierte Version gefunden.");

            string tmp = Path.Combine(Path.GetTempPath(), "skularis-update-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tmp);
            string zip = Path.Combine(tmp, "Skularis-Portable.zip");
            string remote = null;

            if (testZip == null)
            {
                string tag = HoleNeuestenTag();
                remote = VersionAusName(tag);
                if (remote == null) throw new Exception("Konnte die neueste Version bei GitHub nicht lesen.");
                Log("Neueste Version: " + remote + ".");
                if (lokal != null && !IstNeuer(remote, lokal))
                {
                    Fertig("Du hast bereits die neueste Version (" + lokal + ").", MessageBoxIcon.Information);
                    return 0;
                }
                Log("Neue Version wird geladen. Das kann eine Minute dauern.");
                LadeDatei(AssetUrl(_repoGewaehlt), zip);
            }
            else
            {
                Log("Testmodus: lokale ZIP wird verwendet.");
                File.Copy(testZip, zip, true);
            }
            PruefeZip(zip);

            Log("Wird entpackt.");
            string extra = Path.Combine(tmp, "extra");
            Directory.CreateDirectory(extra);
            ZipFile.ExtractToDirectory(zip, extra);

            string neuProgramm = FindeProgrammordnerTief(extra);
            if (neuProgramm == null) throw new Exception("Im Download wurde kein Programmordner gefunden.");
            string neueVersion = VersionAusName(Path.GetFileName(neuProgramm)) ?? remote;

            Log("Skularis wird geschlossen, falls es läuft.");
            SchliesseSkularis();

            // Neuen Programmordner in die Wurzel kopieren (erst kopieren, dann den
            // alten löschen — so bleibt bei einem Fehler immer eine Version da).
            string ziel = Path.Combine(wurzel, Path.GetFileName(neuProgramm));
            Log("Neue Version wird eingespielt.");
            if (Directory.Exists(ziel)) LoescheOrdner(ziel);
            KopiereOrdner(neuProgramm, ziel);

            // Alte Programmordner entfernen (alle mit Skularis.exe außer dem neuen).
            foreach (var d in Directory.GetDirectories(wurzel))
            {
                if (string.Equals(Path.GetFullPath(d), Path.GetFullPath(ziel), StringComparison.OrdinalIgnoreCase)) continue;
                if (File.Exists(Path.Combine(d, "Skularis.exe"))) { try { LoescheOrdner(d); } catch { } }
            }

            // Beilagen an der Wurzel mit aktualisieren (v. a. die Patchnotes), damit
            // sie zur neuen Version passen. Nutzerdaten bleiben unberührt.
            string paketWurzel = Path.GetDirectoryName(neuProgramm);
            foreach (var name in new[] { "Patchnotes.txt", "Skularis Starten.bat" })
            {
                string q = Path.Combine(paketWurzel, name);
                if (File.Exists(q)) { try { File.Copy(q, Path.Combine(wurzel, name), true); } catch { } }
            }

            // Den Updater selbst erneuern, falls im Download eine andere Fassung liegt.
            ErneuereUpdater(paketWurzel);

            try { Directory.Delete(tmp, true); } catch { }

            Fertig("Skularis wurde auf Version " + neueVersion + " aktualisiert.\n\n" +
                   "Starte Skularis über \"Skularis Starten\".", MessageBoxIcon.Information);
            return 0;
        }
        catch (Exception ex)
        {
            Fertig("Das Update ist fehlgeschlagen:\n\n" + ex.Message +
                   "\n\nDeine vorhandene Version und deine Daten sind unverändert.", MessageBoxIcon.Warning);
            return 1;
        }
    }

    // --- GitHub ---

    // Fragt der Reihe nach alle Adressen ab; merkt sich das Repo, das antwortet.
    static string HoleNeuestenTag()
    {
        Exception letzter = null;
        foreach (var repo in Repos)
        {
            try
            {
                using (var wc = new WebClient())
                {
                    wc.Headers.Add("User-Agent", "Skularis-Updaten");
                    wc.Headers.Add("Accept", "application/vnd.github+json");
                    string json = wc.DownloadString(ApiUrl(repo));
                    var m = Regex.Match(json, "\"tag_name\"\\s*:\\s*\"([^\"]+)\"");
                    if (m.Success) { _repoGewaehlt = repo; return m.Groups[1].Value; }
                }
            }
            catch (Exception ex) { letzter = ex; }
        }
        if (letzter != null) throw letzter;
        return null;
    }

    static void LadeDatei(string url, string ziel)
    {
        using (var wc = new WebClient())
        {
            wc.Headers.Add("User-Agent", "Skularis-Updaten");
            wc.DownloadFile(url, ziel);
        }
    }

    static void PruefeZip(string pfad)
    {
        var fi = new FileInfo(pfad);
        if (!fi.Exists || fi.Length < 1024 * 1024) throw new Exception("Der Download ist unvollständig.");
        using (var fs = File.OpenRead(pfad))
        {
            if (fs.ReadByte() != 0x50 || fs.ReadByte() != 0x4B) throw new Exception("Der Download ist keine gültige ZIP-Datei.");
        }
    }

    // --- Selbst-Erneuerung ---

    // Liegt im Paket eine andere Fassung des Updaters, wird sie neben die eigene
    // gelegt und per Hilfsskript getauscht, sobald sich dieser Updater beendet.
    static void ErneuereUpdater(string paketWurzel)
    {
        try
        {
            string neuer = Path.Combine(paketWurzel, "Skularis Updaten.exe");
            if (!File.Exists(neuer)) return;
            string eigen = Process.GetCurrentProcess().MainModule.FileName;
            if (string.IsNullOrEmpty(eigen) || !File.Exists(eigen)) return;
            if (new FileInfo(neuer).Length == new FileInfo(eigen).Length) return; // gleiche Größe: nichts zu tun

            string neuTmp = eigen + ".neu";
            File.Copy(neuer, neuTmp, true);
            StarteSelbsttausch(eigen, neuTmp);
            Log("Der Updater wird beim Beenden auf den neuesten Stand gebracht.");
        }
        catch { /* Selbst-Erneuerung ist optional; bei Problemen bleibt der alte Updater */ }
    }

    static void StarteSelbsttausch(string eigen, string neu)
    {
        int pid = Process.GetCurrentProcess().Id;
        string cmd = Path.Combine(Path.GetTempPath(), "skularis-updater-swap-" + Guid.NewGuid().ToString("N") + ".cmd");
        string s =
            "@echo off\r\n" +
            ":warte\r\n" +
            "ping -n 2 127.0.0.1 >nul\r\n" +
            "tasklist /fi \"PID eq " + pid + "\" | find \"" + pid + "\" >nul && goto warte\r\n" +
            "move /y \"" + neu + "\" \"" + eigen + "\" >nul\r\n" +
            "del \"%~f0\"\r\n";
        File.WriteAllText(cmd, s, new System.Text.UTF8Encoding(false));
        var psi = new ProcessStartInfo("cmd.exe", "/c \"" + cmd + "\"");
        psi.CreateNoWindow = true;
        psi.UseShellExecute = false;
        psi.WindowStyle = ProcessWindowStyle.Hidden;
        Process.Start(psi);
    }

    // --- Versionen ---

    static string VersionAusName(string s)
    {
        if (string.IsNullOrEmpty(s)) return null;
        var m = Regex.Match(s, "(\\d+)\\.(\\d+)");
        return m.Success ? m.Groups[1].Value + "." + m.Groups[2].Value : null;
    }

    static bool IstNeuer(string remote, string lokal)
    {
        int[] r = Teile(remote), l = Teile(lokal);
        for (int i = 0; i < 2; i++)
        {
            if (r[i] > l[i]) return true;
            if (r[i] < l[i]) return false;
        }
        return false;
    }

    static int[] Teile(string v)
    {
        var p = (v ?? "0.0").Split('.');
        int a = 0, b = 0;
        int.TryParse(p.Length > 0 ? p[0] : "0", out a);
        int.TryParse(p.Length > 1 ? p[1] : "0", out b);
        return new[] { a, b };
    }

    // --- Ordner ---

    /** Direktes Unterverzeichnis, das Skularis.exe enthält. */
    static string FindeProgrammordner(string wurzel)
    {
        foreach (var d in Directory.GetDirectories(wurzel))
            if (File.Exists(Path.Combine(d, "Skularis.exe"))) return d;
        return null;
    }

    /** Verzeichnis mit Skularis.exe irgendwo im Baum (für das Entpackte). */
    static string FindeProgrammordnerTief(string wurzel)
    {
        var exe = Directory.GetFiles(wurzel, "Skularis.exe", SearchOption.AllDirectories).FirstOrDefault();
        return exe != null ? Path.GetDirectoryName(exe) : null;
    }

    static void SchliesseSkularis()
    {
        foreach (var p in Process.GetProcessesByName("Skularis"))
        {
            try { p.Kill(); p.WaitForExit(15000); } catch { }
        }
        Thread.Sleep(1500);
    }

    static void KopiereOrdner(string quelle, string ziel)
    {
        Directory.CreateDirectory(ziel);
        foreach (var datei in Directory.GetFiles(quelle))
            File.Copy(datei, Path.Combine(ziel, Path.GetFileName(datei)), true);
        foreach (var unter in Directory.GetDirectories(quelle))
            KopiereOrdner(unter, Path.Combine(ziel, Path.GetFileName(unter)));
    }

    static void LoescheOrdner(string dir)
    {
        for (int versuch = 0; versuch < 20; versuch++)
        {
            try { Directory.Delete(dir, true); return; }
            catch { Thread.Sleep(400); }
        }
        Directory.Delete(dir, true); // letzter Versuch, wirft ggf.
    }

    // --- Ausgabe ---

    static void Log(string text)
    {
        Console.WriteLine(text);
    }

    static void Fertig(string text, MessageBoxIcon icon)
    {
        try { if (_tonTimer != null) _tonTimer.Dispose(); } catch { }
        try { Console.Beep(880, 250); Console.Beep(1100, 250); } catch { }
        Console.WriteLine();
        Console.WriteLine(text.Replace("\n", " "));
        if (!_leise) { try { MessageBox.Show(text, "Skularis Updaten", MessageBoxButtons.OK, icon); } catch { } }
    }
}

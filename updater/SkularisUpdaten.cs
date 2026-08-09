/*
 * Skularis Updaten — eigenständiger Updater (kein Teil von Skularis selbst).
 *
 * Fenster statt Konsole: Nach dem Start öffnet sich ein kleines Fenster mit einer
 * Statuszeile (derselbe Text, den man auch als Warnton-Fortschritt hört), einem
 * Fortschrittsbalken, einer Ampel (erst rot, dann gelb während der Arbeit, dann
 * grün bei Erfolg) und einem OK-Knopf. Der OK-Knopf wird erst anklickbar, wenn
 * alles fertig ist, und bekommt dann den Fokus, damit ein Screenreader das
 * Ergebnis vorliest. Es öffnet sich KEIN Konsolenfenster mehr.
 *
 * Liegt im Portable-Wurzelordner, NEBEN dem Programmordner "Skularis x.xx".
 * Er tauscht diesen Geschwister-Programmordner aus und rührt die Nutzerdaten
 * (Charakter-Dateien, Abenteuer-Daten) nie an.
 *
 * Zwei Adressen: zuerst wird beim neuen Projekt (Sku75/Skularis) nach der
 * neuesten Version gefragt; klappt das nicht, wird auf die frühere Adresse
 * (Sku75/Skularis-alpha) zurückgegriffen.
 *
 * Selbst-Erneuerung: liegt im Download eine neuere Fassung dieses Updaters, wird
 * sie beim Beenden über ein kleines Hilfsskript ausgetauscht.
 *
 * Kompilieren (bordeigener .NET-Framework-Compiler), als Fenster-Programm ohne
 * Konsole:
 *   csc /target:winexe /out:"Skularis Updaten.exe" \
 *       /r:System.IO.Compression.FileSystem.dll /r:System.Windows.Forms.dll \
 *       /r:System.Drawing.dll SkularisUpdaten.cs
 */
using System;
using System.Diagnostics;
using System.Drawing;
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
    static UpdateFenster _fenster;
    static bool _leise = false;

    [STAThread]
    static int Main(string[] args)
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | (SecurityProtocolType)3072;

        // Testhaken: ein Dateipfad als Argument nutzt eine lokale ZIP statt
        // Download; "-leise" läuft ohne Fenster (für automatische Tests).
        string testZip = (args.Length > 0 && File.Exists(args[0])) ? args[0] : null;
        _leise = Array.IndexOf(args, "-leise") >= 0;

        // Warteton alle 10 Sekunden, solange der Updater arbeitet (hörbarer Fortschritt).
        _tonTimer = new System.Threading.Timer(_ => { try { Console.Beep(660, 180); } catch { } }, null, 10000, 10000);

        if (_leise)
        {
            // Kopfloser Lauf für Tests: einfach durcharbeiten, Ergebnis als Exitcode.
            try { Arbeite(testZip); return 0; }
            catch { return 1; }
        }

        try { Application.EnableVisualStyles(); } catch { }
        try { Application.SetCompatibleTextRenderingDefault(false); } catch { }
        _fenster = new UpdateFenster();

        // Die eigentliche Arbeit läuft im Hintergrund; die Oberfläche bleibt bedienbar.
        var arbeiter = new Thread(() =>
        {
            try
            {
                _fenster.Ampel(UpdateFenster.Gelb);
                string version = Arbeite(testZip);
                _fenster.Fertig(true, version == null
                    ? "Du hast bereits die neueste Version."
                    : ("Skularis wurde auf Version " + version + " aktualisiert. Starte Skularis über \"Skularis Starten\"."));
            }
            catch (Exception ex)
            {
                _fenster.Fertig(false, "Das Update ist fehlgeschlagen: " + ex.Message +
                    " Deine vorhandene Version und deine Daten sind unverändert.");
            }
        });
        arbeiter.IsBackground = true;
        _fenster.Shown += (s, e) => arbeiter.Start();

        Application.Run(_fenster);
        return _fenster.ErfolgreichBeendet ? 0 : 1;
    }

    static void Status(string text)
    {
        if (_fenster != null) _fenster.Status(text);
    }

    // Führt das Update aus. Rückgabe: neue Versionsnummer, oder null, wenn schon aktuell.
    static string Arbeite(string testZip)
    {
        string wurzel = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

        Status("Wird geprüft, bitte warten.");
        string altProgramm = FindeProgrammordner(wurzel);
        string lokal = altProgramm != null ? VersionAusName(Path.GetFileName(altProgramm)) : null;

        string tmp = Path.Combine(Path.GetTempPath(), "skularis-update-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tmp);
        string zip = Path.Combine(tmp, "Skularis-Portable.zip");
        string remote = null;

        if (testZip == null)
        {
            string tag = HoleNeuestenTag();
            remote = VersionAusName(tag);
            if (remote == null) throw new Exception("Konnte die neueste Version bei GitHub nicht lesen.");
            Status("Neueste Version: " + remote + ".");
            if (lokal != null && !IstNeuer(remote, lokal))
            {
                try { Directory.Delete(tmp, true); } catch { }
                return null; // schon aktuell
            }
            Status("Neue Version wird geladen. Das kann eine Minute dauern.");
            LadeDatei(AssetUrl(_repoGewaehlt), zip);
        }
        else
        {
            Status("Testmodus: lokale ZIP wird verwendet.");
            File.Copy(testZip, zip, true);
        }
        PruefeZip(zip);

        Status("Wird entpackt.");
        string extra = Path.Combine(tmp, "extra");
        Directory.CreateDirectory(extra);
        ZipFile.ExtractToDirectory(zip, extra);

        string neuProgramm = FindeProgrammordnerTief(extra);
        if (neuProgramm == null) throw new Exception("Im Download wurde kein Programmordner gefunden.");
        string neueVersion = VersionAusName(Path.GetFileName(neuProgramm)) ?? remote;

        Status("Skularis wird geschlossen, falls es läuft.");
        SchliesseSkularis();

        string ziel = Path.Combine(wurzel, Path.GetFileName(neuProgramm));
        Status("Neue Version wird eingespielt.");
        if (Directory.Exists(ziel)) LoescheOrdner(ziel);
        KopiereOrdner(neuProgramm, ziel);

        foreach (var d in Directory.GetDirectories(wurzel))
        {
            if (string.Equals(Path.GetFullPath(d), Path.GetFullPath(ziel), StringComparison.OrdinalIgnoreCase)) continue;
            if (File.Exists(Path.Combine(d, "Skularis.exe"))) { try { LoescheOrdner(d); } catch { } }
        }

        string paketWurzel = Path.GetDirectoryName(neuProgramm);
        foreach (var name in new[] { "Patchnotes.txt", "Skularis Starten.bat" })
        {
            string q = Path.Combine(paketWurzel, name);
            if (File.Exists(q)) { try { File.Copy(q, Path.Combine(wurzel, name), true); } catch { } }
        }

        ErneuereUpdater(paketWurzel);

        try { Directory.Delete(tmp, true); } catch { }
        return neueVersion;
    }

    // --- GitHub ---

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

    static void ErneuereUpdater(string paketWurzel)
    {
        try
        {
            string neuer = Path.Combine(paketWurzel, "Skularis Updaten.exe");
            if (!File.Exists(neuer)) return;
            string eigen = Process.GetCurrentProcess().MainModule.FileName;
            if (string.IsNullOrEmpty(eigen) || !File.Exists(eigen)) return;
            if (new FileInfo(neuer).Length == new FileInfo(eigen).Length) return;

            string neuTmp = eigen + ".neu";
            File.Copy(neuer, neuTmp, true);
            StarteSelbsttausch(eigen, neuTmp);
        }
        catch { /* optional; bei Problemen bleibt der alte Updater */ }
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

    static string FindeProgrammordner(string wurzel)
    {
        foreach (var d in Directory.GetDirectories(wurzel))
            if (File.Exists(Path.Combine(d, "Skularis.exe"))) return d;
        return null;
    }

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
        Directory.Delete(dir, true);
    }
}

// --- Das Fenster -----------------------------------------------------------

class UpdateFenster : Form
{
    public const int Rot = 0, Gelb = 1, Gruen = 2;

    Ampel _ampel;
    TextBox _status;      // read-only, fokussierbar: Screenreader kann den Verlauf lesen
    ProgressBar _balken;
    Button _ok;
    public bool ErfolgreichBeendet = false;

    public UpdateFenster()
    {
        Text = "Skularis Updaten";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        MinimizeBox = false;
        MaximizeBox = false;
        ControlBox = false;            // schließen nur über OK (kein Abbruch mitten im Update)
        ClientSize = new Size(500, 300);
        Font = new Font("Segoe UI", 11f);
        AccessibleName = "Skularis Updaten";

        var titel = new Label();
        titel.Text = "Skularis Updaten";
        titel.Font = new Font("Segoe UI", 15f, FontStyle.Bold);
        titel.AutoSize = true;
        titel.Location = new Point(64, 16);
        Controls.Add(titel);

        _ampel = new Ampel();
        _ampel.Location = new Point(16, 12);
        _ampel.Size = new Size(40, 108);
        _ampel.Zustand = Rot;
        Controls.Add(_ampel);

        _status = new TextBox();
        _status.Multiline = true;
        _status.ReadOnly = true;
        _status.ScrollBars = ScrollBars.Vertical;
        _status.TabStop = true;
        _status.Location = new Point(16, 60);
        _status.Size = new Size(468, 150);
        _status.Text = "Skularis Updaten. Wird geprüft, bitte warten.";
        _status.AccessibleName = "Fortschritt";
        Controls.Add(_status);

        _balken = new ProgressBar();
        _balken.Style = ProgressBarStyle.Marquee;
        _balken.MarqueeAnimationSpeed = 30;
        _balken.Location = new Point(16, 220);
        _balken.Size = new Size(468, 22);
        Controls.Add(_balken);

        _ok = new Button();
        _ok.Text = "OK";
        _ok.Enabled = false;
        _ok.Size = new Size(120, 36);
        _ok.Location = new Point(364, 252);
        _ok.DialogResult = DialogResult.OK;
        _ok.Click += (s, e) => Close();
        Controls.Add(_ok);
        AcceptButton = _ok;

        Shown += (s, e) => { try { _status.Select(0, 0); _status.Focus(); } catch { } };
    }

    void Ui(Action a)
    {
        try { if (InvokeRequired) Invoke(a); else a(); } catch { }
    }

    public void Status(string text)
    {
        Ui(() =>
        {
            _status.AppendText("\r\n" + text);
            _status.SelectionStart = _status.TextLength;
            _status.ScrollToCaret();
        });
    }

    public void Ampel(int zustand)
    {
        Ui(() => { _ampel.Zustand = zustand; _ampel.Invalidate(); });
    }

    public void Fertig(bool erfolg, string schlusstext)
    {
        ErfolgreichBeendet = erfolg;
        Ui(() =>
        {
            _ampel.Zustand = erfolg ? Gruen : Rot;
            _ampel.Invalidate();
            _balken.Style = ProgressBarStyle.Continuous;
            _balken.Maximum = 100;
            _balken.Value = erfolg ? 100 : 0;
            _status.AppendText("\r\n\r\n" + schlusstext);
            _status.SelectionStart = _status.TextLength;
            _status.ScrollToCaret();
            try { Console.Beep(880, 250); if (erfolg) Console.Beep(1100, 250); } catch { }
            // Der OK-Knopf trägt den Ergebnistext, damit ihn der Screenreader beim
            // Fokuswechsel vorliest.
            _ok.AccessibleName = schlusstext + " Schaltfläche OK.";
            _ok.Enabled = true;
            _ok.Focus();
        });
    }
}

// Eine kleine gezeichnete Ampel: drei Lichter, das aktive leuchtet.
class Ampel : Control
{
    int _zustand = 0; // 0 rot, 1 gelb, 2 grün
    public int Zustand { get { return _zustand; } set { _zustand = value; } }

    public Ampel()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
        AccessibleName = "Ampel";
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        int d = 28, x = 4;
        int[] ys = { 4, 40, 76 };
        Color[] an = { Color.FromArgb(230, 40, 40), Color.FromArgb(240, 200, 40), Color.FromArgb(50, 200, 70) };
        Color[] aus = { Color.FromArgb(70, 30, 30), Color.FromArgb(70, 65, 30), Color.FromArgb(30, 60, 35) };
        for (int i = 0; i < 3; i++)
        {
            using (var b = new SolidBrush(i == _zustand ? an[i] : aus[i]))
                g.FillEllipse(b, x, ys[i], d, d);
            using (var p = new Pen(Color.FromArgb(90, 90, 90)))
                g.DrawEllipse(p, x, ys[i], d, d);
        }
    }
}

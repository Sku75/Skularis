/**
 * Skularis Alpha 0.02.03 — Preload Script (Context Bridge)
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('skularis', {
  ipc: {
    dateiOeffnen:       ()          => ipcRenderer.invoke('skularis:datei-oeffnen'),
    dateiSpeichern:     (data)      => ipcRenderer.invoke('skularis:datei-speichern', data),
    dateiSpeichernAls:  (data)      => ipcRenderer.invoke('skularis:datei-speichern-als-dialog', data),
    dateiExportieren:   (data)      => ipcRenderer.invoke('skularis:datei-exportieren', data),
    dateiDirektLaden:   (pfad)      => ipcRenderer.invoke('skularis:datei-direkt-laden', { pfad }),
    datenbankLaden:     ()          => ipcRenderer.invoke('skularis:datenbank-laden'),
    configLesen:        ()          => ipcRenderer.invoke('skularis:config-lesen'),
    configSchreiben:    (key, val)  => ipcRenderer.invoke('skularis:config-schreiben', { key, value: val }),
    letzteDateien:      ()          => ipcRenderer.invoke('skularis:letzte-dateien'),
    letzteDateiMerken:  (pfad)      => ipcRenderer.invoke('skularis:letzte-datei-merken', { pfad }),
    oeffneRegelwerk:    ()          => ipcRenderer.invoke('skularis:oeffne-regelwerk'),
    appInfo:            ()          => ipcRenderer.invoke('skularis:app-info'),
    bibliothekListe:      ()        => ipcRenderer.invoke('skularis:bibliothek-liste'),
    bibliothekSpeichern:  (data)    => ipcRenderer.invoke('skularis:bibliothek-speichern', data),
    bibliothekLoeschen:   (pfad)    => ipcRenderer.invoke('skularis:bibliothek-loeschen', { pfad }),
    bibliothekSchreiben:  (data)    => ipcRenderer.invoke('skularis:bibliothek-schreiben', data),
    paketeListe:          (kat)     => ipcRenderer.invoke('skularis:pakete-liste', { kategorie: kat }),
    paketLaden:           (pfad)    => ipcRenderer.invoke('skularis:paket-laden', { pfad }),
    abenteuerListe:       ()        => ipcRenderer.invoke('skularis:abenteuer-liste'),
    abenteuerSpeichern:   (data)    => ipcRenderer.invoke('skularis:abenteuer-speichern', data),
    abenteuerLaden:       (pfad)    => ipcRenderer.invoke('skularis:abenteuer-laden', { pfad }),
    abenteuerLoeschen:    (pfad)    => ipcRenderer.invoke('skularis:abenteuer-loeschen', { pfad }),

    onMenuAktion:       (cb) => ipcRenderer.on('skularis:menu-aktion', (_e, d) => cb(d)),
    onDateiVonCli:      (cb) => ipcRenderer.on('skularis:datei-von-cli', (_e, d) => cb(d)),
    onVorSchliessen:    (cb) => ipcRenderer.on('skularis:vor-schliessen', () => cb()),
    antworteSchliessen: (ok) => ipcRenderer.send('skularis:schliessen-antwort', ok),
  },
});

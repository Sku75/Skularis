/**
 * Skularis — Native Menu Bar (5 Menus)
 */
const { Menu, app } = require('electron');

function buildMenu(win, version) {
  const send = (aktion, daten) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('skularis:menu-aktion', { aktion, ...daten });
    }
  };

  const template = [
    {
      label: 'Charaktererstellung',
      submenu: [
        { label: 'Letzten Charakter laden', click: () => send('letzten-laden') },
        { label: 'Neuen Charakter erstellen', accelerator: 'CmdOrCtrl+N', click: () => send('neu') },
        { label: 'Vorhandenen Charakter laden', accelerator: 'CmdOrCtrl+O', click: () => send('oeffnen') },
        { label: 'Geladenen Charakter speichern', accelerator: 'CmdOrCtrl+S', click: () => send('speichern') },
        { label: 'Speichern unter...', click: () => send('speichern-unter') },
        { label: 'Charakter exportieren (.txt)', click: () => send('exportieren') },
        { label: 'Charakter schließen', accelerator: 'CmdOrCtrl+W', click: () => send('schliessen') },
        { type: 'separator' },
        { label: 'Voriger Reiter', accelerator: 'Alt+Left', click: () => send('reiter-voriger') },
        { label: 'Nächster Reiter', accelerator: 'Alt+Right', click: () => send('reiter-naechster') },
        { label: 'Reiterliste', accelerator: 'Alt+R', click: () => send('reiterliste') },
      ],
    },
    {
      label: 'Charakter spielen',
      submenu: [
        { label: 'Letzten Charakter laden', click: () => send('platzhalter') },
        { label: 'Vorhandenen Charakter laden', click: () => send('platzhalter') },
        { label: 'Geladenen Charakter speichern', click: () => send('platzhalter') },
        { type: 'separator' },
        { label: 'Spielübersicht', enabled: false },
        { label: 'Würfel und Proben', enabled: false },
        { label: 'Kampfmodus', enabled: false },
      ],
    },
    {
      label: 'Meistermodus',
      submenu: [
        { label: 'Letztes Abenteuer laden', click: () => send('platzhalter') },
        { label: 'Neues Abenteuer', click: () => send('platzhalter') },
        { label: 'Abenteuer laden', click: () => send('platzhalter') },
        { label: 'Abenteuer speichern', click: () => send('platzhalter') },
        { type: 'separator' },
        { label: 'Spielercharakter laden', enabled: false },
        { label: 'Spielercharakter entfernen', enabled: false },
        { type: 'separator' },
        { label: 'Abenteuerübersicht', enabled: false },
        { label: 'Begegnungen verwalten', enabled: false },
        { label: 'Spielergruppe', enabled: false },
      ],
    },
    {
      label: 'Anpassen',
      submenu: [
        { label: 'Lauter', accelerator: 'CmdOrCtrl+Plus', click: () => send('lauter') },
        { label: 'Leiser', accelerator: 'CmdOrCtrl+-', click: () => send('leiser') },
        { label: 'Schrift vergrößern', accelerator: 'CmdOrCtrl+Shift+Plus', click: () => send('schrift-groesser') },
        { label: 'Schrift verkleinern', accelerator: 'CmdOrCtrl+Shift+-', click: () => send('schrift-kleiner') },
        { label: 'Schrift Normalgröße', accelerator: 'CmdOrCtrl+0', click: () => send('schrift-reset') },
        { type: 'separator' },
        { label: 'Sprachausgabe ein/aus', accelerator: 'CmdOrCtrl+M', click: () => send('sprache-toggle') },
        { label: 'Anpassen-Dialog', accelerator: 'CmdOrCtrl+L', click: () => send('anpassen-dialog') },
        { label: 'Tastenkombinationen-Liste', accelerator: 'CmdOrCtrl+T', click: () => send('tastenkombinationen') },
        { type: 'separator' },
        { label: 'Über Skularis', click: () => send('ueber') },
      ],
    },
    {
      label: 'Handbuch und Regeln',
      submenu: [
        { label: 'Ilaris Regelwerk', click: () => send('regelwerk') },
        { label: 'Handbuch Skularis', click: () => send('handbuch') },
        { label: 'Tastenbelegungsliste', click: () => send('tastenbelegung') },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };

const { app, BrowserWindow } = require('electron')
const path = require('path')

app.commandLine.appendSwitch('force-color-profile', 'srgb')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    title: 'Tarok',
    icon: path.join(__dirname, '../dist/favicon.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  win.loadFile(path.join(__dirname, '../dist/index.html'))
  win.setMenu(null)
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

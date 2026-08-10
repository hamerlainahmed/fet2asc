const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 700,
    title: 'FET to aSc Converter',
    icon: path.join(__dirname, 'icon.png'), // Using the new icon
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();
});

// Auto-updater events
autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'تحديث جديد',
    message: 'يتوفر تحديث جديد للبرنامج. جاري التحميل في الخلفية...'
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'question',
    title: 'تثبيت التحديث',
    message: 'تم تحميل التحديث بنجاح. هل تريد إغلاق البرنامج وتثبيت التحديث الآن؟',
    buttons: ['نعم', 'لاحقاً']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on('error', (error) => {
  console.error('Error in auto-updater.', error);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

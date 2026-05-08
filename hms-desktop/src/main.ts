import { app, BrowserWindow, Menu, globalShortcut } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { registerUpdaterIpcOnce, setUpdaterTargetWindow } from "./main/updater";

registerUpdaterIpcOnce();

// Simple logger for Electron main process (immediate console output)
const desktopLogger = {
  info: (msg: string, ...args: any[]) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[Desktop] ${timestamp} ${msg}`, ...args);
  },
  error: (msg: string, ...args: any[]) => {
    const timestamp = new Date().toLocaleTimeString();
    console.error(`[Desktop] ${timestamp} ❌ ${msg}`, ...args);
  },
  warn: (msg: string, ...args: any[]) => {
    const timestamp = new Date().toLocaleTimeString();
    console.warn(`[Desktop] ${timestamp} ⚠️ ${msg}`, ...args);
  },
  debug: (msg: string, ...args: any[]) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[Desktop] ${timestamp} 🔍 ${msg}`, ...args);
  },
};

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  desktopLogger.info('Electron squirrel startup detected, quitting...');
  app.quit();
}

desktopLogger.info('🚀 Starting ZenHosp Desktop Application...');

// Store reference to main window for menu actions
let mainWindow: BrowserWindow | null = null;

// Create application menu with DevTools toggle
const createMenu = () => {
  const template: any[] = [
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => {
            if (mainWindow) {
              if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
              } else {
                mainWindow.webContents.openDevTools();
              }
            }
          }
        },
        {
          label: 'Toggle Developer Tools (F12)',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
              } else {
                mainWindow.webContents.openDevTools();
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              // Close DevTools before reload
              if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
              }
              mainWindow.reload();
            }
          }
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            if (mainWindow) {
              // Close DevTools before reload
              if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
              }
              mainWindow.webContents.reloadIgnoringCache();
            }
          }
        },
        {
          role: 'toggleDevTools' as const,
          accelerator: 'F12'
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          role: 'minimize' as const,
          accelerator: 'CmdOrCtrl+M'
        },
        {
          role: 'close' as const,
          accelerator: 'CmdOrCtrl+W'
        }
      ]
    }
  ];

  // macOS specific menu
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' as const },
        { type: 'separator' },
        { role: 'services' as const },
        { type: 'separator' },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' },
        { role: 'quit' as const }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

const createWindow = () => {
  desktopLogger.info('Creating main window...');
  
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'ZenHosp - Hospital Management System', // Explicitly set window title
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // Content Security Policy settings
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Set Content Security Policy (injected on responses). Packaged app must allow
  // connect-src to remote API (e.g. AWS EC2), not only file:// + localhost.
  const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    let csp = '';

    if (isDevelopment) {
      // Development: HMR + devtools + Vite dev server + optional remote API (VITE_API_URL)
      csp = [
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:* data: blob:;",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*;",
        "style-src 'self' 'unsafe-inline';",
        "img-src 'self' data: blob: http://localhost:*;",
        "font-src 'self' data:;",
        "connect-src 'self' http: https: ws: wss: http://localhost:* ws://localhost:*;",
      ].join(' ');
    } else {
      // Packaged: no unsafe-eval; allow axios/fetch to deployed http(s) API (tighten to host later)
      csp = [
        "default-src 'self' 'unsafe-inline' data: blob:;",
        "script-src 'self' 'unsafe-inline';",
        "style-src 'self' 'unsafe-inline';",
        "img-src 'self' data: blob:;",
        "font-src 'self' data:;",
        "connect-src 'self' http: https: ws: wss: http://localhost:* ws://localhost:*;",
      ].join(' ');
    }
    
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });

  // Log window events
  mainWindow.on('closed', () => {
    desktopLogger.info('Main window closed');
    setUpdaterTargetWindow(null);
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    desktopLogger.info('Window loaded successfully');
    // Close DevTools after reload to prevent them from staying open
    if (mainWindow && mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
      desktopLogger.info('DevTools closed after reload');
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    desktopLogger.error('Window failed to load', { errorCode, errorDescription });
  });

  // Handle reload events - close DevTools if they're open
  mainWindow.webContents.on('will-reload', () => {
    if (mainWindow && mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
      desktopLogger.info('DevTools closed before reload');
    }
  });

  // Function to toggle DevTools
  const toggleDevTools = () => {
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
        desktopLogger.info('DevTools closed');
      } else {
        mainWindow.webContents.openDevTools();
        desktopLogger.info('DevTools opened');
      }
    }
  };

  // Register keyboard shortcuts that work when window has focus
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Toggle DevTools with F12
    if (input.key === 'F12') {
      event.preventDefault();
      toggleDevTools();
      return;
    }
    // Toggle DevTools with Ctrl+Shift+I (or Cmd+Shift+I on macOS)
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
      toggleDevTools();
      return;
    }
    // Handle Ctrl+R / Cmd+R - Close DevTools before reload
    if ((input.control || input.meta) && input.key.toLowerCase() === 'r' && !input.shift) {
      // Close DevTools if open, then allow default reload behavior
      if (mainWindow && mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
        desktopLogger.info('DevTools closed before reload (Ctrl+R)');
      }
      // Don't prevent default - let the reload happen
    }
  });

  // Load renderer: Vite dev server when unpackaged + Forge URL; packaged uses built HTML.
  const isPackaged = app.isPackaged;
  if (!isPackaged && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    desktopLogger.info('Loading from dev server:', MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else if (!isPackaged) {
    const devUrl = 'http://localhost:5173';
    desktopLogger.info('Loading from dev fallback:', devUrl);
    mainWindow.loadURL(devUrl);
  } else {
    const htmlPath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
    desktopLogger.info('Loading from file:', htmlPath);
    mainWindow.loadFile(htmlPath);
  }
  desktopLogger.info('DevTools disabled by default. Press F12 or Ctrl+Shift+I to open.');

  setUpdaterTargetWindow(mainWindow);
};

// Register global keyboard shortcuts (works even when window doesn't have focus)
const registerGlobalShortcuts = () => {
  // F12 shortcut
  const f12Registered = globalShortcut.register('F12', () => {
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  // Ctrl+Shift+I shortcut (Windows/Linux)
  const ctrlShiftIRegistered = globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  if (f12Registered && ctrlShiftIRegistered) {
    desktopLogger.info('Global shortcuts registered: F12, Ctrl+Shift+I');
  } else {
    desktopLogger.warn('Some global shortcuts could not be registered');
  }
};

// This method will be called when Electron has finished initialization
app.on("ready", () => {
  desktopLogger.info('Electron app ready');
  
  // Set application name (used in title bar and system menus)
  app.setName('ZenHosp - Hospital Management System');
  
  createMenu(); // Create application menu
  createWindow();
  registerGlobalShortcuts(); // Register global shortcuts after window is created
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  desktopLogger.info('All windows closed');
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  desktopLogger.info('App activated');
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Unregister all global shortcuts when app quits
app.on("will-quit", () => {
  desktopLogger.info('App will quit');
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  desktopLogger.info('App before quit');
});

// Log uncaught errors
process.on('uncaughtException', (error) => {
  desktopLogger.error('Uncaught exception', error);
});

process.on('unhandledRejection', (reason, promise) => {
  desktopLogger.error('Unhandled promise rejection', { reason, promise });
});

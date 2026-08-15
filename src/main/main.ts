import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import net from 'net';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs, createReadStream, existsSync } from 'fs';
import { FileService } from './services/FileService';
import { StorageService } from './services/StorageService';
import { CompilerService } from './services/CompilerService';
import { LanService } from './services/LanService';
import { ConnectOptions, NetworkState, AppSettings, LogLevel } from '../shared/types';
import { createRequire } from 'module';
import { createHash } from 'crypto';

// Remove unreliable __dirname in bundled environments
const require = createRequire(import.meta.url);

// FIX: Use app.getAppPath() for consistent path resolution in both Dev and Prod (ASAR)
const appPath = app.getAppPath();
const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;

// In production (ASAR), appPath points to .../resources/app.asar
const preload = path.join(appPath, 'dist-electron', 'preload.js');
const indexHtml = path.join(appPath, 'dist', 'index.html');

// Set environment variables for other modules if needed
process.env.DIST = path.join(appPath, 'dist');
process.env.PUBLIC = process.env.VITE_DEV_SERVER_URL ? path.join(appPath, 'public') : process.env.DIST;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

// --- Services & State ---
const storageService = new StorageService(app.getPath('userData'));
const fileService = new FileService();
let compilerService: CompilerService | null = null;
let nativeAddon: any = null; // Explicitly type as any to avoid 'never' inference
let networkState: NetworkState = { originalHost: '', currentHost: '', peers: [], myIP: '' };
let appSettings: AppSettings;
let isQuitting = false;
let isProxyActive = false;
let activeGameProcess: ChildProcess | null = null;
let activeGamePath: string | null = null;
let lanService: LanService | null = null;

// --- Logging bridge (renderer console) ---
const sendLog = (message: string, level: LogLevel = 'info') => {
  console.log(`[MNX] ${message}`);
  win?.webContents.send('cpp-log', { level, message, ts: Date.now() });
};

// --- Hotkey VK Code Mapping ---
const keyToVkCodeMap: { [key: string]: number } = { 'Backspace': 0x08, 'Tab': 0x09, 'Enter': 0x0D, 'Shift': 0x10, 'Control': 0x11, 'Alt': 0x12, 'CapsLock': 0x14, 'Escape': 0x1B, 'Space': 0x20, 'PageUp': 0x21, 'PageDown': 0x22, 'End': 0x23, 'Home': 0x24, 'ArrowLeft': 0x25, 'ArrowUp': 0x26, 'ArrowRight': 0x27, 'ArrowDown': 0x28, 'Insert': 0x2D, 'Delete': 0x2E, 'Meta': 0x5B, 'ContextMenu': 0x5D, 'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73, 'F5': 0x74, 'F6': 0x75, 'F7': 0x76, 'F8': 0x77, 'F9': 0x78, 'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B, ';': 0xBA, '=': 0xBB, ',': 0xBC, '-': 0xBD, '.': 0xBE, '/': 0xBF, '`': 0xC0, '[': 0xDB, '\\': 0xDC, ']': 0xDD, "'": 0xDE };
function getVkCode(key: string): number {
    if (key.length === 1) {
        if (key >= '0' && key <= '9') return key.charCodeAt(0);
        if (key.match(/[a-zA-Z]/)) return key.toUpperCase().charCodeAt(0);
    }
    return keyToVkCodeMap[key] || 0;
}

// --- Overlay IPC Server (Named Pipe -> in-game overlay) ---
const OVERLAY_PIPE_NAME = "\\\\.\\pipe\\mnx_overlay_pipe";
let overlayIpcServer: net.Server | null = null;
let overlaySocket: net.Socket | null = null;

function createOverlayIpcServer(squad: string[], playerName: string) {
    stopOverlayIpcServer();

    networkState.peers = squad;

    overlayIpcServer = net.createServer((socket) => {
        overlaySocket = socket;
        socket.setEncoding('utf8');
        socket.on('error', () => { /* pipe disconnects are normal */ });
        socket.on('close', () => {
            if (overlaySocket === socket) overlaySocket = null;
        });
        socket.write(JSON.stringify({
            t: 'init',
            squad,
            playerName,
            hostIp: networkState.currentHost,
        }) + '\n');
        sendLog(`Overlay client connected (${socket.remoteAddress ?? 'pipe'})`, 'success');
    });

    overlayIpcServer.on('error', (err) => {
        sendLog(`Overlay pipe error: ${err.message}`, 'error');
    });

    overlayIpcServer.listen(OVERLAY_PIPE_NAME, () => {
        sendLog(`Overlay pipe server listening on ${OVERLAY_PIPE_NAME}`, 'info');
    });
}

function stopOverlayIpcServer() {
    try { overlaySocket?.destroy(); } catch { /* ignore */ }
    overlaySocket = null;
    try { overlayIpcServer?.close(); } catch { /* ignore */ }
    overlayIpcServer = null;
}

function updateOverlaySocket() {
    if (!overlaySocket || overlaySocket.destroyed) return;
    try {
        overlaySocket.write(JSON.stringify({
            t: 'update',
            squad: networkState.peers,
            hostIp: networkState.currentHost,
        }) + '\n');
    } catch { /* ignore */ }
}

// --- Game Version & Executable Discovery ---
const EXCLUDED_EXE_HINTS = ['setup', 'install', 'unins', 'redist', 'vc_redist', 'dotnet', 'crash', 'launcher', 'dedicated', 'server'];

async function findGameExecutable(gamePath: string): Promise<string | null> {
    try {
        const entries = await fs.readdir(gamePath);
        const exes = entries.filter((f) => f.toLowerCase().endsWith('.exe'));

        const folderName = path.basename(gamePath).toLowerCase();
        const exact = exes.find((f) => f.toLowerCase().replace(/\.exe$/, '') === folderName);
        if (exact) return path.join(gamePath, exact);

        const candidates = await Promise.all(
            exes
                .filter((f) => !EXCLUDED_EXE_HINTS.some((hint) => f.toLowerCase().includes(hint)))
                .map(async (f) => {
                    let size = 0;
                    try { size = (await fs.stat(path.join(gamePath, f))).size; } catch { /* ignore */ }
                    return { file: f, size };
                })
        );

        candidates.sort((a, b) => b.size - a.size);
        return candidates.length > 0 ? path.join(gamePath, candidates[0].file) : null;
    } catch (err) {
        sendLog(`findGameExecutable failed: ${(err as Error).message}`, 'error');
        return null;
    }
}

async function getGameVersion(gamePath: string): Promise<string | null> {
    try {
        const exe = await findGameExecutable(gamePath);
        if (!exe) return null;
        const hash = createHash('md5');
        await new Promise<void>((resolve, reject) => {
            const stream = createReadStream(exe);
            stream.on('data', (chunk) => hash.update(chunk));
            stream.on('end', () => resolve());
            stream.on('error', reject);
        });
        return hash.digest('hex').slice(0, 8);
    } catch (err) {
        sendLog(`getGameVersion failed: ${(err as Error).message}`, 'error');
        return null;
    }
}

// --- LAN Discovery & Host Monitoring ---
let hostMonitorTimer: ReturnType<typeof setInterval> | null = null;

function setupLanDiscovery(gamePath: string) {
    stopLanDiscovery();

    lanService = new LanService(
        sendLog,
        (peer) => {
            win?.webContents.send('lan-peer-discovered', peer);
            // Auto-add to squad overlay stream
            if (!networkState.peers.includes(peer.ip)) {
                networkState.peers.push(peer.ip);
                updateOverlaySocket();
            }
        },
        (peer) => win?.webContents.send('lan-peer-updated', peer)
    );

    lanService.start(gamePath, appSettings.playerName);
}

function stopLanDiscovery() {
    lanService?.stop();
    lanService = null;
    stopHostMonitor();
}

function startHostMonitor(squadIPs: string[], hostIp: string) {
    stopHostMonitor();
    if (!lanService) return;

    const failureCounts = new Map<string, number>();
    hostMonitorTimer = setInterval(() => {
        if (!lanService) return;
        const alive = lanService.isPeerAlive(hostIp);

        if (!alive) {
            const failures = (failureCounts.get(hostIp) ?? 0) + 1;
            failureCounts.set(hostIp, failures);
            if (failures >= 3) {
                failureCounts.delete(hostIp);
                sendLog(`Host ${hostIp} unreachable. Triggering migration...`, 'warn');
                win?.webContents.send('network-state-changed', 'migrating');

                const candidates = squadIPs.filter((ip) => ip !== hostIp && lanService?.isPeerAlive(ip));
                if (candidates.length > 0) {
                    const newHost = candidates[0];
                    networkState.currentHost = newHost;
                    sendLog(`Host migrated to ${newHost}`, 'success');
                    win?.webContents.send('new-host', newHost);
                    updateOverlaySocket();
                } else {
                    sendLog('No alive candidates for migration.', 'warn');
                }

                setTimeout(() => win?.webContents.send('network-state-changed', 'stable'), 3000);
            }
        } else {
            failureCounts.set(hostIp, 0);
        }
    }, 3000);
}

function stopHostMonitor() {
    if (hostMonitorTimer) clearInterval(hostMonitorTimer);
    hostMonitorTimer = null;
}

// --- Native Addon ---
function loadNativeAddon() {
    try {
        const addonPath = fileService.getAddonPath();
        if (!addonPath || !existsSync(addonPath)) {
            nativeAddon = null;
            return;
        }
        delete require.cache[require.resolve(addonPath)];
        nativeAddon = require(addonPath);
        sendLog('Native addon loaded (shared memory bridge ready).', 'success');
    } catch (e) {
        nativeAddon = null;
        sendLog(`Failed to load native addon: ${(e as Error).message}`, 'error');
    }
}

// --- Tray & Window ---
const TRAY_ICON_PNG = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFElEQVR42mNkYGD4z0AEYBxVSF0FAF6aAqGfH4WfAAAAAElFTkSuQmCC';

function createTray() {
    const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_PNG}`);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip('MNX ONLINE FIX');
    updateTrayMenu();
    tray.on('click', () => {
        win?.show();
        win?.focus();
    });
}

function updateTrayMenu() {
    if (!tray) return;
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show MNX ONLINE FIX', click: () => { win?.show(); win?.focus(); } },
        { type: 'separator' },
        {
            label: isProxyActive ? `● PROXY ACTIVE → ${networkState.currentHost}` : '○ PROXY IDLE',
            enabled: false,
        },
        { type: 'separator' },
        { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(contextMenu);
}

async function createWindow() {
    appSettings = await storageService.getSettings();

    // 1. Remove the default menu (File, Edit, etc.)
    Menu.setApplicationMenu(null);

    win = new BrowserWindow({
        width: 1000,
        height: 700,
        title: 'MNX ONLINE FIX',
        icon: path.join(process.env.PUBLIC || '', 'favicon.ico'),
        frame: false, // We have a custom title bar
        autoHideMenuBar: true,
        webPreferences: {
          preload,
          contextIsolation: true,
          nodeIntegration: false,
        },
    });

    // 2. Register keyboard shortcut for DevTools
    win.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            win?.webContents.toggleDevTools();
            event.preventDefault();
        }
        if (input.key === 'F12') {
            win?.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    // 3. App state changes -> renderer (visibility)
    const emitVisibility = (isVisible: boolean) => {
        win?.webContents.send('app-state-changed', { isVisible });
    };
    win.on('show', () => emitVisibility(true));
    win.on('hide', () => emitVisibility(false));

    // 4. Minimize to tray on close
    win.on('close', (e) => {
        if (appSettings.minimizeToTray && !isQuitting) {
            e.preventDefault();
            win?.hide();
            sendLog('Minimized to tray.', 'info');
        }
    });

    compilerService = new CompilerService(win);

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        win.loadFile(indexHtml);
    }

    if (fileService.isProxyCompiled()) {
        loadNativeAddon();
    }

    // Set initial hotkey config in C++ addon after it's loaded
    if (nativeAddon?.setHotkeyConfiguration) {
        nativeAddon.setHotkeyConfiguration(appSettings.hotkey);
    }

    createTray();
    networkState.myIP = getMyIP();
}

app.on('before-quit', () => {
    isQuitting = true;
    if (isProxyActive && activeGamePath) {
        fileService.restoreOriginal(activeGamePath).catch(() => { /* best effort */ });
    }
    stopLanDiscovery();
    stopOverlayIpcServer();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    // Keep running in tray
});

// --- Local IP ---
function getMyIP(): string {
    const os = require('os');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] ?? []) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

// --- IPC Handlers ---
ipcMain.on('window-minimize', () => win?.minimize());
ipcMain.on('window-maximize', () => {
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});
ipcMain.on('window-close', () => win?.close());
ipcMain.handle('settings:get', () => storageService.getSettings());
ipcMain.handle('settings:save', async (event, settings: AppSettings) => {
    // Ensure vkCode is updated before saving and sending to C++
    if (settings.hotkey) {
        settings.hotkey.vkCode = getVkCode(settings.hotkey.key);
        if (nativeAddon?.setHotkeyConfiguration) {
            nativeAddon.setHotkeyConfiguration(settings.hotkey);
        }
    }
    appSettings = settings;
    return storageService.saveSettings(settings);
});

ipcMain.handle('identity:set-avatar', (event, data) => {
    if (nativeAddon?.setAvatarData) {
        try {
            nativeAddon.setAvatarData(data.buffer, data.width, data.height);
            sendLog(`Avatar registered (${data.width}x${data.height})`, 'success');
        } catch (e) {
            sendLog(`Failed to pass avatar to addon: ${(e as Error).message}`, 'error');
        }
    }
    return true;
});

ipcMain.handle('compiler:check-status', () => fileService.isProxyCompiled());
ipcMain.handle('compiler:start-setup', async () => {
    if (!compilerService) return false;
    const success = await compilerService.runSetup();
    if (success) loadNativeAddon();
    return success;
});

ipcMain.handle('dialog:select-game-directory', async () => {
  if (!win) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  });
  if (!canceled && filePaths.length > 0) {
    const gamePath = filePaths[0];
    const gameName = path.basename(gamePath);
    return { name: gameName, path: gamePath };
  }
  return null;
});

ipcMain.handle('storage:get-games', () => storageService.getGames());
ipcMain.handle('storage:save-games', (event, games) => storageService.saveGames(games));
ipcMain.handle('util:get-my-ip', () => getMyIP());

ipcMain.handle('game:get-version', (event, gamePath: string) => getGameVersion(gamePath));

ipcMain.handle('lan:start-discovery', (event, gamePath: string) => {
    setupLanDiscovery(gamePath);
    return true;
});
ipcMain.handle('lan:stop-discovery', () => {
    stopLanDiscovery();
    return true;
});

ipcMain.handle('network:get-stats', () => {
    // Prefer the live RUDP counters published by the proxy DLL in shared memory
    if (nativeAddon?.readNetworkStats) {
        try {
            return nativeAddon.readNetworkStats();
        } catch {
            // fall through to LAN discovery counters
        }
    }
    if (!lanService) {
        return { packetsSent: 0, packetsReceived: 0, bytesSent: 0, bytesReceived: 0 };
    }
    return {
        packetsSent: lanService.packetsSent,
        packetsReceived: lanService.packetsReceived,
        bytesSent: lanService.bytesSent,
        bytesReceived: lanService.bytesReceived,
    };
});

ipcMain.handle('network:connect', async (event, options: ConnectOptions) => {
    // Ensure the C++ addon has the latest hotkey config before launching
    if (nativeAddon?.setHotkeyConfiguration) {
        const latestSettings = await storageService.getSettings();
        nativeAddon.setHotkeyConfiguration(latestSettings.hotkey);
    }

    sendLog(`Connecting to host ${options.ip}...`, 'info');

    // 1. Create Overlay IPC Server
    createOverlayIpcServer(options.squadsIPs, options.playerName);

    // 2. Set network config in C++ addon (shared memory bridge)
    if (nativeAddon?.setNetworkConfiguration) {
        try {
            nativeAddon.setNetworkConfiguration({
                ...networkState,
                isHost: networkState.myIP === options.ip,
                currentHost: options.ip,
                peers: options.squadsIPs,
                playerName: options.playerName
            });
        } catch (e) {
            sendLog(`Addon config error: ${(e as Error).message}`, 'error');
        }
    }

    // 3. Inject the proxy DLL
    const injectionSuccess = await fileService.injectProxy(options.gamePath);
    if (!injectionSuccess) {
        sendLog('Injection failed — proxy binary missing or game folder invalid.', 'error');
        return false;
    }

    // 4. Find and launch the game executable
    const executablePath = await findGameExecutable(options.gamePath);
    if (!executablePath) {
        sendLog('Game executable not found in selected folder.', 'error');
        return false;
    }

    try {
        activeGameProcess = spawn(executablePath, [], { cwd: options.gamePath, detached: true, stdio: 'ignore' });
        if (activeGameProcess) {
            activeGamePath = options.gamePath;
            activeGameProcess.unref();
            isProxyActive = true;
            networkState.currentHost = options.ip;
            updateTrayMenu();
            sendLog(`Game launched: ${path.basename(executablePath)}`, 'success');

            // Auto-restore when the game exits
            activeGameProcess.on('exit', (code) => {
                sendLog(`Game process exited (code ${code}). Restoring original DLL...`, 'warn');
                if (activeGamePath) {
                    fileService.restoreOriginal(activeGamePath).then((ok) => {
                        sendLog(ok ? 'Original steam_api64.dll restored.' : 'Restore finished with warnings.', ok ? 'success' : 'warn');
                    });
                }
                isProxyActive = false;
                activeGamePath = null;
                updateTrayMenu();
            });

            // 5. Start host monitor (GHOST PROTOCOL migration)
            startHostMonitor(options.squadsIPs, options.ip);
            return true;
        }
        return false;
    } catch (error) {
        sendLog(`Failed to launch game: ${(error as Error).message}`, 'error');
        return false;
    }
});

ipcMain.handle('network:restore', async (event, gamePath: string) => {
    isProxyActive = false;
    activeGamePath = null;
    updateTrayMenu();
    stopHostMonitor();
    return fileService.restoreOriginal(gamePath);
});
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { Game, ConnectOptions, NetworkStateChange, PeerInfo, AppSettings, AppState, LogEntry } from '../shared/types';

type AvatarData = { buffer: Uint8Array; width: number; height: number; };

contextBridge.exposeInMainWorld('electron', {
  // Window & App State
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  onAppStateChange: (callback: (state: AppState) => void) => {
    const listener = (_event: any, state: any) => callback(state);
    ipcRenderer.on('app-state-changed', listener);
    return () => ipcRenderer.removeListener('app-state-changed', listener);
  },

  // File System (Drag & Drop)
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings): Promise<void> => ipcRenderer.invoke('settings:save', settings),

  // Identity
  setAvatar: (data: AvatarData) => ipcRenderer.send('identity:set-avatar', data),

  // Compiler API
  checkSetupStatus: (): Promise<boolean> => ipcRenderer.invoke('compiler:check-status'),
  startSetup: (): Promise<boolean> => ipcRenderer.invoke('compiler:start-setup'),
  onSetupProgress: (callback: (log: string) => void) => {
    const listener = (_event: any, log: any) => callback(log);
    ipcRenderer.on('setup-progress', listener);
    return () => ipcRenderer.removeListener('setup-progress', listener);
  },

  // LAN & Util API
  startLanDiscovery: (gamePath: string) => ipcRenderer.invoke('lan:start-discovery', gamePath),
  stopLanDiscovery: () => ipcRenderer.invoke('lan:stop-discovery'),
  onPeerDiscovered: (callback: (peer: PeerInfo) => void) => {
    const listener = (_event: any, peer: any) => callback(peer);
    ipcRenderer.on('lan-peer-discovered', listener);
    return () => ipcRenderer.removeListener('lan-peer-discovered', listener);
  },
  onPeerUpdated: (callback: (peer: PeerInfo) => void) => {
    const listener = (_event: any, peer: any) => callback(peer);
    ipcRenderer.on('lan-peer-updated', listener);
    return () => ipcRenderer.removeListener('lan-peer-updated', listener);
  },
  getMyIP: (): Promise<string> => ipcRenderer.invoke('util:get-my-ip'),
  getGameVersion: (gamePath: string): Promise<string | null> => ipcRenderer.invoke('game:get-version', gamePath),

  // C++ Logging API
  onCppLog: (callback: (log: LogEntry) => void) => {
    const listener = (_event: any, log: any) => callback(log);
    ipcRenderer.on('cpp-log', listener);
    return () => ipcRenderer.removeListener('cpp-log', listener);
  },

  // Host Migration Events
  onNetworkStateChange: (callback: (state: NetworkStateChange) => void) => {
    const listener = (_event: any, state: any) => callback(state);
    ipcRenderer.on('network-state-changed', listener);
    return () => ipcRenderer.removeListener('network-state-changed', listener);
  },
  onNewHost: (callback: (ip: string) => void) => {
    const listener = (_event: any, ip: any) => callback(ip);
    ipcRenderer.on('new-host', listener);
    return () => ipcRenderer.removeListener('new-host', listener);
  },

  // Live Stats
  getNetworkStats: (): Promise<any> => ipcRenderer.invoke('network:get-stats'),

  // Game & Network API
  selectGameDirectory: (): Promise<Game | null> => ipcRenderer.invoke('dialog:select-game-directory'),
  getGames: (): Promise<Game[]> => ipcRenderer.invoke('storage:get-games'),
  saveGames: (games: Game[]): Promise<void> => ipcRenderer.invoke('storage:save-games', games),
  connect: (options: ConnectOptions): Promise<boolean> => ipcRenderer.invoke('network:connect', options),
  restoreOriginal: (gamePath: string): Promise<boolean> => ipcRenderer.invoke('network:restore', gamePath)
});

declare global {
  interface Window {
    electron: {
      windowMinimize: () => void;
      windowMaximize: () => void;
      windowClose: () => void;
      onAppStateChange: (callback: (state: AppState) => void) => () => void;
      getPathForFile: (file: File) => string;

      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<void>;
      setAvatar: (data: AvatarData) => void;

      checkSetupStatus: () => Promise<boolean>;
      startSetup: () => Promise<boolean>;
      onSetupProgress: (callback: (log: string) => void) => () => void;

      startLanDiscovery: (gamePath: string) => void;
      stopLanDiscovery: () => void;
      onPeerDiscovered: (callback: (peer: PeerInfo) => void) => () => void;
      onPeerUpdated: (callback: (peer: PeerInfo) => void) => () => void;
      getMyIP: () => Promise<string>;
      getGameVersion: (gamePath: string) => Promise<string | null>;

      onCppLog: (callback: (log: LogEntry) => void) => () => void;
      onNetworkStateChange: (callback: (state: NetworkStateChange) => void) => () => void;
      onNewHost: (callback: (ip: string) => void) => () => void;
      getNetworkStats: () => Promise<any>;

      selectGameDirectory: () => Promise<Game | null>;
      getGames: () => Promise<Game[]>;
      saveGames: (games: Game[]) => Promise<void>;
      connect: (options: ConnectOptions) => Promise<boolean>;
      restoreOriginal: (gamePath: string) => Promise<boolean>;
    }
  }
}
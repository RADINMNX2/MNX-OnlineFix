export interface Game {
    name: string;
    path: string;
}

export interface PeerInfo {
    ip: string;
    version: string | null;
    ping?: number;
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface LogEntry {
    level: LogLevel;
    message: string;
    ts: number;
}

export interface NetworkStats {
    packetsSent: number;
    packetsReceived: number;
    bytesSent: number;
    bytesReceived: number;
}

export interface Hotkey {
    key: string; // e.g., "Tab", "F9"
    vkCode: number; // Virtual-Key Code
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
}

export interface AppSettings {
    minimizeToTray: boolean;
    playerName: string;
    avatarDataUrl?: string;
    hotkey: Hotkey;
}

export interface AppState {
    isVisible: boolean;
}

export interface ConnectOptions {
    gamePath: string;
    ip: string;
    squadsIPs: string[];
    playerName: string;
}

export interface NetworkState {
    originalHost: string;
    currentHost: string;
    peers: string[];
    myIP: string;
}

export type NetworkStateChange = 'stable' | 'migrating' | 'restoring';

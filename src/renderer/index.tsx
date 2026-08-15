import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("React Error Boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 text-red-500 bg-gray-900 h-screen overflow-auto">
          <h1 className="text-2xl font-bold mb-4">Application Crashed (White Screen Fix)</h1>
          <p className="mb-4">Please report this error to RADINMNX:</p>
          <pre className="bg-black p-4 rounded border border-red-800 whitespace-pre-wrap">
            {this.state.error?.toString()}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

if (typeof window !== 'undefined' && !window.electron) {
  const mockGamesKey = 'mnx_mock_games';
  const mockSettingsKey = 'mnx_mock_settings';
  
  const defaultSettings = {
    minimizeToTray: true,
    playerName: 'MNX_Agent',
    avatarDataUrl: undefined,
    hotkey: { key: 'Tab', vkCode: 0x09, ctrl: false, alt: false, shift: true }
  };

  const getSavedGames = () => {
    try {
      const saved = localStorage.getItem(mockGamesKey);
      return saved ? JSON.parse(saved) : [
        { name: 'Counter-Strike 2', path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike 2' },
        { name: 'Dota 2', path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\dota 2 beta' }
      ];
    } catch {
      return [];
    }
  };

  const saveGamesToStorage = (games: any[]) => {
    localStorage.setItem(mockGamesKey, JSON.stringify(games));
  };

  const getSavedSettings = () => {
    try {
      const saved = localStorage.getItem(mockSettingsKey);
      return saved ? JSON.parse(saved) : defaultSettings;
    } catch {
      return defaultSettings;
    }
  };

  const saveSettingsToStorage = (settings: any) => {
    localStorage.setItem(mockSettingsKey, JSON.stringify(settings));
  };

  const listeners: Record<string, Set<Function>> = {
    setupProgress: new Set(),
    appStateChange: new Set(),
    peerDiscovered: new Set(),
    cppLog: new Set(),
    networkStateChange: new Set(),
    newHost: new Set(),
  };

  window.electron = {
    windowMinimize: () => {
      console.log('[Mock Electron] windowMinimize');
    },
    windowMaximize: () => {
      console.log('[Mock Electron] windowMaximize');
    },
    windowClose: () => {
      console.log('[Mock Electron] windowClose');
    },
    getPathForFile: () => {
      return '';
    },
    onAppStateChange: (callback: any) => {
      listeners.appStateChange.add(callback);
      setTimeout(() => callback({ isVisible: true }), 100);
      return () => { listeners.appStateChange.delete(callback); };
    },
    getSettings: async () => {
      return getSavedSettings();
    },
    saveSettings: async (settings: any) => {
      saveSettingsToStorage(settings);
    },
    setAvatar: (data: any) => {
      console.log('[Mock Electron] setAvatar buffer size:', data.buffer.length);
    },
    checkSetupStatus: async () => {
      const status = localStorage.getItem('mnx_setup_complete');
      return status === 'true';
    },
    startSetup: async () => {
      const mockLogs = [
        'Initializing compiler service...',
        'Scanning system for C++ build environment...',
        'Compiling native shm_reader with MinGW...',
        'Linking mnx_steam_proxy.dll (v1.0.4)...',
        'Hijacking steam_api64 vtable handlers...',
        'Injecting custom overlay context (DX11 hook)...',
        'Verification signature matching passed.',
        'Binary compilation succeeded!'
      ];
      
      for (let i = 0; i < mockLogs.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 800));
        listeners.setupProgress.forEach(cb => cb(mockLogs[i]));
      }
      
      localStorage.setItem('mnx_setup_complete', 'true');
      return true;
    },
    onSetupProgress: (callback: any) => {
      listeners.setupProgress.add(callback);
      return () => { listeners.setupProgress.delete(callback); };
    },
    startLanDiscovery: (gamePath: string) => {
      console.log('[Mock Electron] startLanDiscovery for', gamePath);
      setTimeout(() => {
        const mockPeers = [
          { ip: '192.168.1.15', version: '1.0.4', ping: 12 },
          { ip: '192.168.1.42', version: '1.0.4', ping: 45 }
        ];
        mockPeers.forEach((peer, idx) => {
          setTimeout(() => {
            listeners.peerDiscovered.forEach(cb => cb(peer));
          }, idx * 1500);
        });
      }, 2000);
    },
    stopLanDiscovery: () => {
      console.log('[Mock Electron] stopLanDiscovery');
    },
    onPeerDiscovered: (callback: any) => {
      listeners.peerDiscovered.add(callback);
      return () => { listeners.peerDiscovered.delete(callback); };
    },
    onPeerUpdated: (callback: any) => {
      console.log('[Mock Electron] onPeerUpdated');
      return () => {};
    },
    getMyIP: async () => {
      return '192.168.1.25';
    },
    getGameVersion: async (gamePath: string) => {
      return '1.0.4';
    },
    onCppLog: (callback: any) => {
      setTimeout(() => {
        callback({ level: 'info', message: 'RUDP socket initialized on port 27015', ts: Date.now() });
        callback({ level: 'success', message: 'Shared memory bridge mounted (MNXS v1)', ts: Date.now() });
      }, 3000);
      return () => {};
    },
    onNetworkStateChange: (callback: any) => {
      return () => {};
    },
    onNewHost: (callback: any) => {
      return () => {};
    },
    getNetworkStats: async () => {
      return { packetsSent: 1284, packetsReceived: 1092, bytesSent: 482193, bytesReceived: 391044 };
    },
    selectGameDirectory: async () => {
      const names = ['Half-Life 2', 'Left 4 Dead 2', 'Portal 2', 'Lethal Company', 'Phasmophobia'];
      const name = names[Math.floor(Math.random() * names.length)];
      const formattedName = name.toLowerCase().replace(/\s+/g, '-');
      return {
        name,
        path: `C:\\Program Files (x86)\\Steam\\steamapps\\common\\${formattedName}`
      };
    },
    getGames: async () => {
      return getSavedGames();
    },
    saveGames: async (games: any) => {
      saveGamesToStorage(games);
    },
    connect: async (options: any) => {
      console.log('[Mock Electron] Connecting with options:', options);
      return true;
    },
    restoreOriginal: async (gamePath: string) => {
      console.log('[Mock Electron] Restoring original game files for:', gamePath);
      return true;
    }
  } as any;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
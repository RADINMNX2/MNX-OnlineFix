import React, { useState, useEffect, Suspense, useRef, useCallback } from 'react';
import { Game, PeerInfo, AppSettings, LogEntry, NetworkStats } from '../../shared/types';
import { Settings, PlusCircle, Power, Eraser, Gamepad2 } from 'lucide-react';
import { Loader } from './Loader';
import { useToast } from '../context/ToastContext';
import { CommandPalette, CommandItem } from './CommandPalette';

const GameManager = React.lazy(() => import('./GameManager'));
const OnlineFixPanel = React.lazy(() => import('./OnlineFixPanel'));
const SquadManager = React.lazy(() => import('./SquadManager'));
const ConsoleOutput = React.lazy(() => import('./ConsoleOutput'));
const VersionMismatchModal = React.lazy(() => import('./VersionMismatchModal'));
const SettingsPanel = React.lazy(() => import('./SettingsPanel'));

export const Lobby: React.FC = () => {
  const toast = useToast();
  const [games, setGames] = useState<Game[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(true);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [discoveredPeers, setDiscoveredPeers] = useState<Map<string, PeerInfo>>(new Map());
  const [squad, setSquad] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [myIP, setMyIP] = useState<string>('');
  const [currentHost, setCurrentHost] = useState<string>('');
  const [localVersion, setLocalVersion] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [stats, setStats] = useState<NetworkStats | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal & Panel State
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mismatchedPeers, setMismatchedPeers] = useState<PeerInfo[]>([]);
  const [pendingConnection, setPendingConnection] = useState<{ hostIp: string; squadIPs: string[] } | null>(null);
  const isConnectedRef = useRef(false);

  const addLog = useCallback((message: string, level: LogEntry['level'] = 'info') => {
    setLogs((prev) => [...prev.slice(-199), { level, message, ts: Date.now() }]);
  }, []);

  const syncSquadWithPeers = useCallback((peers: Map<string, PeerInfo>) => {
    setSquad((prev) => prev.filter((ip) => peers.has(ip) || ip === myIP));
  }, [myIP]);

  // ---- Initial load ----
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [savedGames, settings, ip] = await Promise.all([
          window.electron.getGames(),
          window.electron.getSettings(),
          window.electron.getMyIP(),
        ]);

        setGames(savedGames);
        setPlayerName(settings.playerName);
        setAvatarUrl(settings.avatarDataUrl);
        setMyIP(ip);
        setCurrentHost(ip);
        addLog(`Interface initialized. Local IP: ${ip}`, 'success');

        if (savedGames.length > 0) {
          setSelectedGame(savedGames[0]);
        }
      } catch (err: any) {
        addLog(`Failed to load initial data: ${err?.message ?? err}`, 'error');
      } finally {
        setIsLoadingGames(false);
      }
    };
    loadInitialData();
  }, [addLog]);

  // ---- Subscriptions ----
  useEffect(() => {
    const unsubPeer = window.electron.onPeerDiscovered((peer) => {
      setDiscoveredPeers((prev) => {
        if (prev.has(peer.ip)) return prev;
        const next = new Map(prev);
        next.set(peer.ip, peer);
        syncSquadWithPeers(next);
        return next;
      });
      toast.info('Peer Discovered', `${peer.ip}${peer.version ? ` — v${peer.version}` : ''}`, 2500);
      addLog(`Peer discovered: ${peer.ip} (${peer.version ?? 'unknown version'})`, 'success');
    });
    const unsubPeerUpdate = window.electron.onPeerUpdated((peer) => {
      setDiscoveredPeers((prev) => {
        const next = new Map(prev);
        next.set(peer.ip, peer);
        return next;
      });
    });
    const unsubLog = window.electron.onCppLog((log) => {
      addLog(log.message, log.level);
    });
    const unsubHost = window.electron.onNewHost((ip) => {
      setCurrentHost(ip);
      toast.warning('Host Migration', `New host elected: ${ip}`, 4000);
      addLog(`Host migrated to ${ip}`, 'warn');
    });

    return () => {
      unsubPeer();
      unsubPeerUpdate();
      unsubLog();
      unsubHost();
    };
  }, [addLog, syncSquadWithPeers, toast]);

  // ---- Selected game: version + discovery ----
  useEffect(() => {
    if (!selectedGame) return;
    let cancelled = false;

    const loadGameInfo = async () => {
      try {
        const version = await window.electron.getGameVersion(selectedGame.path);
        if (!cancelled) {
          setLocalVersion(version);
          addLog(`Game version detected: ${version ?? 'N/A'}`, version ? 'success' : 'warn');
        }
      } catch (err: any) {
        if (!cancelled) addLog(`Version check failed: ${err?.message ?? err}`, 'error');
      }
      if (!cancelled) {
        window.electron.startLanDiscovery(selectedGame.path);
        addLog(`LAN discovery started for ${selectedGame.name}...`, 'info');
      }
    };
    loadGameInfo();

    return () => {
      cancelled = true;
    };
  }, [selectedGame, addLog]);

  // ---- Live stats polling (while connected) ----
  useEffect(() => {
    if (!isConnectedRef.current) return;
    const timer = setInterval(async () => {
      try {
        const s = await window.electron.getNetworkStats();
        if (s && typeof s.packetsSent === 'number') setStats(s);
      } catch {
        /* stats endpoint not ready */
      }
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // ---- Identity ----
  const handleIdentityChange = async (settings: Partial<AppSettings>) => {
    const currentSettings = await window.electron.getSettings();
    const newSettings = { ...currentSettings, ...settings };
    await window.electron.saveSettings(newSettings);
    if (settings.playerName) setPlayerName(settings.playerName);
    if (settings.avatarDataUrl) setAvatarUrl(settings.avatarDataUrl);
  };

  const processAndSetAvatar = (file: File) => {
    if (file.size > 7 * 1024 * 1024) {
      toast.error('File Too Large', 'Please select an image under 7MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const AVATAR_SIZE = 64;
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

        const dataUrl = canvas.toDataURL('image/png');
        handleIdentityChange({ avatarDataUrl: dataUrl });
        toast.success('Avatar Updated', 'Your hacker identity has been updated.');

        const imageData = ctx?.getImageData(0, 0, AVATAR_SIZE, AVATAR_SIZE);
        if (imageData) {
          window.electron.setAvatar({
            buffer: new Uint8Array(imageData.data.buffer),
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
          });
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSettingsClose = async () => {
    setIsSettingsOpen(false);
    const settings = await window.electron.getSettings();
    setPlayerName(settings.playerName);
    setAvatarUrl(settings.avatarDataUrl);
  };

  // ---- Game management ----
  const persistGames = async (updated: Game[]) => {
    setGames(updated);
    await window.electron.saveGames(updated);
  };

  const handleAddGame = async () => {
    const newGame = await window.electron.selectGameDirectory();
    if (newGame) {
      if (games.some((g) => g.path === newGame.path)) {
        toast.info('Already Added', `${newGame.name} is already in your library.`);
        setSelectedGame(newGame);
        return;
      }
      const updated = [...games, newGame];
      await persistGames(updated);
      setSelectedGame(newGame);
      toast.success('Game Added', `${newGame.name} imported to library.`);
      addLog(`Game added: ${newGame.name} @ ${newGame.path}`, 'success');
    }
  };

  const handleAddGamePath = async (path: string) => {
    if (games.some((g) => g.path === path)) {
      toast.info('Already Added', 'This game is already in your library.');
      const existing = games.find((g) => g.path === path);
      if (existing) setSelectedGame(existing);
      return;
    }
    const name = path.split(/[\\/]/).pop() || 'Unknown Game';
    const newGame: Game = { name, path };
    const updated = [...games, newGame];
    await persistGames(updated);
    setSelectedGame(newGame);
    toast.success('Game Added', `${name} imported via drag & drop.`);
    addLog(`Game added (DnD): ${name} @ ${path}`, 'success');
  };

  // ---- Connection flow ----
  const proceedWithConnection = async (): Promise<boolean> => {
    if (!pendingConnection || !selectedGame) return false;
    const { hostIp, squadIPs } = pendingConnection;
    isConnectedRef.current = true;
    try {
      const success = await window.electron.connect({
        gamePath: selectedGame.path,
        ip: hostIp,
        squadsIPs: squadIPs,
        playerName,
      });
      if (success) {
        setCurrentHost(hostIp);
        addLog(`Connected to host ${hostIp} — proxy injected & game launched.`, 'success');
      } else {
        isConnectedRef.current = false;
        addLog('Connection failed: injection or launch error.', 'error');
      }
      return success;
    } catch (err: any) {
      isConnectedRef.current = false;
      addLog(`Connection error: ${err?.message ?? err}`, 'error');
      return false;
    }
  };

  const handleConnectionAttempt = async (hostIp: string, squadIPs: string[]): Promise<boolean> => {
    setPendingConnection({ hostIp, squadIPs });

    const mismatched = squadIPs
      .map((ip) => discoveredPeers.get(ip))
      .filter((p): p is PeerInfo => !!p && !!p.version && p.version !== 'N/A' && !!localVersion && p.version !== localVersion);

    if (mismatched.length > 0) {
      setMismatchedPeers(mismatched);
      setIsVersionModalOpen(true);
      return false; // Abort; user must confirm via modal
    }

    return proceedWithConnection();
  };

  const handleDisconnect = async () => {
    if (!selectedGame) return;
    try {
      const ok = await window.electron.restoreOriginal(selectedGame.path);
      isConnectedRef.current = false;
      addLog(ok ? 'Original steam_api64.dll restored.' : 'Restore completed with warnings.', ok ? 'success' : 'warn');
    } catch (err: any) {
      addLog(`Restore error: ${err?.message ?? err}`, 'error');
    }
  };

  // ---- Command palette ----
  const commands: CommandItem[] = [
    {
      id: 'add-game',
      section: 'Actions',
      label: 'Add Game',
      hint: 'Ctrl+K',
      icon: PlusCircle,
      keywords: 'add game import library folder',
      onSelect: () => handleAddGame(),
    },
    {
      id: 'settings',
      section: 'Actions',
      label: 'Open Settings',
      icon: Settings,
      keywords: 'settings options hotkey overlay avatar identity',
      onSelect: () => setIsSettingsOpen(true),
    },
    {
      id: 'disconnect',
      section: 'Actions',
      label: 'Disconnect & Restore',
      icon: Power,
      keywords: 'disconnect restore dll restore original',
      onSelect: () => handleDisconnect(),
    },
    {
      id: 'clear-console',
      section: 'Actions',
      label: 'Clear Console',
      icon: Eraser,
      keywords: 'clear console logs terminal',
      onSelect: () => setLogs([]),
    },
    ...games.map((game) => ({
      id: `game-${game.path}`,
      section: 'Games',
      label: game.name,
      hint: 'Select',
      icon: Gamepad2,
      keywords: game.path,
      onSelect: () => setSelectedGame(game),
    })),
  ];

  const squadPeers = squad
    .map((ip) => discoveredPeers.get(ip))
    .filter((p): p is PeerInfo => !!p && p.ip !== myIP);

  return (
    <>
      <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && processAndSetAvatar(e.target.files[0])} accept="image/png, image/jpeg, image/gif" hidden />
      <CommandPalette commands={commands} />

      <Suspense fallback={<div />}>
        <VersionMismatchModal
          isOpen={isVersionModalOpen}
          localVersion={localVersion}
          mismatchedPeers={mismatchedPeers}
          onConfirm={() => {
            setIsVersionModalOpen(false);
            proceedWithConnection();
          }}
          onCancel={() => setIsVersionModalOpen(false)}
        />
        <SettingsPanel isOpen={isSettingsOpen} onClose={handleSettingsClose} onAvatarChange={() => fileInputRef.current?.click()} />
      </Suspense>

      <div className="h-full flex flex-col">
        <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
          <div className="lg:col-span-1 flex flex-col gap-6 min-h-0">
            <Suspense fallback={<Loader />}>
              <GameManager
                games={games}
                selectedGame={selectedGame}
                isLoading={isLoadingGames}
                onSelectGame={setSelectedGame}
                onAddGame={handleAddGame}
                onAddGamePath={handleAddGamePath}
              />
              <SquadManager
                discoveredPeers={Array.from(discoveredPeers.values())}
                onSquadChange={setSquad}
                myIP={myIP}
                currentHost={currentHost}
                localVersion={localVersion}
                playerName={playerName}
                avatarUrl={avatarUrl}
                isScanning
                onPlayerNameChange={(name) => handleIdentityChange({ playerName: name })}
                onAvatarChange={() => fileInputRef.current?.click()}
              />
            </Suspense>
          </div>
          <div className="lg:col-span-3 min-h-0">
            <Suspense fallback={<Loader />}>
              {selectedGame ? (
                <OnlineFixPanel
                  game={selectedGame}
                  squad={squad}
                  onConnect={handleConnectionAttempt}
                  onDisconnect={handleDisconnect}
                  currentHost={currentHost}
                  playerName={playerName}
                  peers={squadPeers}
                  stats={stats}
                />
              ) : (
                <div className="h-full flex items-center justify-center bg-black/30 backdrop-blur-sm border border-gray-800 rounded-lg">
                  <p className="text-gray-400 text-lg">Please add a game from the library to begin.</p>
                </div>
              )}
            </Suspense>
          </div>
        </div>
        <div className="mt-6 flex justify-between items-end">
          <div className="flex-grow pr-4 min-w-0">
            <Suspense fallback={<div />}>
              <ConsoleOutput logs={logs} onClear={() => setLogs([])} />
            </Suspense>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-gray-500 hover:text-neon-red transition-colors" title="Settings">
            <Settings />
          </button>
        </div>
      </div>
    </>
  );
};

// FIX: Add default export to be used with React.lazy
export default Lobby;

// Re-export lazy components for cleaner imports if needed elsewhere
export { GameManager, OnlineFixPanel, SquadManager, ConsoleOutput, VersionMismatchModal, SettingsPanel };
import React, { useState, useEffect, useContext } from 'react';
import { Game, PeerInfo, NetworkStats } from '../../shared/types';
import { motion } from 'framer-motion';
import { Zap, Power } from 'lucide-react';
import { AppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { NetworkRadar } from './NetworkRadar';
import { ConfirmDialog } from './ModalShell';

interface OnlineFixPanelProps {
  game: Game;
  squad: string[];
  currentHost: string;
  playerName: string;
  peers: PeerInfo[];
  stats?: NetworkStats;
  onConnect: (hostIp: string, squadIPs: string[]) => Promise<boolean>;
  onDisconnect: () => Promise<void>;
}

const Particle = () => {
  const x = (Math.random() - 0.5) * 50;
  const y = (Math.random() - 0.5) * 50;
  const destX = (Math.random() - 0.5) * 400;
  const destY = (Math.random() - 0.5) * 400;

  return (
    <motion.div
      initial={{ x: x, y: y, opacity: 1, scale: 0.5 }}
      animate={{ x: destX, y: destY, opacity: 0, scale: 0 }}
      transition={{ duration: Math.random() * 0.8 + 0.5, ease: "easeOut" }}
      className="absolute w-1.5 h-1.5 bg-neon-red rounded-full shadow-[0_0_8px_#ff0000]"
    />
  );
};

export const OnlineFixPanel: React.FC<OnlineFixPanelProps> = ({ game, squad, currentHost, playerName, peers, stats, onConnect, onDisconnect }) => {
  const { isVisible } = useContext(AppContext);
  const toast = useToast();
  const [hostIp, setHostIp] = useState('127.0.0.1');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  useEffect(() => { setHostIp(currentHost); }, [currentHost]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const success = await onConnect(hostIp, squad);
      if (success) {
        setIsConnected(true);
        setShowParticles(true);
        toast.success('Link Established', `Proxying traffic to ${hostIp}`, 3200);
        setTimeout(() => setShowParticles(false), 2000);
      } else {
        toast.error('Connection Failed', 'Injection failed. Check the game path and proxy binary.', 5000);
      }
    } catch (err: any) {
      toast.error('Connection Error', err?.message ?? 'An unexpected error occurred.', 5000);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConfirmDisconnect = async () => {
    setShowDisconnectConfirm(false);
    try {
      await onDisconnect();
      setIsConnected(false);
      toast.info('Link Terminated', 'Original steam_api64.dll restored.');
    } catch (err: any) {
      toast.error('Restore Failed', err?.message ?? 'Could not restore the original DLL.', 5000);
    }
  };

  const buttonPulseAnimation = isVisible ? { scale: [1, 1.03, 1], opacity: [0.3, 0.5, 0.3] } : {};

  return (
    <>
      <ConfirmDialog
        isOpen={showDisconnectConfirm}
        title="Terminate Connection?"
        description="The proxy DLL will be removed and the original steam_api64.dll restored. If the game is still running, restart it to continue playing normally."
        confirmLabel="Disconnect"
        tone="danger"
        onConfirm={handleConfirmDisconnect}
        onCancel={() => setShowDisconnectConfirm(false)}
      />

      <motion.div
        key={game.path} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
        className="h-full p-6 bg-black/70 backdrop-blur-xl border border-neon-red/50 rounded-lg flex flex-col justify-center items-center shadow-lg shadow-neon-red/20 animate-glow overflow-y-auto min-h-0"
      >
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white">{game.name}</h2>
          <p className="text-sm text-gray-500 mb-8 truncate max-w-md mx-auto">{game.path}</p>
        </div>

        <div className="w-full max-w-sm mb-6 relative group">
          <div className="absolute inset-0 bg-neon-red/5 rounded-lg blur-md group-hover:bg-neon-red/10 transition-colors"></div>
          <label htmlFor="host-ip" className="relative block text-xs font-bold text-neon-red mb-2 text-center tracking-widest uppercase">Target Host IP</label>
          <input id="host-ip" type="text" value={hostIp} onChange={e => setHostIp(e.target.value)} disabled={isConnected || isConnecting}
              className="relative w-full text-center bg-black/80 border border-gray-700 rounded-lg px-4 py-4 text-white font-mono text-xl focus:outline-none focus:border-neon-red focus:shadow-[0_0_15px_rgba(255,0,0,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed placeholder-gray-700"
              placeholder="0.0.0.0"
          />
        </div>

        <div className="w-full max-w-sm mb-6">
          <NetworkRadar
            peers={peers.map(p => ({ ip: p.ip, ping: p.ping, isHost: p.ip === currentHost }))}
            stats={stats}
            isActive={isConnected}
            playerName={playerName}
            hostIp={hostIp}
          />
        </div>

        <div className="relative">
          <motion.button
            onClick={isConnected ? () => setShowDisconnectConfirm(true) : handleConnect}
            disabled={isConnecting}
            className={`relative w-72 h-16 flex items-center justify-center font-bold rounded-lg transition-all duration-300 text-lg tracking-widest overflow-hidden border ${isConnected ? 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500' : 'bg-black border-neon-red text-white hover:bg-neon-red hover:text-black shadow-[0_0_20px_rgba(255,0,0,0.4)]'} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {!isConnected && !isConnecting && <div className="absolute inset-0 bg-neon-red/10" />}
            {!isConnected && <motion.div className="absolute inset-0 bg-neon-red" animate={buttonPulseAnimation} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} style={{ opacity: 0.1 }} />}

            {isConnected ? <Power className="w-5 h-5 mr-3 z-10" /> : <Zap className={`w-5 h-5 mr-3 z-10 ${isConnecting ? 'animate-pulse' : ''}`} />}
            <span className="z-10">{isConnecting ? 'INJECTING...' : (isConnected ? 'DISCONNECT' : 'CONNECT')}</span>
          </motion.button>

          {isVisible && showParticles && (
            <div className="absolute inset-0 flex justify-center items-center pointer-events-none z-20">
              {Array.from({ length: 40 }).map((_, i) => (<Particle key={i} />))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};
export default OnlineFixPanel;
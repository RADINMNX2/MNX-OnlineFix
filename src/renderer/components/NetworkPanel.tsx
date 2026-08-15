import React, { useState } from 'react';
import { Game } from '../../shared/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, Users, Server, ChevronRight } from 'lucide-react';

interface NetworkPanelProps {
  game: Game;
}

const simulatedPlayers = [
  { id: 1, name: 'PlayerOne', ping: '23ms' },
  { id: 2, name: 'MNX_Player', ping: '45ms' },
  { id: 3, name: 'Guest_782', ping: '61ms' },
];

export const NetworkPanel: React.FC<NetworkPanelProps> = ({ game }) => {
  const [ip, setIp] = useState('127.0.0.1');
  const [port, setPort] = useState('27015');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    
    try {
      // Call main process to inject DLL and set IP
      // Using dummy values for squadsIPs and playerName for the simple network panel
      const success = await window.electron.connect({ 
        gamePath: game.path, 
        ip, 
        squadsIPs: [], 
        playerName: 'Agent' 
      });
      
      if(success) {
        setIsConnected(true);
      } else {
        alert("Failed to connect. Make sure the game path is correct and the proxy DLL exists.");
      }
    } catch (error) {
      console.error("Connection error:", error);
      alert("An error occurred during connection.");
    }

    // Simulate connection time
    setTimeout(() => {
        setIsConnecting(false);
    }, 2000);
  };
  
  const handleDisconnect = async () => {
    await window.electron.restoreOriginal(game.path);
    setIsConnected(false);
  };

  return (
    <div className="h-full p-6 bg-black/50 backdrop-blur-md border border-neon-red/30 rounded-lg flex flex-col justify-between">
      <div>
        <h2 className="text-2xl font-bold mb-1 text-white">{game.name}</h2>
        <p className="text-xs text-gray-500 mb-6 truncate">{game.path}</p>

        {/* Network Settings */}
        <div className="space-y-4 mb-8">
          <div className="relative">
            <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
            <input type="text" value={ip} onChange={e => setIp(e.target.value)} disabled={isConnected}
                   className="w-full bg-gray-900/70 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-neon-red transition-all" />
          </div>
          <div className="relative">
            <ChevronRight className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
            <input type="text" value={port} onChange={e => setPort(e.target.value)} disabled={isConnected}
                   className="w-full bg-gray-900/70 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-neon-red transition-all" />
          </div>
        </div>

        {/* Room Discovery */}
        <div className="bg-black/30 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-3 flex items-center"><Users className="w-5 h-5 mr-2 text-neon-red"/>Room Discovery</h3>
          <div className="space-y-2">
            {simulatedPlayers.map(p => (
              <div key={p.id} className="flex justify-between items-center bg-gray-800/50 p-2 rounded-md">
                <span className="text-gray-300">{p.name}</span>
                <span className="text-xs text-green-400">{p.ping}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Connect Button */}
      <div className="mt-6">
        {isConnected ? (
             <motion.button
                onClick={handleDisconnect}
                className="w-full relative flex items-center justify-center p-4 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-all duration-200"
            >
                Disconnect
            </motion.button>
        ) : (
            <motion.button
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full relative flex items-center justify-center p-4 bg-neon-red/80 hover:bg-neon-red text-white font-bold rounded-lg transition-all duration-200 shadow-lg shadow-neon-red/30"
                animate={{ scale: isConnecting ? 1 : [1, 1.03, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
                <AnimatePresence>
                {isConnecting && (
                    <motion.div
                    className="absolute inset-0 rounded-lg border-2 border-neon-red"
                    initial={{ scale: 0.5, opacity: 0.7 }}
                    animate={{ scale: 2.5, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                    />
                )}
                </AnimatePresence>
                <Wifi className="w-5 h-5 mr-2" />
                {isConnecting ? 'Connecting...' : 'Connect'}
            </motion.button>
        )}
      </div>
    </div>
  );
};
export default NetworkPanel;
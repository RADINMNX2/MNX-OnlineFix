import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, Plus, Minus, Users, Crown, User, AlertTriangle, Edit2, Check, Camera, Signal } from 'lucide-react';
import { PeerInfo } from '../../shared/types';
import { EmptyState } from './EmptyState';
import { SquadSkeleton } from './Skeleton';

const pingColor = (ping?: number) => {
  if (ping === undefined) return 'text-gray-500';
  if (ping < 60) return 'text-emerald-400';
  if (ping < 140) return 'text-yellow-400';
  return 'text-red-400';
};

interface SquadManagerProps {
  discoveredPeers: PeerInfo[];
  onSquadChange: (squad: string[]) => void;
  myIP: string;
  currentHost: string;
  localVersion: string | null;
  playerName: string;
  avatarUrl?: string;
  isScanning?: boolean;
  onPlayerNameChange: (name: string) => void;
  onAvatarChange: () => void;
}

export const SquadManager: React.FC<SquadManagerProps> = ({ discoveredPeers, onSquadChange, myIP, currentHost, localVersion, playerName, avatarUrl, isScanning = false, onPlayerNameChange, onAvatarChange }) => {
    const [squad, setSquad] = useState<Set<string>>(new Set());
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempPlayerName, setTempPlayerName] = useState(playerName);
    const amHost = myIP === currentHost;

    useEffect(() => {
        setTempPlayerName(playerName);
    }, [playerName]);

    const handleNameSave = () => {
        onPlayerNameChange(tempPlayerName);
        setIsEditingName(false);
    };

    const toggleSquadMember = (ip: string) => {
        const newSquad = new Set(squad);
        if (newSquad.has(ip)) newSquad.delete(ip); else newSquad.add(ip);
        setSquad(newSquad);
        onSquadChange(Array.from(newSquad));
    };

    return (
        <div className="h-full p-4 bg-black/50 backdrop-blur-md border border-neon-red/30 rounded-lg flex flex-col">
            <h2 className="text-xl font-semibold mb-4 text-center text-gray-200 flex items-center justify-center">
                <Users className="w-5 h-5 mr-2" /> Squad Manager
            </h2>

            {/* Hacker Identity Section */}
            <div className="mb-4 p-2.5 bg-gray-900/50 rounded-lg border border-gray-700 flex items-center">
                <div className="relative group cursor-pointer" onClick={onAvatarChange}>
                    {avatarUrl ?
                        <img src={avatarUrl} alt="Avatar" className="w-12 h-12 rounded-full object-cover border-2 border-neon-red/50" /> :
                        <div className="w-12 h-12 rounded-full bg-black/50 border-2 border-gray-600 flex items-center justify-center">
                           <User className="w-6 h-6 text-gray-400" />
                        </div>
                    }
                    <div className="absolute inset-0 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="w-6 h-6 text-white" />
                    </div>
                </div>
                <div className="ml-4 flex-grow">
                     <div className="flex items-center justify-between">
                        {isEditingName ? (
                            <input
                                type="text"
                                value={tempPlayerName}
                                onChange={(e) => setTempPlayerName(e.target.value)}
                                onBlur={handleNameSave}
                                onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                                className="bg-transparent text-white w-full outline-none focus:ring-0 border-b border-neon-red"
                                autoFocus
                            />
                        ) : (
                            <span className="font-semibold text-white text-lg truncate">{playerName}</span>
                        )}
                        <motion.button whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }} onClick={() => isEditingName ? handleNameSave() : setIsEditingName(true)} className="p-1.5 text-gray-400 hover:text-white shrink-0">
                            {isEditingName ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                        </motion.button>
                    </div>
                    <p className="text-xs text-gray-500 flex items-center">
                        Hacker Identity
                        {amHost && <span className="ml-2 flex items-center text-yellow-400 text-[10px] font-bold"><Crown className="w-3 h-3 mr-0.5" /> HOST</span>}
                    </p>
                </div>
            </div>

            {/* My Node Row */}
            <div className="mb-3 p-2 rounded-md bg-gray-900/40 border border-gray-800 flex items-center justify-between">
                <div className="flex items-center">
                    <div className="relative mr-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-ring absolute inset-0" />
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>
                    <span className="font-mono text-xs text-gray-300">{myIP}</span>
                </div>
                <span className="text-[9px] font-mono text-emerald-400/80 border border-emerald-500/30 rounded px-1.5 py-0.5">YOU</span>
            </div>

            <div className="flex-grow space-y-2 overflow-y-auto pr-2 min-h-0">
                {isScanning && discoveredPeers.length === 0 ? (
                    <SquadSkeleton />
                ) : discoveredPeers.length === 0 ? (
                    <EmptyState
                        icon={Wifi}
                        title="Scanning network..."
                        description="Waiting for players on the local network"
                        accent="text-neon-red"
                    />
                ) : (
                    <AnimatePresence>
                        {discoveredPeers.map(peer => {
                            const isInSquad = squad.has(peer.ip);
                            const isHost = peer.ip === currentHost;
                            const isMe = peer.ip === myIP;
                            const versionMismatch = localVersion && peer.version && peer.version !== 'N/A' && peer.version !== localVersion;

                            if (isMe) return null;

                            return (
                                <motion.div key={peer.ip} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                                    className={`flex items-center justify-between p-2 rounded-md transition-colors duration-200 ${isInSquad ? 'bg-neon-red/20' : 'bg-gray-800/50'}`}>
                                    <div className="flex items-center min-w-0">
                                        {isHost ? <Crown className="w-4 h-4 mr-2 text-yellow-400 shrink-0" /> : <Wifi className={`w-4 h-4 mr-2 shrink-0 ${isInSquad ? 'text-neon-red' : 'text-gray-400'}`} />}
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-mono text-sm leading-tight truncate">{peer.ip}</span>
                                            <div className="flex items-center">
                                                <span className={`text-xs leading-tight ${versionMismatch ? 'text-yellow-400' : 'text-gray-500'}`}>{peer.version || '...'}</span>
                                                {versionMismatch && <AlertTriangle className="w-3 h-3 ml-1 text-yellow-400" />}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center shrink-0">
                                        <span className={`flex items-center mr-2 text-xs font-mono ${pingColor(peer.ping)}`}>
                                            <Signal className="w-3 h-3 mr-1" />
                                            {peer.ping === undefined ? '—' : `${peer.ping}`}
                                        </span>
                                        <motion.button whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }} onClick={() => toggleSquadMember(peer.ip)}
                                            className={`p-1.5 rounded-full ${isInSquad ? 'bg-red-500/50 hover:bg-red-500' : 'bg-green-500/50 hover:bg-green-500'}`}>
                                            {isInSquad ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                        </motion.button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
};

// FIX: Add default export to be used with React.lazy
export default SquadManager;
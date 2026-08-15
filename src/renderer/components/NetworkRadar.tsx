import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Upload, Download, Activity, Radio } from 'lucide-react';
import { NetworkStats } from '../../shared/types';

export interface RadarPeer {
  ip: string;
  ping?: number;
  isHost?: boolean;
}

interface NetworkRadarProps {
  peers: RadarPeer[];
  stats?: NetworkStats;
  isActive: boolean;
  playerName?: string;
  hostIp?: string;
}

const hashIp = (ip: string): number => {
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) >>> 0;
  return h;
};

const pingColor = (ping?: number) => {
  if (ping === undefined) return 'text-gray-500';
  if (ping < 60) return 'text-emerald-400';
  if (ping < 140) return 'text-yellow-400';
  return 'text-red-400';
};

export const NetworkRadar: React.FC<NetworkRadarProps> = ({ peers, stats, isActive, playerName, hostIp }) => {
  const positionedPeers = useMemo(() => {
    const maxPing = Math.max(60, ...peers.map((p) => p.ping ?? 60));
    return peers.map((peer) => {
      const angle = (hashIp(peer.ip) % 360) * (Math.PI / 180);
      const radiusPct = peer.ping === undefined ? 0.72 : 0.28 + (0.6 * (peer.ping ?? 60)) / maxPing;
      return {
        ...peer,
        x: 50 + Math.cos(angle) * 34 * radiusPct,
        y: 50 + Math.sin(angle) * 34 * radiusPct,
      };
    });
  }, [peers]);

  const fmt = (bytes: number) => {
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  return (
    <div className="w-full rounded-xl border border-gray-800 bg-black/50 backdrop-blur p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 flex items-center">
          <Radio className={`w-4 h-4 mr-2 ${isActive ? 'text-neon-red live-dot' : 'text-gray-600'}`} />
          Network Radar
        </p>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${isActive ? 'border-emerald-500/40 text-emerald-400' : 'border-gray-700 text-gray-500'}`}>
          {isActive ? 'LINK ACTIVE' : 'STANDBY'}
        </span>
      </div>

      <div className="flex items-center gap-5">
        {/* Radar */}
        <div className="relative w-36 h-36 shrink-0">
          <div className="absolute inset-0 rounded-full border border-neon-red/25" />
          <div className="absolute inset-[25%] rounded-full border border-neon-red/20" />
          <div className="absolute inset-[50%] rounded-full border border-neon-red/15" />

          {isActive && (
            <div
              className="radar-sweep absolute inset-0 rounded-full"
              style={{
                background: 'conic-gradient(from 0deg, rgba(255,0,0,0.001) 0deg, rgba(255,0,0,0.32) 55deg, transparent 90deg)',
              }}
            />
          )}

          {/* Center (me) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className={`absolute inset-0 rounded-full pulse-ring ${isActive ? 'bg-neon-red/30' : 'bg-gray-600/30'}`} />
            <div className={`relative w-3 h-3 rounded-full ${isActive ? 'bg-neon-red shadow-[0_0_10px_#ff0000]' : 'bg-gray-600'}`} />
          </div>

          {/* Peers */}
          {positionedPeers.map((peer) => (
            <motion.div
              key={peer.ip}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${peer.x}%`, top: `${peer.y}%` }}
              title={`${peer.ip} — ${peer.ping ?? '?'}ms`}
            >
              <div className={`w-2.5 h-2.5 rounded-full border ${peer.isHost ? 'bg-yellow-400 border-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.8)]' : 'bg-emerald-400 border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.8)]'}`} />
            </motion.div>
          ))}

          {/* Crosshair lines */}
          <div className="absolute top-1/2 left-0 w-full h-px bg-neon-red/10" />
          <div className="absolute left-1/2 top-0 h-full w-px bg-neon-red/10" />
        </div>

        {/* Stats */}
        <div className="flex-grow grid grid-cols-2 gap-2.5">
          <div className="rounded-lg bg-gray-900/60 border border-gray-800 p-3">
            <div className="flex items-center text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">
              <Upload className="w-3 h-3 mr-1.5 text-neon-red" /> Sent
            </div>
            <p className="font-mono text-sm text-white">{stats?.packetsSent ?? 0}</p>
            <p className="text-[10px] text-gray-600 font-mono">{fmt(stats?.bytesSent ?? 0)}</p>
          </div>
          <div className="rounded-lg bg-gray-900/60 border border-gray-800 p-3">
            <div className="flex items-center text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">
              <Download className="w-3 h-3 mr-1.5 text-emerald-400" /> Received
            </div>
            <p className="font-mono text-sm text-white">{stats?.packetsReceived ?? 0}</p>
            <p className="text-[10px] text-gray-600 font-mono">{fmt(stats?.bytesReceived ?? 0)}</p>
          </div>

          <div className="col-span-2 rounded-lg bg-gray-900/60 border border-gray-800 p-3">
            <div className="flex items-center text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1.5">
              <Activity className="w-3 h-3 mr-1.5 text-sky-400" /> Squad Links
            </div>
            <div className="space-y-1 max-h-16 overflow-y-auto pr-1">
              {positionedPeers.length === 0 && (
                <p className="text-[11px] text-gray-600 font-mono">No peers in squad yet</p>
              )}
              {positionedPeers.map((peer) => (
                <div key={peer.ip} className="flex items-center justify-between text-[11px] font-mono">
                  <span className="flex items-center gap-1.5 text-gray-400 truncate">
                    {peer.isHost && <span className="text-yellow-400">★</span>}
                    {peer.ip}
                  </span>
                  <span className={pingColor(peer.ping)}>{peer.ping === undefined ? '—' : `${peer.ping}ms`}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {(playerName || hostIp) && (
        <div className="mt-3 pt-2.5 border-t border-gray-800/70 flex items-center justify-between text-[10px] font-mono text-gray-600">
          <span>AGENT: <span className="text-gray-400">{playerName ?? '—'}</span></span>
          <span>HOST: <span className="text-gray-400">{hostIp ?? '—'}</span></span>
        </div>
      )}
    </div>
  );
};
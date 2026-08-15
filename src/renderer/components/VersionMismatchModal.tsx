import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { PeerInfo } from '../../shared/types';
import { ModalShell } from './ModalShell';

interface VersionMismatchModalProps {
  isOpen: boolean;
  localVersion: string | null;
  mismatchedPeers: PeerInfo[];
  onConfirm: () => void;
  onCancel: () => void;
}

export const VersionMismatchModal: React.FC<VersionMismatchModalProps> = ({ isOpen, localVersion, mismatchedPeers, onConfirm, onCancel }) => {
  return (
    <ModalShell isOpen={isOpen} onClose={onCancel} tone="warning" maxWidth="lg">
      <div className="flex items-start">
        <div className="p-3 bg-yellow-500/20 rounded-full mr-6 shrink-0">
          <AlertTriangle className="w-8 h-8 text-yellow-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white mb-2">Version Mismatch Detected</h2>
          <p className="text-gray-400 mb-6 text-sm leading-relaxed">
            One or more players in your squad have a different game version. This may cause instability, crashes, or prevent connection entirely.
          </p>
          <div className="space-y-3 bg-black/40 p-4 rounded-lg text-sm">
            <div className="flex justify-between font-semibold">
              <span>Your Version:</span>
              <span className="text-green-400 font-mono">{localVersion ?? 'Unknown'}</span>
            </div>
            <hr className="border-gray-700" />
            {mismatchedPeers.map(peer => (
              <div key={peer.ip} className="flex justify-between">
                <span className="font-mono">{peer.ip}:</span>
                <span className="text-yellow-400 font-mono">{peer.version}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end space-x-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onCancel}
          className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold transition-colors"
        >
          Cancel
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onConfirm}
          className="px-6 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white font-semibold transition-colors shadow-lg shadow-yellow-500/20"
        >
          Connect Anyway
        </motion.button>
      </div>
    </ModalShell>
  );
};

// FIX: Add default export to be used with React.lazy
export default VersionMismatchModal;
import React, { useState } from 'react';
import { Flame, Minus, X, Square, Copy, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { openCommandPalette } from './CommandPalette';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  const handleMinimize = () => window.electron.windowMinimize();
  const handleMaximize = () => {
    setIsMaximized((v) => !v);
    window.electron.windowMaximize();
  };
  const handleClose = () => window.electron.windowClose();

  return (
    <div
      style={{ ['--webkit-app-region' as any]: 'drag' }}
      className="h-10 bg-black/80 flex items-center justify-between px-2 shrink-0 border-b border-gray-900/80"
    >
      <div className="flex items-center text-gray-300">
        <Flame className="text-neon-red w-5 h-5 mr-2 glow-flicker" />
        <span className="font-semibold text-sm tracking-wide">MNX ONLINE FIX</span>
      </div>

      <div className="flex items-center space-x-1" style={{ ['--webkit-app-region' as any]: 'no-drag' }}>
        <motion.button
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
          whileTap={{ scale: 0.9 }}
          onClick={openCommandPalette}
          title="Command Palette (Ctrl+K)"
          className="p-2 rounded-md text-gray-400 hover:text-white transition-colors"
        >
          <Search size={15} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
          whileTap={{ scale: 0.9 }}
          onClick={handleMinimize}
          className="p-2 rounded-md text-gray-400 hover:text-white transition-colors"
        >
          <Minus size={16} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
          whileTap={{ scale: 0.9 }}
          onClick={handleMaximize}
          className="p-2 rounded-md text-gray-400 hover:text-white transition-colors"
        >
          {isMaximized ? <Copy size={14} /> : <Square size={13} />}
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(255, 0, 0, 0.4)' }}
          whileTap={{ scale: 0.9 }}
          onClick={handleClose}
          className="p-2 rounded-md text-gray-400 hover:text-white transition-colors"
        >
          <X size={16} />
        </motion.button>
      </div>
    </div>
  );
};
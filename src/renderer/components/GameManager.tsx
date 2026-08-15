import React, { useState } from 'react';
import { Game } from '../../shared/types';
import { PlusCircle, Gamepad2, ChevronRight, FolderOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { GameListSkeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

interface GameManagerProps {
  games: Game[];
  selectedGame: Game | null;
  isLoading?: boolean;
  onSelectGame: (game: Game) => void;
  onAddGame: () => void;
  onAddGamePath: (path: string) => void;
}

export const GameManager: React.FC<GameManagerProps> = ({ games, selectedGame, isLoading = false, onSelectGame, onAddGame, onAddGamePath }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const path = window.electron.getPathForFile(file);
    if (path) {
      onAddGamePath(path);
    } else {
      console.warn('[DnD] Could not resolve dropped file path.');
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative h-full p-4 bg-black/50 backdrop-blur-md border rounded-lg flex flex-col transition-all duration-300 ${
        isDragging ? 'border-neon-red drop-active-border' : 'border-neon-red/30'
      }`}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 rounded-lg bg-neon-red/10 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-14 h-14 rounded-full bg-neon-red/25 border border-neon-red flex items-center justify-center mb-3"
          >
            <FolderOpen className="w-7 h-7 text-neon-red" />
          </motion.div>
          <p className="text-white font-bold tracking-wider">DROP TO ADD GAME</p>
          <p className="text-xs text-gray-400 mt-1">Release to import the game folder</p>
        </div>
      )}

      <h2 className="text-xl font-semibold mb-4 text-center text-gray-200">Game Library</h2>

      <div className="flex-grow space-y-2 overflow-y-auto pr-2 min-h-0">
        {isLoading ? (
          <GameListSkeleton />
        ) : games.length === 0 ? (
          <EmptyState
            icon={Gamepad2}
            title="No games loaded"
            description="Add a game folder containing steam_api64.dll to begin"
            accent="text-neon-red"
          />
        ) : (
          games.map((game) => {
            const selected = selectedGame?.path === game.path;
            return (
              <motion.div
                key={game.path}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
                onClick={() => onSelectGame(game)}
                className={`group flex items-center p-3 rounded-md cursor-pointer transition-all duration-200 border-2 ${
                  selected
                    ? 'bg-neon-red/20 border-neon-red shadow-[0_0_18px_rgba(255,0,0,0.25)]'
                    : 'bg-gray-800/50 border-transparent hover:bg-gray-700/70'
                }`}
              >
                <Gamepad2 className={`w-5 h-5 mr-3 shrink-0 ${selected ? 'text-neon-red' : 'text-gray-400 group-hover:text-gray-200'}`} />
                <span className="font-medium truncate flex-grow">{game.name}</span>
                <ChevronRight className={`w-4 h-4 shrink-0 transition-all ${selected ? 'text-neon-red opacity-100' : 'text-gray-600 opacity-0 group-hover:opacity-100'}`} />
              </motion.div>
            );
          })
        )}
      </div>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
        onClick={onAddGame}
        className="mt-4 w-full flex items-center justify-center p-3 bg-neon-red/80 hover:bg-neon-red text-white font-bold rounded-lg transition-all duration-200 shadow-lg shadow-neon-red/30"
      >
        <PlusCircle className="w-5 h-5 mr-2" />
        Add Game
      </motion.button>
      <p className="text-[10px] text-gray-600 text-center mt-2 font-mono">or drag & drop a game folder</p>
    </div>
  );
};

// FIX: Add default export to be used with React.lazy
export default GameManager;
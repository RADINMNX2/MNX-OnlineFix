import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, CornerDownLeft, FolderX } from 'lucide-react';

export interface CommandItem {
  id: string;
  section: string;
  label: string;
  hint?: string;
  icon: React.ElementType;
  keywords?: string;
  onSelect: () => void;
}

interface CommandPaletteProps {
  commands: CommandItem[];
}

const OPEN_EVENT = 'mnx:open-palette';

export const openCommandPalette = () => {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
};

const normalize = (s: string) => s.toLowerCase().trim();

const scoreItem = (item: CommandItem, query: string): number => {
  if (!query) return 1;
  const haystack = normalize(`${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`);
  const q = normalize(query);
  if (haystack.startsWith(q)) return 100;
  if (normalize(item.label).includes(q)) return 80;
  if (haystack.includes(q)) return 60;
  return -1;
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({ commands }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    const onOpen = () => setIsOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [isOpen]);

  const filtered = useMemo(() => {
    const scored = commands
      .map((item) => ({ item, score: scoreItem(item, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));
    return scored.map((entry) => entry.item);
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    const selectedEl = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[selectedIndex];
        if (item) {
          item.onSelect();
          setIsOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, filtered, selectedIndex]);

  const sections = useMemo(() => {
    const order: string[] = [];
    const grouped: Record<string, CommandItem[]> = {};
    for (const item of filtered) {
      if (!grouped[item.section]) {
        grouped[item.section] = [];
        order.push(item.section);
      }
      grouped[item.section].push(item);
    }
    return order.map((section) => ({ section, items: grouped[section] }));
  }, [filtered]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-md flex items-start justify-center px-4 pt-[12vh]"
          onClick={() => setIsOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-gray-900/90 backdrop-blur-2xl border border-neon-red/40 rounded-2xl overflow-hidden shadow-2xl shadow-neon-red/10"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
              <Search className="w-5 h-5 text-neon-red" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search games, actions..."
                className="flex-grow bg-transparent outline-none text-white text-lg placeholder-gray-500"
              />
              <kbd className="px-2 py-1 rounded-md bg-black/50 border border-gray-700 text-[10px] font-mono text-gray-400">ESC</kbd>
            </div>

            <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
              {sections.length === 0 && (
                <div className="flex flex-col items-center py-12 text-center">
                  <FolderX className="w-10 h-10 text-gray-600 mb-3" />
                  <p className="text-sm text-gray-400">No matches for "{query}"</p>
                </div>
              )}

              {sections.map(({ section, items }) => (
                <div key={section}>
                  <p className="px-5 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
                    {section}
                  </p>
                  {items.map((item, localIdx) => {
                    const globalIdx = filtered.indexOf(item);
                    const selected = globalIdx === selectedIndex;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        data-selected={selected}
                        onClick={() => { item.onSelect(); setIsOpen(false); }}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors ${
                          selected ? 'bg-neon-red/15 border-l-2 border-neon-red' : 'border-l-2 border-transparent'
                        }`}
                      >
                        <Icon className={`w-4.5 h-4.5 shrink-0 ${selected ? 'text-neon-red' : 'text-gray-500'}`} />
                        <span className={`flex-grow truncate text-sm ${selected ? 'text-white font-semibold' : 'text-gray-300'}`}>
                          {item.label}
                        </span>
                        {item.hint && <span className="text-xs text-gray-500 font-mono shrink-0">{item.hint}</span>}
                        {selected && <CornerDownLeft className="w-3.5 h-3.5 text-neon-red shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 px-5 py-2.5 border-t border-gray-800 text-[10px] text-gray-500 font-mono">
              <span>↑↓ navigate</span>
              <span className="text-neon-red">↵ select</span>
              <span>esc close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
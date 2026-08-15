import React, { useRef, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Pin, PinOff, Eraser, CircleDot, Circle, TriangleAlert, CircleCheck } from 'lucide-react';
import { LogEntry, LogLevel } from '../../shared/types';

interface ConsoleOutputProps {
  logs: LogEntry[];
  onClear?: () => void;
}

const LEVEL_META: Record<LogLevel, { icon: React.ElementType; color: string; label: string }> = {
  info: { icon: Circle, color: 'text-green-400', label: 'INFO' },
  success: { icon: CircleCheck, color: 'text-emerald-300', label: 'OK' },
  warn: { icon: TriangleAlert, color: 'text-yellow-400', label: 'WARN' },
  error: { icon: CircleDot, color: 'text-red-400', label: 'ERR' },
};

type Filter = 'all' | LogLevel;

export const ConsoleOutput: React.FC<ConsoleOutputProps> = ({ logs, onClear }) => {
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [pinned, setPinned] = useState(true);

  const filteredLogs = useMemo(
    () => (filter === 'all' ? logs : logs.filter((l) => l.level === filter)),
    [logs, filter]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: logs.length, info: 0, success: 0, warn: 0, error: 0 };
    for (const l of logs) c[l.level]++;
    return c;
  }, [logs]);

  useEffect(() => {
    if (pinned) consoleEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [filteredLogs.length, pinned, filter]);

  const time = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const filterChip = (key: Filter, label: string) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all ${
        filter === key
          ? 'bg-neon-red/25 text-white border border-neon-red/50'
          : 'bg-black/40 text-gray-500 border border-gray-800 hover:text-gray-300 hover:border-gray-600'
      }`}
    >
      {label} <span className="opacity-60">{counts[key] ?? 0}</span>
    </button>
  );

  return (
    <div className="h-32 bg-black/60 backdrop-blur-sm border border-gray-800 rounded-lg flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-gray-800/70">
        <h3 className="text-sm font-semibold text-gray-400 flex items-center">
          <Terminal className="w-4 h-4 mr-2" /> C++ Core Monitor
          {logs.length > 0 && <span className="ml-2 w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />}
        </h3>
        <div className="flex items-center gap-1.5">
          {filterChip('all', 'ALL')}
          {filterChip('info', 'INF')}
          {filterChip('success', 'OK')}
          {filterChip('warn', 'WRN')}
          {filterChip('error', 'ERR')}
          <button
            onClick={() => setPinned((v) => !v)}
            title={pinned ? 'Unpin auto-scroll' : 'Pin auto-scroll'}
            className={`ml-1 p-1 rounded-md transition-colors ${pinned ? 'text-neon-red' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {pinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>
          {onClear && (
            <button
              onClick={onClear}
              title="Clear console"
              className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-grow font-mono text-xs overflow-y-auto px-3 py-1.5">
        <AnimatePresence initial={false}>
          {filteredLogs.map((log, i) => {
            const meta = LEVEL_META[log.level];
            const Icon = meta.icon;
            return (
              <motion.div
                key={`${log.ts}-${i}`}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-start gap-2 leading-relaxed"
              >
                <span className="text-gray-600 shrink-0">{time(log.ts)}</span>
                <Icon className={`w-3 h-3 mt-1 shrink-0 ${meta.color}`} />
                <span className={`whitespace-pre-wrap break-all ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-300/90' : 'text-green-400/90'}`}>
                  {log.message}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={consoleEndRef} />
      </div>
    </div>
  );
};
// FIX: Add default export to be used with React.lazy
export default ConsoleOutput;